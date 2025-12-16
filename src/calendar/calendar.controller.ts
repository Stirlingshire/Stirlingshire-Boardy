import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity } from '@nestjs/swagger';
import { CalendarService } from './calendar.service';
import { AvailabilityQueryDto, BookMeetingDto, TimeSlotDto, BookMeetingResponseDto } from './dto';

@ApiTags('calendar')
@ApiSecurity('api-key')
@Controller('api/calendar')
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Get('availability')
  @ApiOperation({
    summary: 'Get available time slots for scheduling',
    description: 'Returns available time slots within business hours that are not already booked',
  })
  @ApiResponse({
    status: 200,
    description: 'List of available time slots',
    type: [TimeSlotDto],
  })
  async getAvailability(@Query() query: AvailabilityQueryDto): Promise<TimeSlotDto[]> {
    return this.calendarService.getAvailability(query);
  }

  @Post('book')
  @ApiOperation({
    summary: 'Book a meeting on the recruiter calendar',
    description: 'Creates a Zoom meeting and adds it to the recruiter calendar',
  })
  @ApiResponse({
    status: 201,
    description: 'Meeting booked successfully',
    type: BookMeetingResponseDto,
  })
  async bookMeeting(@Body() dto: BookMeetingDto): Promise<BookMeetingResponseDto | null> {
    return this.calendarService.bookMeeting(dto);
  }
}
