import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsDateString } from 'class-validator';

export class UpdateHireDto {
  @ApiPropertyOptional({
    description: 'Set termination date if advisor left',
    example: '2025-06-30',
  })
  @IsOptional()
  @IsDateString()
  terminationDate?: string;
}
