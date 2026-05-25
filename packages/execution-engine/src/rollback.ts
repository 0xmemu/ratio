export interface RollbackAction {
  id: string;
  type: 'retry' | 'cancel' | 'close_position';
  reason: string;
  createdAt: number;
}

export interface RollbackResult {
  success: boolean;
  action: RollbackAction;
  error?: string;
  timestamp: number;
}

export class RollbackManager {
  private retries: Map<string, number> = new Map();
  private maxRetries: number;

  constructor(maxRetries = 3) {
    this.maxRetries = maxRetries;
  }

  async handleFailure(
    executionId: string,
    reason: string
  ): Promise<RollbackResult> {
    const retryCount = this.retries.get(executionId) ?? 0;

    if (retryCount < this.maxRetries) {
      this.retries.set(executionId, retryCount + 1);

      return {
        success: true,
        action: {
          id: executionId,
          type: 'retry',
          reason,
          createdAt: Date.now(),
        },
        timestamp: Date.now(),
      };
    }

    return {
      success: true,
      action: {
        id: executionId,
        type: 'close_position',
        reason: `max retries exceeded: ${reason}`,
        createdAt: Date.now(),
      },
      timestamp: Date.now(),
    };
  }

  resetRetries(executionId: string): void {
    this.retries.delete(executionId);
  }

  getRetryCount(executionId: string): number {
    return this.retries.get(executionId) ?? 0;
  }
}

export default RollbackManager;
