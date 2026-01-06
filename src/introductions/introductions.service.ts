import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { IntroductionStatus, MeetingStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SlackService } from '../notifications/slack.service';
import { CalendarService } from '../calendar/calendar.service';
import { CalendlyService } from '../calendar/calendly.service';
import {
  CreateIntroductionDto,
  QueryIntroductionDto,
  UpdateIntroductionDto,
} from './dto';

@Injectable()
export class IntroductionsService {
  private readonly logger = new Logger(IntroductionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly slackService: SlackService,
    private readonly calendarService: CalendarService,
    private readonly calendlyService: CalendlyService,
  ) {}

  async create(vendorId: string, dto: CreateIntroductionDto) {
    // Check for idempotency - same vendor, CRD, and conversation ID
    const existing = await this.prisma.introduction.findUnique({
      where: {
        vendorId_candidateCrd_conversationId: {
          vendorId,
          candidateCrd: BigInt(dto.candidateCrd),
          conversationId: dto.conversationId,
        },
      },
    });

    if (existing) {
      // Return existing introduction for idempotency
      this.logger.log(
        `Introduction already exists for CRD ${dto.candidateCrd}, conversation ${dto.conversationId}`,
      );
      return this.serializeIntroduction(existing);
    }

    // Book meeting if meeting time is provided
    let meetingData: {
      meetingStartTime?: Date;
      meetingEndTime?: Date;
      meetingZoomLink?: string;
      meetingZoomId?: string;
      meetingCalendarId?: string;
      meetingStatus?: MeetingStatus;
    } = {};

    if (dto.meetingStartTime) {
      const meetingDuration = dto.meetingDuration || 30;
      const candidateName = `${dto.firstName} ${dto.lastName}`;

      try {
        const booking = await this.calendarService.bookMeeting({
          startTime: dto.meetingStartTime,
          duration: meetingDuration,
          subject: `Introductory Call: ${candidateName} (CRD: ${dto.candidateCrd})`,
          body: `<p>Introductory call with financial advisor ${candidateName}</p>
                 <p><strong>CRD Number:</strong> ${dto.candidateCrd}</p>
                 ${dto.email ? `<p><strong>Email:</strong> ${dto.email}</p>` : ''}
                 ${dto.phone ? `<p><strong>Phone:</strong> ${dto.phone}</p>` : ''}
                 ${dto.linkedin ? `<p><strong>LinkedIn:</strong> <a href="${dto.linkedin}">${dto.linkedin}</a></p>` : ''}`,
          candidateEmail: dto.email,
        });

        if (booking) {
          const startTime = new Date(dto.meetingStartTime);
          const endTime = new Date(startTime.getTime() + meetingDuration * 60 * 1000);

          meetingData = {
            meetingStartTime: startTime,
            meetingEndTime: endTime,
            meetingZoomLink: booking.zoomLink || undefined,
            meetingZoomId: booking.zoomLink?.match(/\/j\/(\d+)/)?.[1] || undefined,
            meetingCalendarId: booking.eventId || undefined,
            meetingStatus: MeetingStatus.SCHEDULED,
          };

          this.logger.log(`Meeting booked for ${candidateName}: ${booking.zoomLink}`);
        }
      } catch (error) {
        this.logger.error(`Failed to book meeting: ${error.message}`);
        // Continue creating introduction even if meeting booking fails
      }
    }

    const introduction = await this.prisma.introduction.create({
      data: {
        vendorId,
        candidateCrd: BigInt(dto.candidateCrd),
        candidateFirstName: dto.firstName,
        candidateLastName: dto.lastName,
        candidatePhone: dto.phone,
        candidateEmail: dto.email,
        candidateLinkedin: dto.linkedin,
        introTimestamp: new Date(dto.introTimestamp),
        recruiterName: dto.recruiterName,
        conversationId: dto.conversationId,
        metadata: dto.metadata ?? undefined,
        status: IntroductionStatus.OPEN,
        ...meetingData,
      },
    });

    await this.auditService.log({
      entityType: 'INTRODUCTION',
      entityId: introduction.id,
      eventType: 'CREATED',
      newValue: {
        candidateCrd: dto.candidateCrd,
        candidateName: `${dto.firstName} ${dto.lastName}`,
        conversationId: dto.conversationId,
        vendorId,
      },
      source: 'BOARDY_API',
    });

    // Get vendor name for Slack notification
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { name: true },
    });

    // Get Calendly booking URL if no meeting was scheduled
    // Include CRD in UTM params so webhooks can match back to this introduction
    let calendlyUrl: string | undefined;
    if (!meetingData.meetingZoomLink && this.calendlyService.isConfigured()) {
      const candidateName = `${dto.firstName} ${dto.lastName}`;
      calendlyUrl =
        (await this.calendlyService.getBookingUrl(candidateName, dto.candidateCrd)) ||
        undefined;
    }

    // Send Slack notification
    await this.slackService.notifyNewIntroduction({
      candidateName: `${dto.firstName} ${dto.lastName}`,
      candidateCrd: dto.candidateCrd,
      vendorName: vendor?.name || 'Unknown Vendor',
      recruiterName: dto.recruiterName,
      email: dto.email,
      phone: dto.phone,
      linkedin: dto.linkedin,
      conversationId: dto.conversationId,
      meetingTime: meetingData.meetingStartTime?.toISOString(),
      meetingZoomLink: meetingData.meetingZoomLink,
      calendlyUrl,
    });

    this.logger.log(
      `Created introduction for CRD ${dto.candidateCrd} from vendor ${vendorId}`,
    );

    return this.serializeIntroduction(introduction);
  }

  async findAll(vendorId: string, query: QueryIntroductionDto) {
    const { skip = 0, take = 50, candidateCrd, status, fromDate, toDate } = query;

    const where: Record<string, unknown> = { vendorId };

    if (candidateCrd) {
      where.candidateCrd = BigInt(candidateCrd);
    }
    if (status) {
      where.status = status;
    }
    if (fromDate || toDate) {
      where.introTimestamp = {};
      if (fromDate) {
        (where.introTimestamp as Record<string, Date>).gte = new Date(fromDate);
      }
      if (toDate) {
        (where.introTimestamp as Record<string, Date>).lte = new Date(toDate);
      }
    }

    const [introductions, total] = await Promise.all([
      this.prisma.introduction.findMany({
        where,
        skip,
        take,
        orderBy: { introTimestamp: 'desc' },
        include: {
          placement: {
            select: {
              id: true,
              status: true,
              hireDate: true,
            },
          },
        },
      }),
      this.prisma.introduction.count({ where }),
    ]);

    return {
      data: introductions.map((intro) => this.serializeIntroduction(intro)),
      meta: {
        total,
        skip,
        take,
        hasMore: skip + take < total,
      },
    };
  }

  async findOne(vendorId: string, id: string) {
    const introduction = await this.prisma.introduction.findFirst({
      where: { id, vendorId },
      include: {
        placement: true,
        vendor: {
          select: { id: true, name: true },
        },
      },
    });

    if (!introduction) {
      throw new NotFoundException(`Introduction with ID "${id}" not found`);
    }

    return this.serializeIntroduction(introduction);
  }

  async findByCrd(vendorId: string, crd: number) {
    const introductions = await this.prisma.introduction.findMany({
      where: {
        vendorId,
        candidateCrd: BigInt(crd),
      },
      orderBy: { introTimestamp: 'desc' },
      include: {
        placement: {
          select: {
            id: true,
            status: true,
            hireDate: true,
          },
        },
      },
    });

    return introductions.map((intro) => this.serializeIntroduction(intro));
  }

  async updateStatus(
    vendorId: string,
    id: string,
    dto: UpdateIntroductionDto,
    source: 'BOARDY_API' | 'INTERNAL_API' | 'SYSTEM' = 'BOARDY_API',
  ) {
    const existing = await this.prisma.introduction.findFirst({
      where: { id, vendorId },
    });

    if (!existing) {
      throw new NotFoundException(`Introduction with ID "${id}" not found`);
    }

    if (dto.status && existing.status === dto.status) {
      return this.serializeIntroduction(existing);
    }

    const introduction = await this.prisma.introduction.update({
      where: { id },
      data: { status: dto.status },
    });

    await this.auditService.log({
      entityType: 'INTRODUCTION',
      entityId: id,
      eventType: 'STATUS_CHANGED',
      oldValue: { status: existing.status },
      newValue: { status: dto.status },
      source,
    });

    return this.serializeIntroduction(introduction);
  }

  async findOpenIntroductionsForCrd(crd: bigint) {
    return this.prisma.introduction.findMany({
      where: {
        candidateCrd: crd,
        status: IntroductionStatus.OPEN,
      },
      include: {
        vendor: {
          select: {
            id: true,
            name: true,
            placementTerms: true,
            webhookUrl: true,
          },
        },
      },
      orderBy: { introTimestamp: 'asc' },
    });
  }

  private serializeIntroduction(introduction: Record<string, unknown>) {
    return {
      ...introduction,
      candidateCrd: Number(introduction.candidateCrd),
    };
  }
}
