import { IsString, IsNumber, IsOptional, IsDateString, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateZoomMeetingDto {
  @ApiProperty({ description: 'Meeting topic/title' })
  @IsString()
  topic: string;

  @ApiProperty({ description: 'Meeting start time in ISO format' })
  @IsDateString()
  startTime: string;

  @ApiPropertyOptional({ description: 'Meeting duration in minutes', default: 30 })
  @IsOptional()
  @IsNumber()
  @Min(15)
  @Max(180)
  duration?: number = 30;

  @ApiPropertyOptional({ description: 'Meeting agenda/description' })
  @IsOptional()
  @IsString()
  agenda?: string;
}

export class ZoomMeetingResponse {
  id: number;
  uuid: string;
  hostEmail: string;
  topic: string;
  startTime: string;
  duration: number;
  joinUrl: string;
  password?: string;
}
