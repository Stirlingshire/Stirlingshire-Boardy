import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type EntityType = 'INTRODUCTION' | 'HIRE' | 'PLACEMENT' | 'VENDOR';
export type EventType =
  | 'CREATED'
  | 'UPDATED'
  | 'STATUS_CHANGED'
  | 'NOTIFIED_VENDOR'
  | 'NOTIFIED_INTERNAL'
  | 'MEETING_SCHEDULED'
  | 'MEETING_CANCELED';
export type AuditSource =
  | 'SYSTEM'
  | 'BOARDY_API'
  | 'INTERNAL_API'
  | 'BROKERCHECK_SYNC'
  | 'CALENDLY_WEBHOOK';

export interface CreateAuditLogDto {
  entityType: EntityType;
  entityId: string;
  eventType: EventType;
  oldValue?: object | null;
  newValue?: object | null;
  source: AuditSource;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(dto: CreateAuditLogDto) {
    try {
      await this.prisma.auditLog.create({
        data: {
          entityType: dto.entityType,
          entityId: dto.entityId,
          eventType: dto.eventType,
          oldValue: dto.oldValue ?? undefined,
          newValue: dto.newValue ?? undefined,
          source: dto.source,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to create audit log: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async findByEntity(entityType: EntityType, entityId: string) {
    return this.prisma.auditLog.findMany({
      where: {
        entityType,
        entityId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findByDateRange(startDate: Date, endDate: Date, entityType?: EntityType) {
    return this.prisma.auditLog.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
        ...(entityType && { entityType }),
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findAll(params: {
    skip?: number;
    take?: number;
    entityType?: EntityType;
    source?: AuditSource;
  }) {
    const { skip = 0, take = 50, entityType, source } = params;

    return this.prisma.auditLog.findMany({
      where: {
        ...(entityType && { entityType }),
        ...(source && { source }),
      },
      skip,
      take,
      orderBy: {
        createdAt: 'desc',
      },
    });
  }
}
