import { ApiPropertyOptional, PartialType, OmitType } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';
import { CreateVendorDto } from './create-vendor.dto';

export class UpdateVendorDto extends PartialType(
  OmitType(CreateVendorDto, ['apiKey'] as const),
) {
  @ApiPropertyOptional({ description: 'Whether the vendor is active' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'New API key (only provide if rotating)',
    minLength: 32,
  })
  @IsOptional()
  @IsString()
  @MinLength(32)
  newApiKey?: string;
}
