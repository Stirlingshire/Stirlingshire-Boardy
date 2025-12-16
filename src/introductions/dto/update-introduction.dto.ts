import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsEnum } from 'class-validator';
import { IntroductionStatus } from '@prisma/client';

export class UpdateIntroductionDto {
  @ApiPropertyOptional({
    enum: IntroductionStatus,
    description: 'Update the introduction status',
  })
  @IsOptional()
  @IsEnum(IntroductionStatus)
  status?: IntroductionStatus;
}
