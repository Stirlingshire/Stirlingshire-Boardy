import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsInt, Min, IsEnum, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryAuditDto {
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

  @ApiPropertyOptional({
    enum: ['INTRODUCTION', 'HIRE', 'PLACEMENT', 'VENDOR'],
  })
  @IsOptional()
  @IsEnum(['INTRODUCTION', 'HIRE', 'PLACEMENT', 'VENDOR'])
  entityType?: 'INTRODUCTION' | 'HIRE' | 'PLACEMENT' | 'VENDOR';

  @ApiPropertyOptional({
    enum: ['SYSTEM', 'BOARDY_API', 'INTERNAL_API', 'FINRA_SYNC'],
  })
  @IsOptional()
  @IsEnum(['SYSTEM', 'BOARDY_API', 'INTERNAL_API', 'FINRA_SYNC'])
  source?: 'SYSTEM' | 'BOARDY_API' | 'INTERNAL_API' | 'FINRA_SYNC';

  @ApiPropertyOptional({ description: 'Start date for filtering' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date for filtering' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
