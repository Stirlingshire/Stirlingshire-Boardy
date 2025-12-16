import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

export interface PlacementNotification {
  placementId: string;
  candidateCrd: number;
  candidateName: string;
  hireDate: string;
  firmEntity: string;
  introductionId: string;
  introTimestamp: string;
  conversationId: string;
  feeAmount: string;
  feeCurrency: string;
}

export interface InternalNotification {
  type: 'NEW_PLACEMENT' | 'NEW_HIRE' | 'PLACEMENT_DISPUTED';
  message: string;
  data: Record<string, unknown>;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
  ) {}

  async notifyVendorOfPlacement(
    vendorId: string,
    notification: PlacementNotification,
  ): Promise<boolean> {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { id: true, name: true, webhookUrl: true },
    });

    if (!vendor?.webhookUrl) {
      this.logger.warn(
        `Vendor ${vendorId} has no webhook URL configured, skipping notification`,
      );
      return false;
    }

    try {
      const payload = {
        event: 'placement.created',
        timestamp: new Date().toISOString(),
        data: notification,
      };

      await axios.post(vendor.webhookUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Stirlingshire-Event': 'placement.created',
        },
        timeout: 10000, // 10 second timeout
      });

      await this.auditService.log({
        entityType: 'PLACEMENT',
        entityId: notification.placementId,
        eventType: 'NOTIFIED_VENDOR',
        newValue: {
          vendorId: vendor.id,
          vendorName: vendor.name,
          webhookUrl: vendor.webhookUrl,
        },
        source: 'SYSTEM',
      });

      this.logger.log(
        `Successfully notified vendor ${vendor.name} of placement ${notification.placementId}`,
      );

      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to notify vendor ${vendor.name} of placement: ${errorMessage}`,
      );

      await this.auditService.log({
        entityType: 'PLACEMENT',
        entityId: notification.placementId,
        eventType: 'NOTIFIED_VENDOR',
        newValue: {
          vendorId: vendor.id,
          vendorName: vendor.name,
          error: errorMessage,
          success: false,
        },
        source: 'SYSTEM',
      });

      return false;
    }
  }

  async sendInternalNotification(
    notification: InternalNotification,
  ): Promise<void> {
    const slackWebhookUrl = this.configService.get<string>('SLACK_WEBHOOK_URL');

    if (slackWebhookUrl) {
      try {
        const slackPayload = {
          text: notification.message,
          attachments: [
            {
              color: notification.type === 'NEW_PLACEMENT' ? '#36a64f' : '#ff0000',
              fields: Object.entries(notification.data).map(([key, value]) => ({
                title: key,
                value: String(value),
                short: true,
              })),
            },
          ],
        };

        await axios.post(slackWebhookUrl, slackPayload, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 5000,
        });

        this.logger.log(`Sent internal Slack notification: ${notification.type}`);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`Failed to send Slack notification: ${errorMessage}`);
      }
    }

    // Log the internal notification regardless of Slack success
    this.logger.log(
      `Internal notification: ${notification.type} - ${notification.message}`,
    );
  }

  async retryFailedNotifications(): Promise<number> {
    // Find placements that are PENDING_NOTIFY
    const pendingPlacements = await this.prisma.placement.findMany({
      where: { status: 'PENDING_NOTIFY' },
      include: {
        vendor: true,
        introduction: true,
        hire: true,
      },
    });

    let successCount = 0;

    for (const placement of pendingPlacements) {
      const notification: PlacementNotification = {
        placementId: placement.id,
        candidateCrd: Number(placement.candidateCrd),
        candidateName: `${placement.hire.firstName} ${placement.hire.lastName}`,
        hireDate: placement.hireDate.toISOString().split('T')[0],
        firmEntity: placement.hire.firmEntity,
        introductionId: placement.introductionId,
        introTimestamp: placement.introduction.introTimestamp.toISOString(),
        conversationId: placement.introduction.conversationId,
        feeAmount: placement.feeAmount.toString(),
        feeCurrency: placement.feeCurrency,
      };

      const success = await this.notifyVendorOfPlacement(
        placement.vendorId,
        notification,
      );

      if (success) {
        await this.prisma.placement.update({
          where: { id: placement.id },
          data: { status: 'NOTIFIED' },
        });
        successCount++;
      }
    }

    return successCount;
  }
}
