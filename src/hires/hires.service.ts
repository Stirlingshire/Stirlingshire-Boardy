import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, AuditSource } from '../audit/audit.service';
import { CreateHireDto, QueryHireDto, UpdateHireDto, HireSource } from './dto';

export interface HireCreatedEvent {
  hireId: string;
  crdNumber: bigint;
  hireDate: Date;
  firmEntity: string;
  source: string;
}

@Injectable()
export class HiresService {
  private readonly logger = new Logger(HiresService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(dto: CreateHireDto, auditSource: AuditSource = 'INTERNAL_API') {
    // Check if this hire already exists (same CRD, firm, hire date)
    const existing = await this.prisma.hire.findFirst({
      where: {
        crdNumber: BigInt(dto.crdNumber),
        firmEntity: dto.firmEntity,
        hireDate: new Date(dto.hireDate),
      },
    });

    if (existing) {
      this.logger.log(
        `Hire already exists for CRD ${dto.crdNumber} at ${dto.firmEntity} on ${dto.hireDate}`,
      );
      return this.serializeHire(existing);
    }

    const hire = await this.prisma.hire.create({
      data: {
        crdNumber: BigInt(dto.crdNumber),
        firstName: dto.firstName,
        lastName: dto.lastName,
        firmEntity: dto.firmEntity,
        firmCrd: dto.firmCrd ? BigInt(dto.firmCrd) : null,
        hireDate: new Date(dto.hireDate),
        source: dto.source || HireSource.INTERNAL_ONBOARDING,
        rawSourceReference: dto.rawSourceReference,
      },
    });

    await this.auditService.log({
      entityType: 'HIRE',
      entityId: hire.id,
      eventType: 'CREATED',
      newValue: {
        crdNumber: dto.crdNumber,
        name: `${dto.firstName} ${dto.lastName}`,
        firmEntity: dto.firmEntity,
        hireDate: dto.hireDate,
        source: dto.source,
      },
      source: auditSource,
    });

    this.logger.log(
      `Created hire record for CRD ${dto.crdNumber} at ${dto.firmEntity}`,
    );

    return this.serializeHire(hire);
  }

  async findAll(query: QueryHireDto) {
    const { skip = 0, take = 50, crdNumber, firmEntity, fromDate, toDate, source } = query;

    const where: Record<string, unknown> = {};

    if (crdNumber) {
      where.crdNumber = BigInt(crdNumber);
    }
    if (firmEntity) {
      where.firmEntity = { contains: firmEntity, mode: 'insensitive' };
    }
    if (source) {
      where.source = source;
    }
    if (fromDate || toDate) {
      where.hireDate = {};
      if (fromDate) {
        (where.hireDate as Record<string, Date>).gte = new Date(fromDate);
      }
      if (toDate) {
        (where.hireDate as Record<string, Date>).lte = new Date(toDate);
      }
    }

    const [hires, total] = await Promise.all([
      this.prisma.hire.findMany({
        where,
        skip,
        take,
        orderBy: { hireDate: 'desc' },
        include: {
          placements: {
            select: {
              id: true,
              vendorId: true,
              status: true,
            },
          },
        },
      }),
      this.prisma.hire.count({ where }),
    ]);

    return {
      data: hires.map((hire) => this.serializeHire(hire)),
      meta: {
        total,
        skip,
        take,
        hasMore: skip + take < total,
      },
    };
  }

  async findOne(id: string) {
    const hire = await this.prisma.hire.findUnique({
      where: { id },
      include: {
        placements: {
          include: {
            vendor: {
              select: { id: true, name: true },
            },
            introduction: {
              select: {
                id: true,
                conversationId: true,
                introTimestamp: true,
              },
            },
          },
        },
      },
    });

    if (!hire) {
      throw new NotFoundException(`Hire with ID "${id}" not found`);
    }

    return this.serializeHire(hire);
  }

  async findByCrd(crd: number) {
    const hires = await this.prisma.hire.findMany({
      where: { crdNumber: BigInt(crd) },
      orderBy: { hireDate: 'desc' },
      include: {
        placements: {
          select: {
            id: true,
            vendorId: true,
            status: true,
          },
        },
      },
    });

    return hires.map((hire) => this.serializeHire(hire));
  }

  async update(id: string, dto: UpdateHireDto) {
    const existing = await this.prisma.hire.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`Hire with ID "${id}" not found`);
    }

    const hire = await this.prisma.hire.update({
      where: { id },
      data: {
        terminationDate: dto.terminationDate
          ? new Date(dto.terminationDate)
          : null,
      },
    });

    await this.auditService.log({
      entityType: 'HIRE',
      entityId: id,
      eventType: 'UPDATED',
      oldValue: { terminationDate: existing.terminationDate },
      newValue: { terminationDate: hire.terminationDate },
      source: 'INTERNAL_API',
    });

    return this.serializeHire(hire);
  }

  async getRecentHires(days: number = 7) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const hires = await this.prisma.hire.findMany({
      where: {
        hireDate: { gte: since },
      },
      orderBy: { hireDate: 'desc' },
    });

    return hires.map((hire) => this.serializeHire(hire));
  }

  private serializeHire(hire: Record<string, unknown>) {
    const serialized = { ...hire };
    if (serialized.crdNumber) {
      serialized.crdNumber = Number(serialized.crdNumber);
    }
    if (serialized.firmCrd) {
      serialized.firmCrd = Number(serialized.firmCrd);
    }
    return serialized;
  }
}
