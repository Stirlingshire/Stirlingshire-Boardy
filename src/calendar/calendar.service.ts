import { Injectable, Logger } from '@nestjs/common';
import { MicrosoftGraphService } from './microsoft-graph.service';
import { ZoomService } from '../zoom/zoom.service';
import {
  AvailabilityQueryDto,
  TimeSlotDto,
  BookMeetingDto,
  BookMeetingResponseDto,
} from './dto';

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);

  // Business hours configuration (Eastern Time)
  private readonly businessHours = {
    start: 9, // 9 AM
    end: 17, // 5 PM
    slotDuration: 30, // 30 minute slots
    excludeWeekends: true,
  };

  constructor(
    private readonly graphService: MicrosoftGraphService,
    private readonly zoomService: ZoomService,
  ) {}

  /**
   * Get available time slots for scheduling
   */
  async getAvailability(query: AvailabilityQueryDto): Promise<TimeSlotDto[]> {
    const { startDate, endDate, duration = 30 } = query;

    // Get busy times from calendar
    const busyTimes = await this.graphService.getSchedule(startDate, endDate);

    // Generate all possible slots within business hours
    const allSlots = this.generateBusinessHourSlots(startDate, endDate, duration);

    // Filter out slots that overlap with busy times
    const availableSlots = allSlots.filter(slot => {
      const slotStart = new Date(slot.startTime);
      const slotEnd = new Date(slot.endTime);

      return !busyTimes.some(busy => {
        const busyStart = new Date(busy.start);
        const busyEnd = new Date(busy.end);

        // Check for overlap
        return slotStart < busyEnd && slotEnd > busyStart;
      });
    });

    return availableSlots.map(slot => ({
      ...slot,
      available: true,
    }));
  }

  /**
   * Book a meeting with Zoom and calendar
   */
  async bookMeeting(dto: BookMeetingDto): Promise<BookMeetingResponseDto | null> {
    const { startTime, duration = 30, subject, body, candidateEmail, zoomLink } = dto;

    // Calculate end time
    const start = new Date(startTime);
    const end = new Date(start.getTime() + duration * 60 * 1000);
    const endTime = end.toISOString();

    let finalZoomLink = zoomLink;

    // Create Zoom meeting if no link provided
    if (!finalZoomLink) {
      const zoomMeeting = await this.zoomService.createMeeting({
        topic: subject,
        startTime,
        duration,
        agenda: body,
      });

      if (zoomMeeting) {
        finalZoomLink = zoomMeeting.joinUrl;
      }
    }

    // Build meeting body with Zoom link
    const meetingBody = this.buildMeetingBody(body, finalZoomLink);

    // Create calendar event
    const attendees = candidateEmail ? [candidateEmail] : [];
    const event = await this.graphService.createEvent(
      subject,
      startTime,
      endTime,
      meetingBody,
      attendees,
    );

    if (!event) {
      this.logger.warn('Calendar event creation failed, but Zoom meeting may have been created');
    }

    return {
      eventId: event?.id || '',
      subject,
      startTime,
      endTime,
      organizer: event?.organizer?.emailAddress?.address || '',
      attendees,
      zoomLink: finalZoomLink,
      webLink: event?.webLink,
    };
  }

  /**
   * Generate available slots within business hours
   */
  private generateBusinessHourSlots(
    startDate: string,
    endDate: string,
    duration: number,
  ): Array<{ startTime: string; endTime: string }> {
    const slots: Array<{ startTime: string; endTime: string }> = [];

    const start = new Date(startDate);
    const end = new Date(endDate);

    // Set to start of day
    start.setHours(0, 0, 0, 0);

    const currentDate = new Date(start);

    while (currentDate < end) {
      const dayOfWeek = currentDate.getDay();

      // Skip weekends if configured
      if (this.businessHours.excludeWeekends && (dayOfWeek === 0 || dayOfWeek === 6)) {
        currentDate.setDate(currentDate.getDate() + 1);
        continue;
      }

      // Generate slots for this day
      for (let hour = this.businessHours.start; hour < this.businessHours.end; hour++) {
        for (let minute = 0; minute < 60; minute += this.businessHours.slotDuration) {
          const slotStart = new Date(currentDate);
          slotStart.setHours(hour, minute, 0, 0);

          const slotEnd = new Date(slotStart.getTime() + duration * 60 * 1000);

          // Check if slot ends within business hours
          if (slotEnd.getHours() <= this.businessHours.end) {
            // Only include future slots
            if (slotStart > new Date()) {
              slots.push({
                startTime: slotStart.toISOString(),
                endTime: slotEnd.toISOString(),
              });
            }
          }
        }
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return slots;
  }

  /**
   * Build HTML body for calendar invite
   */
  private buildMeetingBody(description?: string, zoomLink?: string): string {
    let body = '';

    if (description) {
      body += `<p>${description}</p>`;
    }

    if (zoomLink) {
      body += `
        <p><strong>Join Zoom Meeting:</strong></p>
        <p><a href="${zoomLink}">${zoomLink}</a></p>
      `;
    }

    return body || '<p>Meeting scheduled via Stirlingshire-Boardy</p>';
  }
}
