import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface SlackPlacementNotification {
  candidateName: string;
  candidateCrd: number;
  vendorName: string;
  recruiterName?: string;
  firmEntity: string;
  hireDate: string;
  introDate: string;
  placementId: string;
  feeAmount?: string;
}

export interface SlackIntroductionNotification {
  candidateName: string;
  candidateCrd: number;
  vendorName: string;
  recruiterName?: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  conversationId: string;
  meetingTime?: string;
  meetingZoomLink?: string;
  calendlyUrl?: string;
}

@Injectable()
export class SlackService {
  private readonly logger = new Logger(SlackService.name);
  private readonly webhookUrl: string | undefined;
  private readonly channel: string;

  constructor(private readonly configService: ConfigService) {
    this.webhookUrl = this.configService.get<string>('SLACK_WEBHOOK_URL');
    this.channel = this.configService.get<string>('SLACK_CHANNEL') || '#dealteam-stirlingshire';
  }

  async notifyNewIntroduction(notification: SlackIntroductionNotification): Promise<boolean> {
    if (!this.webhookUrl) {
      this.logger.warn('Slack webhook URL not configured');
      return false;
    }

    const blocks: unknown[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🆕 NEW INTRO 🧑‍💼',
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${notification.candidateName}* (CRD: ${notification.candidateCrd})`,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Vendor:*\n${notification.vendorName}`,
          },
          {
            type: 'mrkdwn',
            text: `*Recruiter:*\n${notification.recruiterName || 'Unassigned'}`,
          },
        ],
      },
    ];

    // Add contact info if available
    const contactFields = [];
    if (notification.email) {
      contactFields.push({
        type: 'mrkdwn',
        text: `*Email:*\n${notification.email}`,
      });
    }
    if (notification.phone) {
      contactFields.push({
        type: 'mrkdwn',
        text: `*Phone:*\n${notification.phone}`,
      });
    }
    if (contactFields.length > 0) {
      blocks.push({
        type: 'section',
        fields: contactFields,
      });
    }

    if (notification.linkedin) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `<${notification.linkedin}|View LinkedIn Profile>`,
        },
      });
    }

    // Add meeting info if scheduled
    if (notification.meetingTime || notification.meetingZoomLink) {
      blocks.push({
        type: 'divider',
      });
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '📅 *Meeting Scheduled*',
        },
      });

      const meetingFields = [];
      if (notification.meetingTime) {
        const meetingDate = new Date(notification.meetingTime);
        meetingFields.push({
          type: 'mrkdwn',
          text: `*Date/Time:*\n${meetingDate.toLocaleString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            timeZoneName: 'short',
          })}`,
        });
      }
      if (notification.meetingZoomLink) {
        meetingFields.push({
          type: 'mrkdwn',
          text: `*Zoom Link:*\n<${notification.meetingZoomLink}|Join Meeting>`,
        });
      }
      if (meetingFields.length > 0) {
        blocks.push({
          type: 'section',
          fields: meetingFields,
        });
      }
    } else if (notification.calendlyUrl) {
      // Show Calendly booking button if no meeting is scheduled
      blocks.push({
        type: 'divider',
      });
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '📅 *Schedule a Meeting*',
        },
        accessory: {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'Book via Calendly',
            emoji: true,
          },
          url: notification.calendlyUrl,
          action_id: 'calendly_book',
        },
      });
    }

    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Conversation ID: ${notification.conversationId}`,
        },
      ],
    });

    return this.sendMessage({ blocks });
  }

  async notifyNewPlacement(notification: SlackPlacementNotification): Promise<boolean> {
    if (!this.webhookUrl) {
      this.logger.warn('Slack webhook URL not configured');
      return false;
    }

    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🎉 NEW PLACEMENT 💰',
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${notification.candidateName}* has been placed!`,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*CRD:*\n${notification.candidateCrd}`,
          },
          {
            type: 'mrkdwn',
            text: `*Firm:*\n${notification.firmEntity}`,
          },
          {
            type: 'mrkdwn',
            text: `*Hire Date:*\n${notification.hireDate}`,
          },
          {
            type: 'mrkdwn',
            text: `*Intro Date:*\n${notification.introDate}`,
          },
          {
            type: 'mrkdwn',
            text: `*Vendor:*\n${notification.vendorName}`,
          },
          {
            type: 'mrkdwn',
            text: `*Recruiter:*\n${notification.recruiterName || 'N/A'}`,
          },
        ],
      },
    ];

    if (notification.feeAmount) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Placement Fee:* $${notification.feeAmount}`,
        },
      });
    }

    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Placement ID: ${notification.placementId}`,
        },
      ],
    } as never);

    return this.sendMessage({ blocks });
  }

  async notifyOutreachUpdate(message: string, details: Record<string, string>[]): Promise<boolean> {
    if (!this.webhookUrl) {
      this.logger.warn('Slack webhook URL not configured');
      return false;
    }

    const blocks: unknown[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: 'Outreach Update ✅',
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: message,
        },
      },
    ];

    // Add each prospect as a section
    for (const detail of details) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${detail.name}*\n${detail.title}${detail.linkedin ? ` | <${detail.linkedin}|View LinkedIn>` : ''}`,
        },
      });
      if (detail.description) {
        blocks.push({
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: detail.description,
            },
          ],
        });
      }
    }

    return this.sendMessage({ blocks });
  }

  private async sendMessage(payload: { blocks: unknown[]; text?: string }): Promise<boolean> {
    if (!this.webhookUrl) {
      return false;
    }

    try {
      await axios.post(this.webhookUrl, {
        ...payload,
        text: payload.text || 'Stirlingshire-Boardy Notification',
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
      });

      this.logger.log('Slack notification sent successfully');
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to send Slack notification: ${errorMessage}`);
      return false;
    }
  }
}
