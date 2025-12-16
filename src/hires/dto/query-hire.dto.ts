import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsInt, Min, IsDateString, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryHireDto {
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
  crdNumber?: number;

  @ApiPropertyOptional({ description: 'Filter by firm entity' })
  @IsOptional()
  @IsString()
  firmEntity?: string;

  @ApiPropertyOptional({ description: 'Hires on or after this date' })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({ description: 'Hires on or before this date' })
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiPropertyOptional({ description: 'Filter by source' })
  @IsOptional()
  @IsString()
  source?: string;
}
