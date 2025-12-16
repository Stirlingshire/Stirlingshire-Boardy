import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlacementStatus, IntroductionStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { IntroductionsService } from '../introductions/introductions.service';
import {
  NotificationsService,
  PlacementNotification,
} from '../notifications/notifications.service';
import { SlackService } from '../notifications/slack.service';
import { CreatePlacementDto, QueryPlacementDto, UpdatePlacementDto } from './dto';

interface PlacementTerms {
  feePercentage?: number;
  flatFee?: number;
  attributionWindowMonths?: number;
  [key: string]: unknown;
}

@Injectable()
export class PlacementsService {
  private readonly logger = new Logger(PlacementsService.name);
  private readonly defaultAttributionWindowMonths: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly introductionsService: IntroductionsService,
    private readonly notificationsService: NotificationsService,
    private readonly slackService: SlackService,
    private readonly configService: ConfigService,
  ) {
    this.defaultAttributionWindowMonths =
      this.configService.get<number>('ATTRIBUTION_WINDOW_MONTHS') || 12;
  }

  async create(dto: CreatePlacementDto) {
    // Get the introduction
    const introduction = await this.prisma.introduction.findUnique({
      where: { id: dto.introductionId },
      include: { vendor: true },
    });

    if (!introduction) {
      throw new NotFoundException(
        `Introduction with ID "${dto.introductionId}" not found`,
      );
    }

    if (introduction.status !== IntroductionStatus.OPEN) {
      throw new BadRequestException(
        `Introduction is not in OPEN status (current: ${introduction.status})`,
      );
    }

    // Get the hire
    const hire = await this.prisma.hire.findUnique({
      where: { id: dto.hireId },
    });

    if (!hire) {
      throw new NotFoundException(`Hire with ID "${dto.hireId}" not found`);
    }

    // Verify CRD match
    if (introduction.candidateCrd !== hire.crdNumber) {
      throw new BadRequestException(
        `CRD mismatch: Introduction CRD ${introduction.candidateCrd} does not match Hire CRD ${hire.crdNumber}`,
      );
    }

    // Check attribution window
    const terms = (introduction.vendor.placementTerms as PlacementTerms) || {};
    const attributionMonths =
      terms.attributionWindowMonths || this.defaultAttributionWindowMonths;

    const introDate = new Date(introduction.introTimestamp);
    const hireDate = new Date(hire.hireDate);
    const monthsDiff =
      (hireDate.getFullYear() - introDate.getFullYear()) * 12 +
      (hireDate.getMonth() - introDate.getMonth());

    if (monthsDiff > attributionMonths) {
      throw new BadRequestException(
        `Hire date is outside attribution window (${attributionMonths} months from introduction)`,
      );
    }

    // Calculate fee
    let feeAmount = dto.feeAmount;
    if (feeAmount === undefined) {
      if (terms.flatFee) {
        feeAmount = terms.flatFee;
      } else if (terms.feePercentage) {
        // Default to a placeholder if no salary data
        feeAmount = 0;
      } else {
        feeAmount = 0;
      }
    }

    // Create placement
    const placement = await this.prisma.placement.create({
      data: {
        vendorId: introduction.vendorId,
        introductionId: dto.introductionId,
        hireId: dto.hireId,
        candidateCrd: hire.crdNumber,
        hireDate: hire.hireDate,
        feeAmount: new Decimal(feeAmount),
        feeCurrency: dto.feeCurrency || 'USD',
        termsSnapshot: JSON.parse(JSON.stringify(terms)),
        status: PlacementStatus.PENDING_NOTIFY,
      },
      include: {
        vendor: { select: { id: true, name: true } },
        introduction: true,
        hire: true,
      },
    });

    // Update introduction status to PLACED
    await this.prisma.introduction.update({
      where: { id: dto.introductionId },
      data: { status: IntroductionStatus.PLACED },
    });

    await this.auditService.log({
      entityType: 'PLACEMENT',
      entityId: placement.id,
      eventType: 'CREATED',
      newValue: {
        candidateCrd: Number(placement.candidateCrd),
        vendorId: placement.vendorId,
        hireId: placement.hireId,
        introductionId: placement.introductionId,
        feeAmount: feeAmount,
      },
      source: 'SYSTEM',
    });

    await this.auditService.log({
      entityType: 'INTRODUCTION',
      entityId: dto.introductionId,
      eventType: 'STATUS_CHANGED',
      oldValue: { status: IntroductionStatus.OPEN },
      newValue: { status: IntroductionStatus.PLACED },
      source: 'SYSTEM',
    });

    // Notify vendor
    const placementWithRelations = placement as typeof placement & {
      introduction: { introTimestamp: Date; conversationId: string };
      vendor: { name: string };
    };

    const notification: PlacementNotification = {
      placementId: placement.id,
      candidateCrd: Number(placement.candidateCrd),
      candidateName: `${hire.firstName} ${hire.lastName}`,
      hireDate: hire.hireDate.toISOString().split('T')[0],
      firmEntity: hire.firmEntity,
      introductionId: placement.introductionId,
      introTimestamp: placementWithRelations.introduction.introTimestamp.toISOString(),
      conversationId: placementWithRelations.introduction.conversationId,
      feeAmount: placement.feeAmount.toString(),
      feeCurrency: placement.feeCurrency,
    };

    const notified = await this.notificationsService.notifyVendorOfPlacement(
      placement.vendorId,
      notification,
    );

    if (notified) {
      await this.prisma.placement.update({
        where: { id: placement.id },
        data: { status: PlacementStatus.NOTIFIED },
      });
    }

    // Send internal notification
    await this.notificationsService.sendInternalNotification({
      type: 'NEW_PLACEMENT',
      message: `New placement created: ${hire.firstName} ${hire.lastName} (CRD: ${hire.crdNumber})`,
      data: {
        placementId: placement.id,
        candidateName: `${hire.firstName} ${hire.lastName}`,
        candidateCrd: Number(hire.crdNumber),
        vendor: placementWithRelations.vendor.name,
        firmEntity: hire.firmEntity,
        hireDate: hire.hireDate.toISOString().split('T')[0],
      },
    });

    // Send Slack notification for placement
    await this.slackService.notifyNewPlacement({
      candidateName: `${hire.firstName} ${hire.lastName}`,
      candidateCrd: Number(hire.crdNumber),
      vendorName: placementWithRelations.vendor.name,
      recruiterName: introduction.recruiterName || undefined,
      firmEntity: hire.firmEntity,
      hireDate: hire.hireDate.toISOString().split('T')[0],
      introDate: introduction.introTimestamp.toISOString().split('T')[0],
      placementId: placement.id,
      feeAmount: placement.feeAmount.toString(),
    });

    this.logger.log(
      `Created placement ${placement.id} for CRD ${hire.crdNumber}`,
    );

    return this.serializePlacement(placement);
  }

  async matchHireToIntroductions(hireId: string): Promise<string | null | unknown> {
    const hire = await this.prisma.hire.findUnique({
      where: { id: hireId },
    });

    if (!hire) {
      throw new NotFoundException(`Hire with ID "${hireId}" not found`);
    }

    // Find open introductions for this CRD
    const openIntros =
      await this.introductionsService.findOpenIntroductionsForCrd(
        hire.crdNumber,
      );

    if (openIntros.length === 0) {
      this.logger.log(
        `No open introductions found for CRD ${hire.crdNumber}`,
      );
      return null;
    }

    // Find the best matching introduction (first one within attribution window)
    for (const intro of openIntros) {
      const terms = (intro.vendor.placementTerms as PlacementTerms) || {};
      const attributionMonths =
        terms.attributionWindowMonths || this.defaultAttributionWindowMonths;

      const introDate = new Date(intro.introTimestamp);
      const hireDate = new Date(hire.hireDate);
      const monthsDiff =
        (hireDate.getFullYear() - introDate.getFullYear()) * 12 +
        (hireDate.getMonth() - introDate.getMonth());

      if (monthsDiff <= attributionMonths && hireDate >= introDate) {
        // Create placement
        const placement = await this.create({
          introductionId: intro.id,
          hireId: hire.id,
        });

        return placement.id;
      }
    }

    this.logger.log(
      `No matching introduction within attribution window for CRD ${hire.crdNumber}`,
    );
    return null;
  }

  async findAll(query: QueryPlacementDto) {
    const {
      skip = 0,
      take = 50,
      vendorId,
      candidateCrd,
      status,
      fromDate,
      toDate,
    } = query;

    const where: Record<string, unknown> = {};

    if (vendorId) where.vendorId = vendorId;
    if (candidateCrd) where.candidateCrd = BigInt(candidateCrd);
    if (status) where.status = status;
    if (fromDate || toDate) {
      where.hireDate = {};
      if (fromDate) {
        (where.hireDate as Record<string, Date>).gte = new Date(fromDate);
      }
      if (toDate) {
        (where.hireDate as Record<string, Date>).lte = new Date(toDate);
      }
    }

    const [placements, total] = await Promise.all([
      this.prisma.placement.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          vendor: { select: { id: true, name: true } },
          introduction: {
            select: {
              id: true,
              conversationId: true,
              introTimestamp: true,
              candidateFirstName: true,
              candidateLastName: true,
            },
          },
          hire: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              firmEntity: true,
            },
          },
        },
      }),
      this.prisma.placement.count({ where }),
    ]);

    return {
      data: placements.map((p) => this.serializePlacement(p)),
      meta: {
        total,
        skip,
        take,
        hasMore: skip + take < total,
      },
    };
  }

  async findOne(id: string) {
    const placement = await this.prisma.placement.findUnique({
      where: { id },
      include: {
        vendor: { select: { id: true, name: true } },
        introduction: true,
        hire: true,
      },
    });

    if (!placement) {
      throw new NotFoundException(`Placement with ID "${id}" not found`);
    }

    return this.serializePlacement(placement);
  }

  async update(id: string, dto: UpdatePlacementDto) {
    const existing = await this.prisma.placement.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`Placement with ID "${id}" not found`);
    }

    const placement = await this.prisma.placement.update({
      where: { id },
      data: { status: dto.status },
      include: {
        vendor: { select: { id: true, name: true } },
        introduction: true,
        hire: true,
      },
    });

    await this.auditService.log({
      entityType: 'PLACEMENT',
      entityId: id,
      eventType: 'STATUS_CHANGED',
      oldValue: { status: existing.status },
      newValue: { status: dto.status },
      source: 'INTERNAL_API',
    });

    return this.serializePlacement(placement);
  }

  async getSummaryStats() {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const [total, last30Days, last90Days, byStatus, byVendor] =
      await Promise.all([
        this.prisma.placement.count(),
        this.prisma.placement.count({
          where: { createdAt: { gte: thirtyDaysAgo } },
        }),
        this.prisma.placement.count({
          where: { createdAt: { gte: ninetyDaysAgo } },
        }),
        this.prisma.placement.groupBy({
          by: ['status'],
          _count: true,
        }),
        this.prisma.placement.groupBy({
          by: ['vendorId'],
          _count: true,
        }),
      ]);

    // Get vendor names for the summary
    const vendorIds = byVendor.map((v) => v.vendorId);
    const vendors = await this.prisma.vendor.findMany({
      where: { id: { in: vendorIds } },
      select: { id: true, name: true },
    });

    const vendorMap = new Map(vendors.map((v) => [v.id, v.name]));

    return {
      total,
      last30Days,
      last90Days,
      byStatus: byStatus.reduce(
        (acc, item) => {
          acc[item.status] = item._count;
          return acc;
        },
        {} as Record<string, number>,
      ),
      byVendor: byVendor.map((item) => ({
        vendorId: item.vendorId,
        vendorName: vendorMap.get(item.vendorId) || 'Unknown',
        count: item._count,
      })),
    };
  }

  private serializePlacement(placement: Record<string, unknown>) {
    const serialized = { ...placement };
    if (serialized.candidateCrd) {
      serialized.candidateCrd = Number(serialized.candidateCrd);
    }
    if (serialized.feeAmount) {
      serialized.feeAmount = Number(serialized.feeAmount);
    }
    return serialized;
  }
}
