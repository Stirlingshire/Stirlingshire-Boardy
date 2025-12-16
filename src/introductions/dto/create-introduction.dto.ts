import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEmail,
  IsUrl,
  IsDateString,
  IsInt,
  IsNumber,
  Min,
  Max,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateIntroductionDto {
  @ApiProperty({ example: 1234567, description: 'CRD number of the candidate' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  candidateCrd: number;

  @ApiProperty({ example: 'Jane', description: 'Candidate first name' })
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Doe', description: 'Candidate last name' })
  @IsString()
  lastName: string;

  @ApiPropertyOptional({
    example: '+1-212-555-1234',
    description: 'Candidate phone number',
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({
    example: 'jane.doe@example.com',
    description: 'Candidate email',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    example: 'https://www.linkedin.com/in/janedoe',
    description: 'Candidate LinkedIn URL',
  })
  @IsOptional()
  @IsUrl()
  linkedin?: string;

  @ApiProperty({
    example: '2025-12-09T15:02:00Z',
    description: 'Timestamp when double opt-in occurred',
  })
  @IsDateString()
  introTimestamp: string;

  @ApiPropertyOptional({
    example: 'John Recruiter',
    description: 'Stirlingshire recruiter introduced to',
  })
  @IsOptional()
  @IsString()
  recruiterName?: string;

  @ApiProperty({
    example: 'boardy-convo-123',
    description: "Boardy's internal conversation/lead ID",
  })
  @IsString()
  conversationId: string;

  @ApiPropertyOptional({
    description: 'Additional metadata (campaign, region, etc.)',
    example: { campaign: 'US-Expansion-2026', region: 'NY/NJ' },
  })
  @IsOptional()
  @IsObject()
  metadata?: { [key: string]: string | number | boolean | null };

  // Meeting scheduling fields
  @ApiPropertyOptional({
    example: '2025-12-10T14:00:00Z',
    description: 'Meeting start time in ISO format (if booking a meeting)',
  })
  @IsOptional()
  @IsDateString()
  meetingStartTime?: string;

  @ApiPropertyOptional({
    example: 30,
    description: 'Meeting duration in minutes (default: 30)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(15)
  @Max(180)
  meetingDuration?: number;
}
