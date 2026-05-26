export interface StrategyMemory {
  id: string;
  poolAddress: string;
  strategyType: string;
  performanceScore: number;
  embedding: number[];
  timestamp: number;
}

export class VectorMemory {
  private memories: StrategyMemory[] = [];

  store(memory: StrategyMemory): void {
    this.memories.push(memory);
  }

  similaritySearch(
    embedding: number[],
    limit = 5
  ): StrategyMemory[] {
    return this.memories
      .map((memory) => ({
        memory,
        similarity: this.cosineSimilarity(
          embedding,
          memory.embedding
        ),
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)
      .map((result) => result.memory);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    const dot = a.reduce((sum, value, index) => {
      return sum + value * (b[index] || 0);
    }, 0);

    const magnitudeA = Math.sqrt(
      a.reduce((sum, value) => sum + value * value, 0)
    );

    const magnitudeB = Math.sqrt(
      b.reduce((sum, value) => sum + value * value, 0)
    );

    if (magnitudeA === 0 || magnitudeB === 0) {
      return 0;
    }

    return dot / (magnitudeA * magnitudeB);
  }
}

export default VectorMemory;
