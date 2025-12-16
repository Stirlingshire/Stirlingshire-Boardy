/**
 * BrokerCheck API Response Interfaces
 * Based on the public API at api.brokercheck.finra.org
 */

export interface BrokerCheckSearchResponse {
  hits: {
    total: number;
    hits: Array<{
      _id: string;
      _type: string;
      _source: BrokerCheckIndividual;
      highlight?: Record<string, string[]>;
    }>;
  };
}

export interface BrokerCheckIndividual {
  ind_source_id: string; // CRD number
  ind_firstname: string;
  ind_middlename?: string;
  ind_lastname: string;
  ind_namesuffix?: string;
  ind_other_names?: string[];
  ind_bc_scope?: string; // Registration scope (e.g., "B" for Broker)
  ind_ia_scope?: string; // Investment Advisor scope
  ind_industry_cal_date?: string; // Industry calculation date
  ind_current_employments: BrokerCheckEmployment[];
}

export interface BrokerCheckEmployment {
  firm_id: number; // Firm CRD
  firm_name: string;
  branch_city?: string;
  branch_state?: string;
  ia_only?: boolean;
}

/**
 * Simplified advisor record for internal use
 */
export interface AdvisorRecord {
  crdNumber: number;
  firstName: string;
  lastName: string;
  firmCrd: number;
  firmName: string;
}

/**
 * Result of a sync operation
 */
export interface BrokerCheckSyncResult {
  syncedAt: Date;
  totalFetched: number;
  newAdvisors: number;
  departedAdvisors: number;
  existingAdvisors: number;
  hiresCreated: number;
  placementsCreated: number;
  errors: string[];
}

/**
 * Comparison result between BrokerCheck data and database
 */
export interface SyncComparison {
  newAdvisors: AdvisorRecord[];
  departedCrdNumbers: bigint[];
  existingCrdNumbers: bigint[];
}
