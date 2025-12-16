import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiSecurity, ApiResponse } from '@nestjs/swagger';
import { VendorsService } from './vendors.service';
import { CreateVendorDto, UpdateVendorDto } from './dto';
import { Public } from '../common/decorators';

@ApiTags('vendors')
@Controller('api/vendors')
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  @Post()
  @Public() // Creating vendors requires internal auth, not vendor API key
  @ApiOperation({ summary: 'Create a new vendor (internal use)' })
  @ApiResponse({ status: 201, description: 'Vendor created successfully' })
  @ApiResponse({ status: 409, description: 'Vendor with name already exists' })
  async create(@Body() dto: CreateVendorDto) {
    return this.vendorsService.create(dto);
  }

  @Get()
  @Public()
  @ApiOperation({ summary: 'List all vendors' })
  async findAll() {
    return this.vendorsService.findAll();
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Get a vendor by ID' })
  @ApiResponse({ status: 200, description: 'Vendor found' })
  @ApiResponse({ status: 404, description: 'Vendor not found' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.vendorsService.findOne(id);
  }

  @Patch(':id')
  @Public()
  @ApiOperation({ summary: 'Update a vendor (internal use)' })
  @ApiResponse({ status: 200, description: 'Vendor updated successfully' })
  @ApiResponse({ status: 404, description: 'Vendor not found' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVendorDto,
  ) {
    return this.vendorsService.update(id, dto);
  }

  @Post(':id/rotate-api-key')
  @Public()
  @ApiOperation({ summary: 'Rotate API key for a vendor (internal use)' })
  @ApiResponse({
    status: 200,
    description: 'New API key generated',
    schema: {
      properties: {
        apiKey: { type: 'string', description: 'The new API key' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Vendor not found' })
  async rotateApiKey(@Param('id', ParseUUIDPipe) id: string) {
    return this.vendorsService.rotateApiKey(id);
  }
}
