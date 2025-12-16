import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsEnum } from 'class-validator';
import { PlacementStatus } from '@prisma/client';

export class UpdatePlacementDto {
  @ApiPropertyOptional({
    enum: PlacementStatus,
    description: 'Update the placement status',
  })
  @IsOptional()
  @IsEnum(PlacementStatus)
  status?: PlacementStatus;
}
