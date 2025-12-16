import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsUUID, IsNumber, IsOptional, Min } from 'class-validator';

export class CreatePlacementDto {
  @ApiProperty({ description: 'UUID of the introduction being placed' })
  @IsUUID()
  introductionId: string;

  @ApiProperty({ description: 'UUID of the hire record' })
  @IsUUID()
  hireId: string;

  @ApiPropertyOptional({
    description: 'Fee amount (uses vendor terms if not specified)',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  feeAmount?: number;

  @ApiPropertyOptional({
    description: 'Fee currency',
    default: 'USD',
  })
  @IsOptional()
  @IsString()
  feeCurrency?: string;
}
