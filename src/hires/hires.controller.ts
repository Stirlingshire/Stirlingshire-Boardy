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
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { HiresService } from './hires.service';
import { CreateHireDto, QueryHireDto, UpdateHireDto } from './dto';
import { Public } from '../common/decorators';

@ApiTags('hires')
@Controller('api/hires')
export class HiresController {
  constructor(private readonly hiresService: HiresService) {}

  @Post()
  @Public() // Internal API - requires different auth in production
  @ApiOperation({
    summary: 'Record a new hire',
    description:
      'Called by internal onboarding systems when an advisor is hired',
  })
  @ApiResponse({ status: 201, description: 'Hire recorded successfully' })
  @ApiResponse({
    status: 200,
    description: 'Hire already exists (idempotent)',
  })
  async create(@Body() dto: CreateHireDto) {
    return this.hiresService.create(dto);
  }

  @Get()
  @Public()
  @ApiOperation({ summary: 'List hires with optional filters' })
  async findAll(@Query() query: QueryHireDto) {
    return this.hiresService.findAll(query);
  }

  @Get('recent')
  @Public()
  @ApiOperation({ summary: 'Get recent hires from the last N days' })
  async getRecent(@Query('days', ParseIntPipe) days: number = 7) {
    return this.hiresService.getRecentHires(days);
  }

  @Get('by-crd/:crd')
  @Public()
  @ApiOperation({ summary: 'Get all hires for a specific CRD' })
  @ApiParam({ name: 'crd', description: 'Advisor CRD number' })
  async findByCrd(@Param('crd', ParseIntPipe) crd: number) {
    return this.hiresService.findByCrd(crd);
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Get a specific hire by ID' })
  @ApiParam({ name: 'id', description: 'Hire UUID' })
  @ApiResponse({ status: 200, description: 'Hire found' })
  @ApiResponse({ status: 404, description: 'Hire not found' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.hiresService.findOne(id);
  }

  @Patch(':id')
  @Public()
  @ApiOperation({ summary: 'Update hire (e.g., set termination date)' })
  @ApiParam({ name: 'id', description: 'Hire UUID' })
  @ApiResponse({ status: 200, description: 'Hire updated' })
  @ApiResponse({ status: 404, description: 'Hire not found' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateHireDto,
  ) {
    return this.hiresService.update(id, dto);
  }
}
