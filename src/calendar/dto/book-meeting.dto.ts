import { IsString, IsNumber, IsDateString, IsOptional, IsEmail, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BookMeetingDto {
  @ApiProperty({ description: 'Meeting start time in ISO format' })
  @IsDateString()
  startTime: string;

  @ApiPropertyOptional({ description: 'Meeting duration in minutes', default: 30 })
  @IsOptional()
  @IsNumber()
  @Min(15)
  @Max(180)
  duration?: number = 30;

  @ApiProperty({ description: 'Meeting title/subject' })
  @IsString()
  subject: string;

  @ApiPropertyOptional({ description: 'Meeting description/body' })
  @IsOptional()
  @IsString()
  body?: string;

  @ApiPropertyOptional({ description: 'Candidate email to invite' })
  @IsOptional()
  @IsEmail()
  candidateEmail?: string;

  @ApiPropertyOptional({ description: 'Zoom meeting link to include' })
  @IsOptional()
  @IsString()
  zoomLink?: string;
}

export class BookMeetingResponseDto {
  eventId: string;
  subject: string;
  startTime: string;
  endTime: string;
  organizer: string;
  attendees: string[];
  zoomLink?: string;
  webLink?: string;
}
