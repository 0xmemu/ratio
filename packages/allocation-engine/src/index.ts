/**
 * @package allocation-engine
 * Calculates how much capital to allocate to each pool/strategy bucket.
 * Enforces capital splits defined in v1 config.
 */

export interface AllocationBuckets {
  coreIncome: number;       // 0.65
  activeBalanced: number;   // 0.25
  layeredPositions: number; // 0.10
  experimental: number;     // 0.00 (locked in v1)
}

export interface AllocationInput {
  totalCapitalUsd: number;
  buckets: AllocationBuckets;
  poolScores: Array<{
    poolAddress: string;
    score: number;
    bucket: keyof AllocationBuckets;
  }>;
}

export interface AllocationOutput {
  poolAddress: string;
  bucket: keyof AllocationBuckets;
  allocatedUsd: number;
  allocationPct: number;
}

const DEFAULT_BUCKETS: AllocationBuckets = {
  coreIncome: 0.65,
  activeBalanced: 0.25,
  layeredPositions: 0.10,
  experimental: 0.00,
};

/**
 * AllocationEngine — distributes capital across pools respecting bucket splits.
 * Experimental bucket is locked at 0 in v1.
 */
export class AllocationEngine {
  private buckets: AllocationBuckets;

  constructor(buckets: Partial<AllocationBuckets> = {}) {
    this.buckets = { ...DEFAULT_BUCKETS, ...buckets };
    // v1 safety: experimental always 0
    this.buckets.experimental = 0;
  }

  allocate(input: AllocationInput): AllocationOutput[] {
    const result: AllocationOutput[] = [];
    const bucketKeys = Object.keys(this.buckets) as Array<keyof AllocationBuckets>;

    for (const bucket of bucketKeys) {
      const bucketCapital = input.totalCapitalUsd * this.buckets[bucket];
      if (bucketCapital <= 0) continue;

      const bucketPools = input.poolScores.filter((p) => p.bucket === bucket);
      if (bucketPools.length === 0) continue;

      const totalScore = bucketPools.reduce((s, p) => s + p.score, 0);

      for (const pool of bucketPools) {
        const weight = totalScore > 0 ? pool.score / totalScore : 1 / bucketPools.length;
        const allocatedUsd = bucketCapital * weight;
        result.push({
          poolAddress: pool.poolAddress,
          bucket,
          allocatedUsd,
          allocationPct: weight * this.buckets[bucket],
        });
      }
    }

    return result;
  }
}

export default AllocationEngine;
