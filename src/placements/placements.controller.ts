import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { PlacementsService } from './placements.service';
import { CreatePlacementDto, QueryPlacementDto, UpdatePlacementDto } from './dto';
import { Public } from '../common/decorators';

@ApiTags('placements')
@Controller('api/placements')
export class PlacementsController {
  constructor(private readonly placementsService: PlacementsService) {}

  @Post()
  @Public() // Internal API
  @ApiOperation({
    summary: 'Create a placement manually',
    description: 'Links an introduction to a hire to create a billable placement',
  })
  @ApiResponse({ status: 201, description: 'Placement created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid data or business rule violation' })
  @ApiResponse({ status: 404, description: 'Introduction or hire not found' })
  async create(@Body() dto: CreatePlacementDto) {
    return this.placementsService.create(dto);
  }

  @Post('match/:hireId')
  @Public()
  @ApiOperation({
    summary: 'Auto-match a hire to introductions',
    description:
      'Automatically finds and creates a placement for a hire based on CRD matching',
  })
  @ApiParam({ name: 'hireId', description: 'Hire UUID to match' })
  @ApiResponse({
    status: 200,
    description: 'Match result',
    schema: {
      properties: {
        matched: { type: 'boolean' },
        placementId: { type: 'string', nullable: true },
      },
    },
  })
  async matchHire(@Param('hireId', ParseUUIDPipe) hireId: string) {
    const placementId =
      await this.placementsService.matchHireToIntroductions(hireId);
    return {
      matched: !!placementId,
      placementId,
    };
  }

  @Get()
  @Public()
  @ApiOperation({ summary: 'List placements with optional filters' })
  async findAll(@Query() query: QueryPlacementDto) {
    return this.placementsService.findAll(query);
  }

  @Get('stats')
  @Public()
  @ApiOperation({ summary: 'Get placement summary statistics' })
  async getStats() {
    return this.placementsService.getSummaryStats();
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Get a specific placement by ID' })
  @ApiParam({ name: 'id', description: 'Placement UUID' })
  @ApiResponse({ status: 200, description: 'Placement found' })
  @ApiResponse({ status: 404, description: 'Placement not found' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.placementsService.findOne(id);
  }

  @Patch(':id')
  @Public()
  @ApiOperation({ summary: 'Update placement status' })
  @ApiParam({ name: 'id', description: 'Placement UUID' })
  @ApiResponse({ status: 200, description: 'Placement updated' })
  @ApiResponse({ status: 404, description: 'Placement not found' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePlacementDto,
  ) {
    return this.placementsService.update(id, dto);
  }
}
