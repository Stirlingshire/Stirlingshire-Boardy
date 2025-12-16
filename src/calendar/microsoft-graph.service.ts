import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface GraphCalendarEvent {
  id: string;
  subject: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  organizer: { emailAddress: { name: string; address: string } };
  attendees: Array<{ emailAddress: { name: string; address: string } }>;
  webLink: string;
  body?: { content: string; contentType: string };
}

@Injectable()
export class MicrosoftGraphService implements OnModuleInit {
  private readonly logger = new Logger(MicrosoftGraphService.name);
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;

  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly tenantId: string;
  private readonly calendarUserId: string;

  constructor(private readonly configService: ConfigService) {
    this.clientId = this.configService.get<string>('MICROSOFT_CLIENT_ID', '');
    this.clientSecret = this.configService.get<string>('MICROSOFT_CLIENT_SECRET', '');
    this.tenantId = this.configService.get<string>('MICROSOFT_TENANT_ID', '');
    this.calendarUserId = this.configService.get<string>('MICROSOFT_CALENDAR_USER_ID', '');
  }

  async onModuleInit() {
    if (this.isConfigured()) {
      this.logger.log('Microsoft Graph credentials configured');
    } else {
      this.logger.warn('Microsoft Graph credentials not fully configured - calendar features will be limited');
    }
  }

  isConfigured(): boolean {
    return !!(this.clientId && this.clientSecret && this.tenantId && this.calendarUserId);
  }

  /**
   * Get OAuth access token using client credentials flow
   */
  private async getAccessToken(): Promise<string> {
    // Return cached token if still valid
    if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return this.accessToken;
    }

    const tokenUrl = `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`;

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`Failed to get Microsoft Graph token: ${error}`);
      throw new Error(`Microsoft OAuth failed: ${response.status}`);
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    // Token expires in ~1 hour, refresh 5 minutes early
    this.tokenExpiry = new Date(Date.now() + (data.expires_in - 300) * 1000);

    this.logger.log('Microsoft Graph access token obtained');
    return this.accessToken!;
  }

  /**
   * Get busy/free times for the calendar
   */
  async getSchedule(
    startTime: string,
    endTime: string,
  ): Promise<Array<{ start: string; end: string }>> {
    if (!this.isConfigured()) {
      this.logger.warn('Microsoft Graph not configured');
      return [];
    }

    try {
      const token = await this.getAccessToken();

      const response = await fetch('https://graph.microsoft.com/v1.0/me/calendar/getSchedule', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          schedules: [this.calendarUserId],
          startTime: { dateTime: startTime, timeZone: 'America/New_York' },
          endTime: { dateTime: endTime, timeZone: 'America/New_York' },
          availabilityViewInterval: 30,
        }),
      });

      // If /me doesn't work, try using the user ID directly
      if (response.status === 400 || response.status === 403) {
        return this.getScheduleForUser(startTime, endTime);
      }

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`Failed to get schedule: ${error}`);
        return [];
      }

      const data = await response.json();
      const scheduleItems = data.value?.[0]?.scheduleItems || [];

      return scheduleItems.map((item: any) => ({
        start: item.start.dateTime,
        end: item.end.dateTime,
      }));
    } catch (error) {
      this.logger.error(`Error getting schedule: ${error.message}`);
      return [];
    }
  }

  /**
   * Alternative method using direct user calendar access
   */
  private async getScheduleForUser(
    startTime: string,
    endTime: string,
  ): Promise<Array<{ start: string; end: string }>> {
    try {
      const token = await this.getAccessToken();

      const response = await fetch(
        `https://graph.microsoft.com/v1.0/users/${this.calendarUserId}/calendar/calendarView?` +
        `startDateTime=${encodeURIComponent(startTime)}&` +
        `endDateTime=${encodeURIComponent(endTime)}&` +
        `$select=start,end,showAs`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        },
      );

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`Failed to get calendar view: ${error}`);
        return [];
      }

      const data = await response.json();

      // Filter to only busy events
      return (data.value || [])
        .filter((event: any) => event.showAs === 'busy' || event.showAs === 'tentative')
        .map((event: any) => ({
          start: event.start.dateTime,
          end: event.end.dateTime,
        }));
    } catch (error) {
      this.logger.error(`Error getting calendar view: ${error.message}`);
      return [];
    }
  }

  /**
   * Create a calendar event
   */
  async createEvent(
    subject: string,
    startTime: string,
    endTime: string,
    body?: string,
    attendees?: string[],
  ): Promise<GraphCalendarEvent | null> {
    if (!this.isConfigured()) {
      this.logger.warn('Microsoft Graph not configured');
      return null;
    }

    try {
      const token = await this.getAccessToken();

      const eventData: any = {
        subject,
        start: { dateTime: startTime, timeZone: 'America/New_York' },
        end: { dateTime: endTime, timeZone: 'America/New_York' },
        body: body ? { content: body, contentType: 'HTML' } : undefined,
        attendees: attendees?.map(email => ({
          emailAddress: { address: email },
          type: 'required',
        })),
      };

      const response = await fetch(
        `https://graph.microsoft.com/v1.0/users/${this.calendarUserId}/calendar/events`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(eventData),
        },
      );

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`Failed to create calendar event: ${error}`);
        return null;
      }

      const event = await response.json();
      this.logger.log(`Calendar event created: ${event.id}`);

      return {
        id: event.id,
        subject: event.subject,
        start: event.start,
        end: event.end,
        organizer: event.organizer,
        attendees: event.attendees || [],
        webLink: event.webLink,
        body: event.body,
      };
    } catch (error) {
      this.logger.error(`Error creating calendar event: ${error.message}`);
      return null;
    }
  }

  /**
   * Delete a calendar event
   */
  async deleteEvent(eventId: string): Promise<boolean> {
    if (!this.isConfigured()) {
      return false;
    }

    try {
      const token = await this.getAccessToken();

      const response = await fetch(
        `https://graph.microsoft.com/v1.0/users/${this.calendarUserId}/calendar/events/${eventId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        },
      );

      if (response.status === 204) {
        this.logger.log(`Calendar event ${eventId} deleted`);
        return true;
      }

      return false;
    } catch (error) {
      this.logger.error(`Error deleting calendar event: ${error.message}`);
      return false;
    }
  }
}
