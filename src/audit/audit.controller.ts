import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiSecurity } from '@nestjs/swagger';
import { AuditService, EntityType } from './audit.service';
import { QueryAuditDto } from './dto/query-audit.dto';

@ApiTags('audit')
@ApiSecurity('api-key')
@Controller('api/audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'List audit logs with optional filters' })
  async findAll(@Query() query: QueryAuditDto) {
    if (query.startDate && query.endDate) {
      return this.auditService.findByDateRange(
        new Date(query.startDate),
        new Date(query.endDate),
        query.entityType,
      );
    }

    return this.auditService.findAll({
      skip: query.skip,
      take: query.take,
      entityType: query.entityType,
      source: query.source,
    });
  }

  @Get(':entityType/:entityId')
  @ApiOperation({ summary: 'Get audit logs for a specific entity' })
  async findByEntity(
    @Param('entityType') entityType: EntityType,
    @Param('entityId') entityId: string,
  ) {
    return this.auditService.findByEntity(entityType, entityId);
  }
}
