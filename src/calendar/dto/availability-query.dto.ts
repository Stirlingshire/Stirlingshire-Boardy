import { IsDateString, IsNumber, IsOptional, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class AvailabilityQueryDto {
  @ApiProperty({ description: 'Start date for availability search (ISO format)' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ description: 'End date for availability search (ISO format)' })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({ description: 'Meeting duration in minutes', default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(15)
  @Max(180)
  duration?: number = 30;
}

export class TimeSlotDto {
  startTime: string;
  endTime: string;
  available: boolean;
}

export class AvailabilityResponseDto {
  slots: TimeSlotDto[];
  timezone: string;
}
