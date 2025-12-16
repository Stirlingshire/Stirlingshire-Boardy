import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsDateString,
  IsInt,
  Min,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum HireSource {
  INTERNAL_ONBOARDING = 'INTERNAL_ONBOARDING',
  FINRA_WEEKLY_SYNC = 'FINRA_WEEKLY_SYNC',
  BROKERCHECK_SYNC = 'BROKERCHECK_SYNC',
  MANUAL_ENTRY = 'MANUAL_ENTRY',
}

export class CreateHireDto {
  @ApiProperty({ example: 1234567, description: 'CRD number of the hired advisor' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  crdNumber: number;

  @ApiProperty({ example: 'Jane', description: 'Advisor first name' })
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Doe', description: 'Advisor last name' })
  @IsString()
  lastName: string;

  @ApiProperty({
    example: 'Stirlingshire BD LLC',
    description: 'Stirlingshire firm entity',
  })
  @IsString()
  firmEntity: string;

  @ApiPropertyOptional({
    example: 12345,
    description: 'CRD number of the hiring firm',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  firmCrd?: number;

  @ApiProperty({
    example: '2025-01-15',
    description: 'Date the advisor was hired',
  })
  @IsDateString()
  hireDate: string;

  @ApiPropertyOptional({
    enum: HireSource,
    default: HireSource.INTERNAL_ONBOARDING,
    description: 'Source of the hire record',
  })
  @IsOptional()
  @IsEnum(HireSource)
  source?: HireSource = HireSource.INTERNAL_ONBOARDING;

  @ApiPropertyOptional({
    example: 'HR-2025-001234',
    description: 'Reference ID from source system',
  })
  @IsOptional()
  @IsString()
  rawSourceReference?: string;
}
