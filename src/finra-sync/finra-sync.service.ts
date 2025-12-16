import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { HiresService } from '../hires/hires.service';
import { PlacementsService } from '../placements/placements.service';
import { AuditService } from '../audit/audit.service';
import { HireSource } from '../hires/dto';

interface FinraRegistration {
  crdNumber: number;
  firstName: string;
  lastName: string;
  firmCrd: number;
  firmName: string;
  registrationDate: string;
  terminationDate?: string;
}

export interface FinraSyncResult {
  processedCount: number;
  newHires: number;
  terminations: number;
  placementsCreated: number;
  errors: string[];
}

@Injectable()
export class FinraSyncService {
  private readonly logger = new Logger(FinraSyncService.name);
  private readonly finraApiUrl: string;
  private readonly finraApiKey: string;
  private readonly stirlingshireFirmCrds: number[];

  constructor(
    private readonly prisma: PrismaService,
    private readonly hiresService: HiresService,
    private readonly placementsService: PlacementsService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
  ) {
    this.finraApiUrl =
      this.configService.get<string>('FINRA_API_URL') ||
      'https://api.finra.org';
    this.finraApiKey = this.configService.get<string>('FINRA_API_KEY') || '';

    // Stirlingshire firm CRDs to monitor (configure via env or database)
    this.stirlingshireFirmCrds = [
      // Add Stirlingshire BD LLC CRD
      // Add Stirlingshire RIA LLC CRD
    ];
  }

  // Run every Sunday at 2:00 AM
  @Cron(CronExpression.EVERY_WEEK)
  async runWeeklySync(): Promise<FinraSyncResult> {
    this.logger.log('Starting weekly FINRA sync...');

    const result: FinraSyncResult = {
      processedCount: 0,
      newHires: 0,
      terminations: 0,
      placementsCreated: 0,
      errors: [],
    };

    try {
      // Fetch registrations from FINRA API
      const registrations = await this.fetchFinraRegistrations();
      result.processedCount = registrations.length;

      for (const reg of registrations) {
        try {
          await this.processRegistration(reg, result);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          result.errors.push(
            `Error processing CRD ${reg.crdNumber}: ${errorMessage}`,
          );
          this.logger.error(
            `Error processing registration for CRD ${reg.crdNumber}: ${errorMessage}`,
          );
        }
      }

      await this.auditService.log({
        entityType: 'HIRE',
        entityId: 'FINRA_SYNC_BATCH',
        eventType: 'CREATED',
        newValue: {
          syncDate: new Date().toISOString(),
          processedCount: result.processedCount,
          newHires: result.newHires,
          terminations: result.terminations,
          placementsCreated: result.placementsCreated,
          errorCount: result.errors.length,
        },
        source: 'FINRA_SYNC',
      });

      this.logger.log(
        `FINRA sync completed: ${result.newHires} new hires, ${result.terminations} terminations, ${result.placementsCreated} placements created`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`FINRA sync failed: ${errorMessage}`);
      this.logger.error(`FINRA sync failed: ${errorMessage}`);
    }

    return result;
  }

  async runManualSync(): Promise<FinraSyncResult> {
    this.logger.log('Running manual FINRA sync...');
    return this.runWeeklySync();
  }

  private async fetchFinraRegistrations(): Promise<FinraRegistration[]> {
    // In a real implementation, this would call the FINRA BrokerCheck API
    // or process a file from FINRA's data distribution service

    if (!this.finraApiKey) {
      this.logger.warn(
        'FINRA API key not configured, returning empty registrations',
      );
      return [];
    }

    try {
      // Example API call structure (actual FINRA API may differ)
      const response = await axios.get(
        `${this.finraApiUrl}/registrations/weekly`,
        {
          headers: {
            Authorization: `Bearer ${this.finraApiKey}`,
            'Content-Type': 'application/json',
          },
          params: {
            firmCrds: this.stirlingshireFirmCrds.join(','),
          },
          timeout: 60000, // 1 minute timeout for large data sets
        },
      );

      return response.data.registrations || [];
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to fetch FINRA registrations: ${errorMessage}`);

      // For development/testing, return mock data
      if (process.env.NODE_ENV === 'development') {
        return this.getMockRegistrations();
      }

      throw error;
    }
  }

  private async processRegistration(
    reg: FinraRegistration,
    result: FinraSyncResult,
  ): Promise<void> {
    // Determine firm entity name from CRD
    const firmEntity = this.getFirmEntityName(reg.firmCrd);

    if (reg.terminationDate) {
      // Handle termination
      const existingHire = await this.prisma.hire.findFirst({
        where: {
          crdNumber: BigInt(reg.crdNumber),
          firmCrd: BigInt(reg.firmCrd),
          terminationDate: null,
        },
      });

      if (existingHire) {
        await this.prisma.hire.update({
          where: { id: existingHire.id },
          data: { terminationDate: new Date(reg.terminationDate) },
        });

        await this.auditService.log({
          entityType: 'HIRE',
          entityId: existingHire.id,
          eventType: 'UPDATED',
          oldValue: { terminationDate: null },
          newValue: { terminationDate: reg.terminationDate },
          source: 'FINRA_SYNC',
        });

        result.terminations++;
        this.logger.log(
          `Recorded termination for CRD ${reg.crdNumber} at ${firmEntity}`,
        );
      }
    } else {
      // Handle new registration (hire)
      const existingHire = await this.prisma.hire.findFirst({
        where: {
          crdNumber: BigInt(reg.crdNumber),
          firmCrd: BigInt(reg.firmCrd),
          hireDate: new Date(reg.registrationDate),
        },
      });

      if (!existingHire) {
        const hire = await this.hiresService.create(
          {
            crdNumber: reg.crdNumber,
            firstName: reg.firstName,
            lastName: reg.lastName,
            firmEntity,
            firmCrd: reg.firmCrd,
            hireDate: reg.registrationDate,
            source: HireSource.FINRA_WEEKLY_SYNC,
            rawSourceReference: `FINRA-${new Date().toISOString().split('T')[0]}`,
          },
          'FINRA_SYNC',
        );

        result.newHires++;

        // Try to match to introductions
        try {
          const hireId = hire.id as string;
          const placementId =
            await this.placementsService.matchHireToIntroductions(hireId);
          if (placementId) {
            result.placementsCreated++;
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          this.logger.warn(
            `Could not match hire ${hire.id} to introductions: ${errorMessage}`,
          );
        }
      }
    }
  }

  private getFirmEntityName(firmCrd: number): string {
    // Map firm CRDs to entity names
    // In production, this would likely come from a database table
    const firmMap: Record<number, string> = {
      // Example mappings
      12345: 'Stirlingshire BD LLC',
      12346: 'Stirlingshire RIA LLC',
    };

    return firmMap[firmCrd] || `Stirlingshire Entity (CRD: ${firmCrd})`;
  }

  private getMockRegistrations(): FinraRegistration[] {
    // Mock data for development/testing
    return [
      {
        crdNumber: 1234567,
        firstName: 'Test',
        lastName: 'Advisor',
        firmCrd: 12345,
        firmName: 'Stirlingshire BD LLC',
        registrationDate: new Date().toISOString().split('T')[0],
      },
    ];
  }
}
