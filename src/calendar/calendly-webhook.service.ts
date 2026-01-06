import { Injectable, Logger } from '@nestjs/common';
import { MeetingStatus, IntroductionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SlackService } from '../notifications/slack.service';
import {
  CalendlyWebhookPayloadDto,
  CalendlyWebhookResult,
} from './dto/calendly-webhook.dto';

@Injectable()
export class CalendlyWebhookService {
  private readonly logger = new Logger(CalendlyWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly slackService: SlackService,
  ) {}

  async handleInviteeCreated(
    payload: CalendlyWebhookPayloadDto,
  ): Promise<CalendlyWebhookResult> {
    const invitee = payload.payload;
    const scheduledEvent = invitee.scheduled_event;

    this.logger.log(
      `Processing invitee.created webhook for ${invitee.email} - event: ${scheduledEvent.name}`,
    );

    // Extract CRD from UTM params if available
    const crd = this.extractCrdFromTracking(invitee.tracking);

    // Find the introduction to update
    const introduction = await this.findIntroductionByEmailOrCrd(
      invitee.email,
      crd,
    );

    if (!introduction) {
      this.logger.warn(
        `No matching introduction found for email: ${invitee.email}, CRD: ${crd || 'N/A'}`,
      );
      return {
        success: false,
        message: `No matching introduction found for ${invitee.email}`,
      };
    }

    // Check if this webhook was already processed (idempotency)
    if (introduction.meetingCalendlyInviteeUri === invitee.uri) {
      this.logger.log(
        `Webhook already processed for invitee ${invitee.uri} - skipping`,
      );
      return {
        success: true,
        introductionId: introduction.id,
        message: 'Webhook already processed',
      };
    }

    // Extract Zoom link from location
    const zoomLink = scheduledEvent.location?.join_url;

    // Update introduction with meeting details
    const updatedIntroduction = await this.prisma.introduction.update({
      where: { id: introduction.id },
      data: {
        meetingStartTime: new Date(scheduledEvent.start_time),
        meetingEndTime: new Date(scheduledEvent.end_time),
        meetingZoomLink: zoomLink,
        meetingZoomId: zoomLink?.match(/\/j\/(\d+)/)?.[1],
        meetingCalendlyUri: scheduledEvent.uri,
        meetingCalendlyInviteeUri: invitee.uri,
        meetingStatus: MeetingStatus.SCHEDULED,
      },
      include: {
        vendor: {
          select: { name: true },
        },
      },
    });

    // Log audit event
    await this.auditService.log({
      entityType: 'INTRODUCTION',
      entityId: introduction.id,
      eventType: 'MEETING_SCHEDULED',
      oldValue: {
        meetingStatus: introduction.meetingStatus,
      },
      newValue: {
        meetingStatus: MeetingStatus.SCHEDULED,
        meetingStartTime: scheduledEvent.start_time,
        meetingZoomLink: zoomLink,
        bookedVia: 'calendly',
      },
      source: 'CALENDLY_WEBHOOK',
    });

    // Send Slack notification
    await this.slackService.notifyMeetingScheduled({
      candidateName: `${introduction.candidateFirstName} ${introduction.candidateLastName}`,
      candidateCrd: Number(introduction.candidateCrd),
      vendorName: updatedIntroduction.vendor?.name || 'Unknown',
      meetingTime: scheduledEvent.start_time,
      meetingZoomLink: zoomLink,
      introductionId: introduction.id,
    });

    this.logger.log(
      `Meeting scheduled for introduction ${introduction.id} - ${invitee.name} at ${scheduledEvent.start_time}`,
    );

    return {
      success: true,
      introductionId: introduction.id,
      message: 'Meeting scheduled successfully',
    };
  }

  async handleInviteeCanceled(
    payload: CalendlyWebhookPayloadDto,
  ): Promise<CalendlyWebhookResult> {
    const invitee = payload.payload;

    this.logger.log(
      `Processing invitee.canceled webhook for ${invitee.email}`,
    );

    // Find the introduction by Calendly invitee URI
    const introduction = await this.prisma.introduction.findFirst({
      where: {
        meetingCalendlyInviteeUri: invitee.uri,
      },
      include: {
        vendor: {
          select: { name: true },
        },
      },
    });

    if (!introduction) {
      // Try to find by email as fallback
      const introByEmail = await this.findIntroductionByEmailOrCrd(
        invitee.email,
        null,
      );

      if (!introByEmail) {
        this.logger.warn(
          `No matching introduction found for canceled booking: ${invitee.uri}`,
        );
        return {
          success: false,
          message: 'No matching introduction found for cancellation',
        };
      }
    }

    const targetIntro = introduction || (await this.prisma.introduction.findFirst({
      where: { candidateEmail: invitee.email, status: IntroductionStatus.OPEN },
      include: { vendor: { select: { name: true } } },
    }));

    if (!targetIntro) {
      return {
        success: false,
        message: 'No matching introduction found',
      };
    }

    // Update meeting status to cancelled
    await this.prisma.introduction.update({
      where: { id: targetIntro.id },
      data: {
        meetingStatus: MeetingStatus.CANCELLED,
      },
    });

    // Log audit event
    await this.auditService.log({
      entityType: 'INTRODUCTION',
      entityId: targetIntro.id,
      eventType: 'MEETING_CANCELED',
      oldValue: {
        meetingStatus: targetIntro.meetingStatus,
      },
      newValue: {
        meetingStatus: MeetingStatus.CANCELLED,
        canceledAt: payload.created_at,
      },
      source: 'CALENDLY_WEBHOOK',
    });

    // Send Slack notification
    await this.slackService.notifyMeetingCanceled({
      candidateName: `${targetIntro.candidateFirstName} ${targetIntro.candidateLastName}`,
      candidateCrd: Number(targetIntro.candidateCrd),
      vendorName: targetIntro.vendor?.name || 'Unknown',
      introductionId: targetIntro.id,
    });

    this.logger.log(
      `Meeting canceled for introduction ${targetIntro.id} - ${invitee.email}`,
    );

    return {
      success: true,
      introductionId: targetIntro.id,
      message: 'Meeting cancellation processed',
    };
  }

  private async findIntroductionByEmailOrCrd(
    email: string,
    crd: string | null,
  ) {
    // First try to find by email (most reliable match)
    let introduction = await this.prisma.introduction.findFirst({
      where: {
        candidateEmail: email,
        status: IntroductionStatus.OPEN,
      },
      orderBy: { introTimestamp: 'desc' },
      include: {
        vendor: {
          select: { name: true },
        },
      },
    });

    if (introduction) {
      this.logger.debug(`Found introduction by email: ${email}`);
      return introduction;
    }

    // If not found by email, try by CRD
    if (crd) {
      try {
        const crdNumber = BigInt(crd);
        introduction = await this.prisma.introduction.findFirst({
          where: {
            candidateCrd: crdNumber,
            status: IntroductionStatus.OPEN,
          },
          orderBy: { introTimestamp: 'desc' },
          include: {
            vendor: {
              select: { name: true },
            },
          },
        });

        if (introduction) {
          this.logger.debug(`Found introduction by CRD: ${crd}`);
          return introduction;
        }
      } catch {
        this.logger.warn(`Invalid CRD format in UTM params: ${crd}`);
      }
    }

    return null;
  }

  private extractCrdFromTracking(
    tracking?: { utm_content?: string },
  ): string | null {
    if (!tracking?.utm_content) {
      return null;
    }

    // Expected format: crd_1234567 or just 1234567
    const content = tracking.utm_content;

    if (content.startsWith('crd_')) {
      return content.substring(4);
    }

    // Check if it's a numeric string
    if (/^\d+$/.test(content)) {
      return content;
    }

    return null;
  }
}
