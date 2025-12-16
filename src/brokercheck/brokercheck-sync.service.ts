import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { HiresService } from '../hires/hires.service';
import { PlacementsService } from '../placements/placements.service';
import { AuditService } from '../audit/audit.service';
import { SlackService } from '../notifications/slack.service';
import { HireSource } from '../hires/dto';
import { BrokerCheckApiClient } from './brokercheck-api.client';
import { BrokerCheckSyncResult } from './dto';

@Injectable()
export class BrokerCheckSyncService implements OnModuleInit {
  private readonly logger = new Logger(BrokerCheckSyncService.name);
  private readonly firmCrd: number;
  private readonly firmName: string;
  private readonly isEnabled: boolean;
  private consecutiveFailures = 0;
  private readonly maxFailures = 5;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly apiClient: BrokerCheckApiClient,
    private readonly hiresService: HiresService,
    private readonly placementsService: PlacementsService,
    private readonly auditService: AuditService,
    private readonly slackService: SlackService,
  ) {
    this.firmCrd = this.configService.get<number>('STIRLINGSHIRE_FIRM_CRD', 310576);
    this.firmName = this.configService.get<string>('STIRLINGSHIRE_FIRM_NAME', 'Stirlingshire');
    this.isEnabled = this.configService.get<boolean>('BROKERCHECK_SYNC_ENABLED', true);
  }

  async onModuleInit() {
    this.logger.log(
      `BrokerCheck sync initialized: firmCrd=${this.firmCrd}, enabled=${this.isEnabled}`,
    );
  }

  /**
   * Weekly sync - runs every Sunday at 2:00 AM
   * Checks if any candidates from OPEN introductions have become registered at Stirlingshire
   */
  @Cron(CronExpression.EVERY_WEEK)
  async runWeeklySync(): Promise<BrokerCheckSyncResult> {
    if (!this.isEnabled) {
      this.logger.log('BrokerCheck sync is disabled');
      return this.createEmptyResult('Sync disabled');
    }

    // Circuit breaker check
    if (this.consecutiveFailures >= this.maxFailures) {
      this.logger.warn('Circuit breaker open - too many consecutive failures');
      await this.notifySyncFailure('Circuit breaker open after repeated failures');
      return this.createEmptyResult('Circuit breaker open');
    }

    this.logger.log('Starting BrokerCheck weekly sync...');
    const startTime = Date.now();
    const result: BrokerCheckSyncResult = {
      syncedAt: new Date(),
      totalFetched: 0,
      newAdvisors: 0,
      departedAdvisors: 0,
      existingAdvisors: 0,
      hiresCreated: 0,
      placementsCreated: 0,
      errors: [],
    };

    try {
      // Step 1: Get all OPEN introductions (candidates who opted in but not yet placed)
      const openIntroductions = await this.prisma.introduction.findMany({
        where: { status: 'OPEN' },
        include: { vendor: true },
      });

      // Get unique CRD numbers from open introductions
      const candidateCrds = [...new Set(openIntroductions.map((i) => Number(i.candidateCrd)))];
      result.totalFetched = candidateCrds.length;

      this.logger.log(
        `Checking ${candidateCrds.length} unique candidates from ${openIntroductions.length} open introductions`,
      );

      if (candidateCrds.length === 0) {
        this.logger.log('No open introductions to check');
        return result;
      }

      // Step 2: Verify each candidate CRD against BrokerCheck for Stirlingshire registration
      for (const crd of candidateCrds) {
        try {
          const advisor = await this.apiClient.verifyAdvisorAtFirm(crd, this.firmCrd);

          if (advisor) {
            // Candidate is now registered at Stirlingshire!
            this.logger.log(
              `Found hire: ${advisor.firstName} ${advisor.lastName} (CRD: ${crd}) is now at Stirlingshire`,
            );
            result.newAdvisors++;

            // Create Hire record
            const hireResult = await this.hiresService.create(
              {
                crdNumber: advisor.crdNumber,
                firstName: advisor.firstName,
                lastName: advisor.lastName,
                firmEntity: advisor.firmName,
                firmCrd: advisor.firmCrd,
                hireDate: new Date().toISOString().split('T')[0],
                source: HireSource.BROKERCHECK_SYNC,
                rawSourceReference: `BROKERCHECK-${new Date().toISOString().split('T')[0]}`,
              },
              'BROKERCHECK_SYNC',
            );

            result.hiresCreated++;

            // Match to open introductions and create placements
            const hireId = (hireResult as { id: string }).id;
            const placementId = await this.placementsService.matchHireToIntroductions(hireId);

            if (placementId) {
              result.placementsCreated++;
              this.logger.log(
                `Placement created for ${advisor.firstName} ${advisor.lastName} (CRD: ${crd})`,
              );
            }

            // Track in BrokerCheckAdvisor table
            await this.trackAdvisor(advisor);
          }

          // Rate limiting - 500ms between requests
          await new Promise((resolve) => setTimeout(resolve, 500));
        } catch (error) {
          const errorMsg = `Error checking CRD ${crd}: ${error.message}`;
          this.logger.error(errorMsg);
          result.errors.push(errorMsg);
        }
      }

      // Reset circuit breaker on success
      this.consecutiveFailures = 0;

      // Log audit trail
      await this.auditService.log({
        entityType: 'HIRE',
        entityId: 'BROKERCHECK_SYNC_BATCH',
        eventType: 'CREATED',
        newValue: {
          candidatesChecked: result.totalFetched,
          newHires: result.newAdvisors,
          hiresCreated: result.hiresCreated,
          placementsCreated: result.placementsCreated,
          errorCount: result.errors.length,
        },
        source: 'BROKERCHECK_SYNC',
      });

      const duration = Date.now() - startTime;
      this.logger.log(
        `BrokerCheck sync completed in ${duration}ms: ` +
        `${result.totalFetched} candidates checked, ${result.newAdvisors} new hires found, ` +
        `${result.placementsCreated} placements created`,
      );

      return result;
    } catch (error) {
      this.consecutiveFailures++;
      const errorMsg = `BrokerCheck sync failed: ${error.message}`;
      this.logger.error(errorMsg);
      result.errors.push(errorMsg);

      await this.notifySyncFailure(errorMsg);

      return result;
    }
  }

  /**
   * Track an advisor in the BrokerCheckAdvisor table
   */
  private async trackAdvisor(advisor: {
    crdNumber: number;
    firstName: string;
    lastName: string;
    firmCrd: number;
    firmName: string;
  }): Promise<void> {
    const now = new Date();

    await this.prisma.brokerCheckAdvisor.upsert({
      where: { crdNumber: BigInt(advisor.crdNumber) },
      update: {
        firstName: advisor.firstName,
        lastName: advisor.lastName,
        firmCrd: BigInt(advisor.firmCrd),
        firmName: advisor.firmName,
        lastSeen: now,
        isActive: true,
      },
      create: {
        crdNumber: BigInt(advisor.crdNumber),
        firstName: advisor.firstName,
        lastName: advisor.lastName,
        firmCrd: BigInt(advisor.firmCrd),
        firmName: advisor.firmName,
        firstSeen: now,
        lastSeen: now,
        isActive: true,
      },
    });
  }

  /**
   * Send Slack notification on sync failure
   */
  private async notifySyncFailure(message: string): Promise<void> {
    try {
      await this.slackService.notifyOutreachUpdate(
        `BrokerCheck Sync Failed`,
        [
          {
            name: 'Error',
            title: message,
            description: `Consecutive failures: ${this.consecutiveFailures}`,
          },
        ],
      );
    } catch (error) {
      this.logger.error(`Failed to send Slack notification: ${error.message}`);
    }
  }

  /**
   * Create an empty result object
   */
  private createEmptyResult(reason: string): BrokerCheckSyncResult {
    return {
      syncedAt: new Date(),
      totalFetched: 0,
      newAdvisors: 0,
      departedAdvisors: 0,
      existingAdvisors: 0,
      hiresCreated: 0,
      placementsCreated: 0,
      errors: [reason],
    };
  }

  /**
   * Get current sync status
   */
  async getSyncStatus(): Promise<{
    lastSync: Date | null;
    openIntroductions: number;
    uniqueCandidates: number;
    trackedAdvisors: number;
    consecutiveFailures: number;
    isEnabled: boolean;
  }> {
    const [openCount, trackedCount, lastLog] = await Promise.all([
      this.prisma.introduction.count({ where: { status: 'OPEN' } }),
      this.prisma.brokerCheckAdvisor.count({ where: { firmCrd: BigInt(this.firmCrd) } }),
      this.prisma.auditLog.findFirst({
        where: { entityId: 'BROKERCHECK_SYNC_BATCH', source: 'BROKERCHECK_SYNC' },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Get unique candidate count from open introductions
    const uniqueCandidates = await this.prisma.introduction.findMany({
      where: { status: 'OPEN' },
      select: { candidateCrd: true },
      distinct: ['candidateCrd'],
    });

    return {
      lastSync: lastLog?.createdAt || null,
      openIntroductions: openCount,
      uniqueCandidates: uniqueCandidates.length,
      trackedAdvisors: trackedCount,
      consecutiveFailures: this.consecutiveFailures,
      isEnabled: this.isEnabled,
    };
  }

  /**
   * Manually check a specific CRD number against BrokerCheck
   * Useful for testing or ad-hoc verification
   */
  async checkCrd(crd: number): Promise<{
    found: boolean;
    atStirlingshire: boolean;
    advisor?: {
      crdNumber: number;
      firstName: string;
      lastName: string;
      firmCrd: number;
      firmName: string;
    };
  }> {
    try {
      const advisor = await this.apiClient.verifyAdvisorAtFirm(crd, this.firmCrd);

      if (advisor) {
        return {
          found: true,
          atStirlingshire: true,
          advisor,
        };
      }

      // Check if found at all (just not at Stirlingshire)
      const individual = await this.apiClient.searchByCrd(crd);

      return {
        found: !!individual,
        atStirlingshire: false,
      };
    } catch (error) {
      this.logger.error(`Error checking CRD ${crd}: ${error.message}`);
      throw error;
    }
  }
}
