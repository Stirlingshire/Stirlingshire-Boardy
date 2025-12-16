import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateVendorDto, UpdateVendorDto } from './dto';

@Injectable()
export class VendorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private hashApiKey(apiKey: string): string {
    return createHash('sha256').update(apiKey).digest('hex');
  }

  async create(dto: CreateVendorDto) {
    // Check if vendor with same name exists
    const existing = await this.prisma.vendor.findFirst({
      where: { name: dto.name },
    });

    if (existing) {
      throw new ConflictException(`Vendor with name "${dto.name}" already exists`);
    }

    const vendor = await this.prisma.vendor.create({
      data: {
        name: dto.name,
        placementTerms: dto.placementTerms
          ? JSON.parse(JSON.stringify(dto.placementTerms))
          : undefined,
        webhookUrl: dto.webhookUrl,
        apiKeyHash: this.hashApiKey(dto.apiKey),
      },
    });

    await this.auditService.log({
      entityType: 'VENDOR',
      entityId: vendor.id,
      eventType: 'CREATED',
      newValue: {
        name: vendor.name,
        webhookUrl: vendor.webhookUrl,
        placementTerms: vendor.placementTerms,
      },
      source: 'INTERNAL_API',
    });

    // Return vendor without exposing the hash
    const { apiKeyHash: _, ...result } = vendor;
    return result;
  }

  async findAll() {
    const vendors = await this.prisma.vendor.findMany({
      select: {
        id: true,
        name: true,
        placementTerms: true,
        webhookUrl: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { name: 'asc' },
    });

    return vendors;
  }

  async findOne(id: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        placementTerms: true,
        webhookUrl: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            introductions: true,
            placements: true,
          },
        },
      },
    });

    if (!vendor) {
      throw new NotFoundException(`Vendor with ID "${id}" not found`);
    }

    return vendor;
  }

  async update(id: string, dto: UpdateVendorDto) {
    const existing = await this.prisma.vendor.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`Vendor with ID "${id}" not found`);
    }

    const updateData: Record<string, unknown> = {};

    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.placementTerms !== undefined)
      updateData.placementTerms = dto.placementTerms;
    if (dto.webhookUrl !== undefined) updateData.webhookUrl = dto.webhookUrl;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;
    if (dto.newApiKey !== undefined) {
      updateData.apiKeyHash = this.hashApiKey(dto.newApiKey);
    }

    const vendor = await this.prisma.vendor.update({
      where: { id },
      data: updateData,
    });

    await this.auditService.log({
      entityType: 'VENDOR',
      entityId: vendor.id,
      eventType: 'UPDATED',
      oldValue: {
        name: existing.name,
        webhookUrl: existing.webhookUrl,
        placementTerms: existing.placementTerms,
        isActive: existing.isActive,
      },
      newValue: {
        name: vendor.name,
        webhookUrl: vendor.webhookUrl,
        placementTerms: vendor.placementTerms,
        isActive: vendor.isActive,
      },
      source: 'INTERNAL_API',
    });

    const { apiKeyHash: _, ...result } = vendor;
    return result;
  }

  async generateApiKey(): Promise<string> {
    return randomBytes(32).toString('hex');
  }

  async rotateApiKey(id: string): Promise<{ apiKey: string }> {
    const existing = await this.prisma.vendor.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`Vendor with ID "${id}" not found`);
    }

    const newApiKey = await this.generateApiKey();

    await this.prisma.vendor.update({
      where: { id },
      data: { apiKeyHash: this.hashApiKey(newApiKey) },
    });

    await this.auditService.log({
      entityType: 'VENDOR',
      entityId: id,
      eventType: 'UPDATED',
      newValue: { action: 'API_KEY_ROTATED' },
      source: 'INTERNAL_API',
    });

    return { apiKey: newApiKey };
  }
}
