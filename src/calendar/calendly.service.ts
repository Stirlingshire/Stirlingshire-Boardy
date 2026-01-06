import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

interface CalendlyEventType {
  uri: string;
  name: string;
  slug: string;
  schedulingUrl: string;
  duration: number;
  active: boolean;
}

interface CalendlyUser {
  uri: string;
  name: string;
  email: string;
  schedulingUrl: string;
  timezone: string;
}

interface CalendlySchedulingLink {
  bookingUrl: string;
  owner: string;
  ownerType: string;
}

@Injectable()
export class CalendlyService {
  private readonly logger = new Logger(CalendlyService.name);
  private readonly apiToken: string | undefined;
  private readonly baseUrl = 'https://api.calendly.com';
  private userUri: string | null = null;
  private defaultEventType: CalendlyEventType | null = null;

  constructor(private readonly configService: ConfigService) {
    this.apiToken = this.configService.get<string>('CALENDLY_API_TOKEN');

    if (!this.apiToken) {
      this.logger.warn('Calendly API token not configured - scheduling links will not be available');
    } else {
      this.logger.log('Calendly integration initialized');
      // Initialize user and event type on startup
      this.initialize();
    }
  }

  private async initialize(): Promise<void> {
    try {
      await this.getCurrentUser();
      await this.getDefaultEventType();
    } catch (error) {
      this.logger.error('Failed to initialize Calendly: ' + error.message);
    }
  }

  /**
   * Check if Calendly is configured
   */
  isConfigured(): boolean {
    return !!this.apiToken;
  }

  /**
   * Get current authenticated user
   */
  async getCurrentUser(): Promise<CalendlyUser | null> {
    if (!this.apiToken) return null;

    try {
      const response = await axios.get(`${this.baseUrl}/users/me`, {
        headers: this.getHeaders(),
      });

      const user = response.data.resource;
      this.userUri = user.uri;

      this.logger.log('Calendly user: ' + user.name + ' (' + user.email + ')');

      return {
        uri: user.uri,
        name: user.name,
        email: user.email,
        schedulingUrl: user.scheduling_url,
        timezone: user.timezone,
      };
    } catch (error) {
      this.logger.error('Failed to get Calendly user: ' + error.message);
      return null;
    }
  }

  /**
   * Get available event types (meeting types)
   */
  async getEventTypes(): Promise<CalendlyEventType[]> {
    if (!this.apiToken || !this.userUri) return [];

    try {
      const response = await axios.get(`${this.baseUrl}/event_types`, {
        headers: this.getHeaders(),
        params: {
          user: this.userUri,
          active: true,
        },
      });

      return response.data.collection.map((et: Record<string, unknown>) => ({
        uri: et.uri,
        name: et.name,
        slug: et.slug,
        schedulingUrl: et.scheduling_url,
        duration: et.duration,
        active: et.active,
      }));
    } catch (error) {
      this.logger.error('Failed to get Calendly event types: ' + error.message);
      return [];
    }
  }

  /**
   * Get the default event type (first active 30-min meeting)
   */
  async getDefaultEventType(): Promise<CalendlyEventType | null> {
    if (this.defaultEventType) return this.defaultEventType;

    const eventTypes = await this.getEventTypes();

    // Prefer 30-minute intro calls, fall back to first active
    this.defaultEventType = eventTypes.find(et =>
      et.duration === 30 && et.active
    ) || eventTypes[0] || null;

    if (this.defaultEventType) {
      this.logger.log('Default Calendly event type: ' + this.defaultEventType.name);
    }

    return this.defaultEventType;
  }

  /**
   * Get the scheduling URL for the default event type
   */
  async getSchedulingUrl(): Promise<string | null> {
    const eventType = await this.getDefaultEventType();
    return eventType?.schedulingUrl || null;
  }

  /**
   * Get the organization URI for webhook subscriptions
   */
  async getOrganizationUri(): Promise<string | null> {
    if (!this.apiToken) return null;

    const user = await this.getCurrentUser();
    if (!user) return null;

    // Organization URI is derived from user URI: /users/{id} -> /organizations/{orgId}
    // But we need to fetch it from the user's organization membership
    try {
      const response = await axios.get(
        `${this.baseUrl}/organization_memberships`,
        {
          headers: this.getHeaders(),
          params: { user: user.uri },
        },
      );

      const membership = response.data.collection[0];
      return membership?.organization || null;
    } catch (error) {
      this.logger.error('Failed to get organization URI: ' + error.message);
      return null;
    }
  }

  /**
   * Create a single-use scheduling link for a specific candidate
   * This creates a unique URL that expires after one booking
   * @param candidateName - The candidate's name for logging
   * @param candidateCrd - Optional CRD to include in UTM params for tracking
   * @param maxEventCount - Max bookings allowed (default: 1)
   */
  async createSingleUseLink(
    candidateName: string,
    candidateCrd?: string | number,
    maxEventCount: number = 1,
  ): Promise<CalendlySchedulingLink | null> {
    if (!this.apiToken) return null;

    const eventType = await this.getDefaultEventType();
    if (!eventType) {
      this.logger.warn('No default event type available for single-use link');
      return null;
    }

    try {
      const response = await axios.post(
        `${this.baseUrl}/scheduling_links`,
        {
          max_event_count: maxEventCount,
          owner: eventType.uri,
          owner_type: 'EventType',
        },
        {
          headers: this.getHeaders(),
        },
      );

      const link = response.data.resource;
      let bookingUrl = link.booking_url;

      // Append UTM params with CRD for tracking
      if (candidateCrd) {
        const separator = bookingUrl.includes('?') ? '&' : '?';
        bookingUrl = `${bookingUrl}${separator}utm_source=boardy&utm_content=crd_${candidateCrd}`;
      }

      this.logger.log('Created single-use Calendly link for: ' + candidateName);

      return {
        bookingUrl,
        owner: link.owner,
        ownerType: link.owner_type,
      };
    } catch (error) {
      this.logger.error('Failed to create Calendly scheduling link: ' + error.message);
      return null;
    }
  }

  /**
   * Get the booking URL - either single-use or general scheduling URL
   * @param candidateName - If provided, creates a single-use link
   * @param candidateCrd - Optional CRD to include in UTM params for tracking
   */
  async getBookingUrl(
    candidateName?: string,
    candidateCrd?: string | number,
  ): Promise<string | null> {
    if (!this.isConfigured()) return null;

    // Create single-use link with CRD tracking if provided
    if (candidateName) {
      const singleUse = await this.createSingleUseLink(
        candidateName,
        candidateCrd,
      );
      if (singleUse) return singleUse.bookingUrl;
    }

    // Fallback to general scheduling URL with UTM params if CRD provided
    const baseUrl = await this.getSchedulingUrl();
    if (baseUrl && candidateCrd) {
      const separator = baseUrl.includes('?') ? '&' : '?';
      return `${baseUrl}${separator}utm_source=boardy&utm_content=crd_${candidateCrd}`;
    }

    return baseUrl;
  }

  private getHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.apiToken}`,
      'Content-Type': 'application/json',
    };
  }
}
