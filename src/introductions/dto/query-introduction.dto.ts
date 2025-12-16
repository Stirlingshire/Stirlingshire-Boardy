import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsInt,
  Min,
  IsEnum,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IntroductionStatus } from '@prisma/client';

export class QueryIntroductionDto {
  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number = 0;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  take?: number = 50;

  @ApiPropertyOptional({ description: 'Filter by CRD number' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  candidateCrd?: number;

  @ApiPropertyOptional({
    enum: IntroductionStatus,
    description: 'Filter by status',
  })
  @IsOptional()
  @IsEnum(IntroductionStatus)
  status?: IntroductionStatus;

  @ApiPropertyOptional({ description: 'Introductions on or after this date' })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({ description: 'Introductions on or before this date' })
  @IsOptional()
  @IsDateString()
  toDate?: string;
}
