import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsUrl,
  IsObject,
  MinLength,
} from 'class-validator';

export class PlacementTermsDto {
  @ApiPropertyOptional({ description: 'Fee percentage for placements' })
  @IsOptional()
  feePercentage?: number;

  @ApiPropertyOptional({ description: 'Flat fee amount' })
  @IsOptional()
  flatFee?: number;

  @ApiPropertyOptional({
    description: 'Attribution window in months',
    default: 12,
  })
  @IsOptional()
  attributionWindowMonths?: number;

  [key: string]: unknown;
}

export class CreateVendorDto {
  @ApiProperty({ example: 'Boardy', description: 'Name of the vendor' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiPropertyOptional({
    description: 'Placement terms and fee rules',
    type: PlacementTermsDto,
  })
  @IsOptional()
  @IsObject()
  placementTerms?: PlacementTermsDto;

  @ApiPropertyOptional({
    example: 'https://api.boardy.com/webhooks/placements',
    description: 'Webhook URL for placement notifications',
  })
  @IsOptional()
  @IsUrl()
  webhookUrl?: string;

  @ApiProperty({
    description: 'API key for the vendor (will be hashed before storage)',
    minLength: 32,
  })
  @IsString()
  @MinLength(32)
  apiKey: string;
}
