import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Query,
  ParseUUIDPipe,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiSecurity,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { Vendor } from '@prisma/client';
import { IntroductionsService } from './introductions.service';
import {
  CreateIntroductionDto,
  QueryIntroductionDto,
  UpdateIntroductionDto,
} from './dto';
import { CurrentVendor } from '../common/decorators';

@ApiTags('introductions')
@ApiSecurity('api-key')
@Controller('api/vendors/:vendorId/introductions')
export class IntroductionsController {
  constructor(private readonly introductionsService: IntroductionsService) {}

  @Post()
  @ApiOperation({
    summary: 'Log a double opt-in introduction',
    description:
      'Called by Boardy when an advisor explicitly agrees to speak with a Stirlingshire recruiter',
  })
  @ApiParam({ name: 'vendorId', description: 'Vendor UUID' })
  @ApiResponse({ status: 201, description: 'Introduction logged successfully' })
  @ApiResponse({
    status: 200,
    description: 'Introduction already exists (idempotent)',
  })
  async create(
    @Param('vendorId', ParseUUIDPipe) vendorId: string,
    @Body() dto: CreateIntroductionDto,
    @CurrentVendor() vendor: Vendor,
  ) {
    // Ensure vendor can only create introductions for themselves
    if (vendor.id !== vendorId) {
      return this.introductionsService.create(vendor.id, dto);
    }
    return this.introductionsService.create(vendorId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List introductions with optional filters' })
  @ApiParam({ name: 'vendorId', description: 'Vendor UUID' })
  async findAll(
    @Param('vendorId', ParseUUIDPipe) vendorId: string,
    @Query() query: QueryIntroductionDto,
    @CurrentVendor() vendor: Vendor,
  ) {
    const effectiveVendorId = vendor.id !== vendorId ? vendor.id : vendorId;
    return this.introductionsService.findAll(effectiveVendorId, query);
  }

  @Get('by-crd/:crd')
  @ApiOperation({ summary: 'Get all introductions for a specific CRD' })
  @ApiParam({ name: 'vendorId', description: 'Vendor UUID' })
  @ApiParam({ name: 'crd', description: 'Candidate CRD number' })
  async findByCrd(
    @Param('vendorId', ParseUUIDPipe) vendorId: string,
    @Param('crd', ParseIntPipe) crd: number,
    @CurrentVendor() vendor: Vendor,
  ) {
    const effectiveVendorId = vendor.id !== vendorId ? vendor.id : vendorId;
    return this.introductionsService.findByCrd(effectiveVendorId, crd);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific introduction by ID' })
  @ApiParam({ name: 'vendorId', description: 'Vendor UUID' })
  @ApiParam({ name: 'id', description: 'Introduction UUID' })
  @ApiResponse({ status: 200, description: 'Introduction found' })
  @ApiResponse({ status: 404, description: 'Introduction not found' })
  async findOne(
    @Param('vendorId', ParseUUIDPipe) vendorId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentVendor() vendor: Vendor,
  ) {
    const effectiveVendorId = vendor.id !== vendorId ? vendor.id : vendorId;
    return this.introductionsService.findOne(effectiveVendorId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update introduction status' })
  @ApiParam({ name: 'vendorId', description: 'Vendor UUID' })
  @ApiParam({ name: 'id', description: 'Introduction UUID' })
  @ApiResponse({ status: 200, description: 'Introduction updated' })
  @ApiResponse({ status: 404, description: 'Introduction not found' })
  async update(
    @Param('vendorId', ParseUUIDPipe) vendorId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIntroductionDto,
    @CurrentVendor() vendor: Vendor,
  ) {
    const effectiveVendorId = vendor.id !== vendorId ? vendor.id : vendorId;
    return this.introductionsService.updateStatus(effectiveVendorId, id, dto);
  }
}
