import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CreateZoomMeetingDto, ZoomMeetingResponse } from './dto';

@Injectable()
export class ZoomService implements OnModuleInit {
  private readonly logger = new Logger(ZoomService.name);
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;

  private readonly accountId: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly userId: string;

  constructor(private readonly configService: ConfigService) {
    this.accountId = this.configService.get<string>('ZOOM_ACCOUNT_ID', '');
    this.clientId = this.configService.get<string>('ZOOM_CLIENT_ID', '');
    this.clientSecret = this.configService.get<string>('ZOOM_CLIENT_SECRET', '');
    this.userId = this.configService.get<string>('ZOOM_USER_ID', 'me');
  }

  async onModuleInit() {
    if (this.accountId && this.clientId && this.clientSecret) {
      this.logger.log('Zoom credentials configured');
    } else {
      this.logger.warn('Zoom credentials not fully configured - meeting creation will be skipped');
    }
  }

  private isConfigured(): boolean {
    return !!(this.accountId && this.clientId && this.clientSecret);
  }

  /**
   * Get OAuth access token using Server-to-Server OAuth
   */
  private async getAccessToken(): Promise<string> {
    // Return cached token if still valid
    if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return this.accessToken;
    }

    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

    const response = await fetch('https://zoom.us/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'account_credentials',
        account_id: this.accountId,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`Failed to get Zoom access token: ${error}`);
      throw new Error(`Zoom OAuth failed: ${response.status}`);
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    // Token expires in 1 hour, refresh 5 minutes early
    this.tokenExpiry = new Date(Date.now() + (data.expires_in - 300) * 1000);

    this.logger.log('Zoom access token obtained');
    return this.accessToken!;
  }

  /**
   * Create a Zoom meeting
   */
  async createMeeting(dto: CreateZoomMeetingDto): Promise<ZoomMeetingResponse | null> {
    if (!this.isConfigured()) {
      this.logger.warn('Zoom not configured, skipping meeting creation');
      return null;
    }

    try {
      const token = await this.getAccessToken();

      const response = await fetch(`https://api.zoom.us/v2/users/${this.userId}/meetings`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          topic: dto.topic,
          type: 2, // Scheduled meeting
          start_time: dto.startTime,
          duration: dto.duration || 30,
          timezone: 'America/New_York',
          agenda: dto.agenda || '',
          settings: {
            host_video: true,
            participant_video: true,
            join_before_host: false,
            mute_upon_entry: false,
            watermark: false,
            waiting_room: true,
            meeting_authentication: false,
          },
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`Failed to create Zoom meeting: ${error}`);
        throw new Error(`Zoom API error: ${response.status}`);
      }

      const meeting = await response.json();

      this.logger.log(`Zoom meeting created: ${meeting.id}`);

      return {
        id: meeting.id,
        uuid: meeting.uuid,
        hostEmail: meeting.host_email,
        topic: meeting.topic,
        startTime: meeting.start_time,
        duration: meeting.duration,
        joinUrl: meeting.join_url,
        password: meeting.password,
      };
    } catch (error) {
      this.logger.error(`Error creating Zoom meeting: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete a Zoom meeting
   */
  async deleteMeeting(meetingId: string): Promise<boolean> {
    if (!this.isConfigured()) {
      return false;
    }

    try {
      const token = await this.getAccessToken();

      const response = await fetch(`https://api.zoom.us/v2/meetings/${meetingId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.status === 204) {
        this.logger.log(`Zoom meeting ${meetingId} deleted`);
        return true;
      }

      this.logger.warn(`Failed to delete Zoom meeting ${meetingId}: ${response.status}`);
      return false;
    } catch (error) {
      this.logger.error(`Error deleting Zoom meeting: ${error.message}`);
      return false;
    }
  }
}
