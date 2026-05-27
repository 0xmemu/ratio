/**
 * vector-memory.ts
 * In-memory vector store for strategy embeddings.
 * No external DB dependency in v1 — pure in-process cosine similarity.
 * Swap store[] with a real vector DB (Pinecone/Qdrant) in production.
 */

export interface StrategyEmbedding {
  id: string;
  poolAddress: string;
  strategyType: string;
  vector: number[];       // feature vector
  metadata: {
    timestamp: number;
    feeApr: number;
    volatilityScore: number;
    confidence: number;
    outcome?: 'profitable' | 'loss' | 'unknown';
    actualProfitUsd?: number;
  };
}

export interface SimilarStrategy {
  embedding: StrategyEmbedding;
  similarity: number;  // 0–1
}

export class VectorMemory {
  private store: StrategyEmbedding[] = [];
  private readonly MAX_ENTRIES = 500;

  /**
   * Build a feature vector from strategy metadata.
   * Dimensions: [feeApr, volatility, confidence, strategyTypeEncoded, ageHours]
   */
  buildVector(params: {
    feeApr: number;
    volatilityScore: number;
    confidence: number;
    strategyType: string;
    timestamp: number;
  }): number[] {
    const typeMap: Record<string, number> = {
      narrow: 0.2,
      medium: 0.5,
      wide: 0.8,
      'full-range': 1.0,
    };
    const ageHoursNorm = Math.min(
      1,
      (Date.now() - params.timestamp) / (1000 * 60 * 60 * 24 * 7) // normalize to 1 week
    );
    return [
      params.feeApr / 100,             // normalize to 0-1 assuming max 100% APR
      params.volatilityScore / 10,     // normalize to 0-1
      params.confidence / 100,         // normalize to 0-1
      typeMap[params.strategyType] ?? 0.5,
      1 - ageHoursNorm,                // recency (1=very recent, 0=old)
    ];
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    const dot = a.reduce((sum, v, i) => sum + v * b[i], 0);
    const magA = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0));
    const magB = Math.sqrt(b.reduce((sum, v) => sum + v * v, 0));
    return magA > 0 && magB > 0 ? dot / (magA * magB) : 0;
  }

  store_embedding(embedding: StrategyEmbedding): void {
    // Evict oldest if over capacity
    if (this.store.length >= this.MAX_ENTRIES) {
      this.store.sort((a, b) => a.metadata.timestamp - b.metadata.timestamp);
      this.store.splice(0, Math.floor(this.MAX_ENTRIES * 0.1));
    }
    this.store.push(embedding);
  }

  query(queryVector: number[], topK = 5): SimilarStrategy[] {
    return this.store
      .map((emb) => ({
        embedding: emb,
        similarity: this.cosineSimilarity(queryVector, emb.vector),
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
  }

  updateOutcome(
    id: string,
    outcome: 'profitable' | 'loss',
    actualProfitUsd: number
  ): boolean {
    const emb = this.store.find((e) => e.id === id);
    if (!emb) return false;
    emb.metadata.outcome = outcome;
    emb.metadata.actualProfitUsd = actualProfitUsd;
    return true;
  }

  size(): number {
    return this.store.length;
  }

  clear(): void {
    this.store = [];
  }
}

export default VectorMemory;
