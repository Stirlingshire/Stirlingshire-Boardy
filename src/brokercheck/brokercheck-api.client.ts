import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import {
  BrokerCheckSearchResponse,
  BrokerCheckIndividual,
  AdvisorRecord,
} from './dto';

@Injectable()
export class BrokerCheckApiClient {
  private readonly logger = new Logger(BrokerCheckApiClient.name);
  private readonly client: AxiosInstance;
  private readonly baseUrl = 'https://api.brokercheck.finra.org';

  constructor(private readonly configService: ConfigService) {
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
  }

  /**
   * Search for an individual by CRD number
   * Returns the individual's current employment info
   */
  async searchByCrd(crd: number): Promise<BrokerCheckIndividual | null> {
    try {
      const response = await this.client.get('/search/individual', {
        params: {
          query: crd.toString(),
          filter: 'active=true,prev=false,bar=false',
          nrows: 1,
          start: 0,
          wt: 'json',
        },
      });

      const hits = response.data?.hits?.hits || [];
      if (hits.length === 0) {
        return null;
      }

      return hits[0]._source;
    } catch (error) {
      this.logger.error('Failed to search by CRD ' + crd + ': ' + error.message);
      throw error;
    }
  }

  /**
   * Verify if an individual is currently registered at a specific firm
   * Returns the advisor record if found, null otherwise
   */
  async verifyAdvisorAtFirm(
    crd: number,
    firmCrd: number,
  ): Promise<AdvisorRecord | null> {
    const individual = await this.searchByCrd(crd);

    if (!individual) {
      this.logger.debug('CRD ' + crd + ' not found in BrokerCheck');
      return null;
    }

    const employment = individual.ind_current_employments?.find(
      (emp) => emp.firm_id === firmCrd,
    );

    if (!employment) {
      this.logger.debug(
        'CRD ' + crd + ' (' + individual.ind_firstname + ' ' + individual.ind_lastname + ') not currently at firm ' + firmCrd,
      );
      return null;
    }

    return {
      crdNumber: parseInt(individual.ind_source_id, 10),
      firstName: individual.ind_firstname || '',
      lastName: individual.ind_lastname || '',
      firmCrd: employment.firm_id,
      firmName: employment.firm_name,
    };
  }

  /**
   * Verify multiple advisors against a firm
   * Returns list of advisors currently at the firm and those who departed
   */
  async verifyAdvisorsAtFirm(
    crdNumbers: number[],
    firmCrd: number,
  ): Promise<{ active: AdvisorRecord[]; departed: number[] }> {
    const active: AdvisorRecord[] = [];
    const departed: number[] = [];

    this.logger.log('Verifying ' + crdNumbers.length + ' advisors against firm ' + firmCrd);

    for (const crd of crdNumbers) {
      try {
        const advisor = await this.verifyAdvisorAtFirm(crd, firmCrd);

        if (advisor) {
          active.push(advisor);
        } else {
          departed.push(crd);
        }

        // Rate limiting - 500ms between requests
        await this.delay(500);
      } catch (error) {
        this.logger.error('Error verifying CRD ' + crd + ': ' + error.message);
        // Continue with other CRDs
      }
    }

    this.logger.log(
      'Verification complete: ' + active.length + ' active, ' + departed.length + ' departed',
    );

    return { active, departed };
  }

  /**
   * Get all advisors currently registered at a specific firm
   * NOTE: The BrokerCheck API doesnt support direct firm-based individual queries.
   * This method returns empty and the sync relies on seed data + verification workflow.
   */
  async getAllAdvisorsAtFirm(
    firmName: string,
    firmCrd: number,
  ): Promise<AdvisorRecord[]> {
    this.logger.log('Fetching advisors for firm: ' + firmName + ' (CRD: ' + firmCrd + ')');

    // Note: The public BrokerCheck API doesnt support searching by firm for individuals.
    // This returns empty and relies on seed data + verification workflow.
    this.logger.warn(
      'BrokerCheck API does not support firm-based individual search. ' +
      'Use seed endpoint to populate initial advisors from internal systems.',
    );

    return [];
  }

  /**
   * Delay helper for rate limiting
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Retry wrapper with exponential backoff
   */
  async withRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    maxRetries: number = 3,
  ): Promise<T> {
    const delays = [1000, 2000, 4000]; // Exponential backoff

    for (let i = 0; i < maxRetries; i++) {
      try {
        return await operation();
      } catch (error) {
        const isLastAttempt = i === maxRetries - 1;

        if (isLastAttempt) {
          this.logger.error(
            operationName + ' failed after ' + maxRetries + ' attempts: ' + error.message,
          );
          throw error;
        }

        this.logger.warn(
          operationName + ' attempt ' + (i + 1) + ' failed, retrying in ' + delays[i] + 'ms',
        );
        await this.delay(delays[i]);
      }
    }

    throw new Error(operationName + ' failed after all retries');
  }
}
