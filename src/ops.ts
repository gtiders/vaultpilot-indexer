import type { EventQueueStats } from "./eventQueue";
import type { IndexState } from "../types/index";

export interface OpsSnapshot {
  queue: EventQueueStats;
  failedCount: number;
  retryCount: number;
  lastSuccessAt: string;
}

export function buildOpsSnapshot(queue: EventQueueStats, state: IndexState): OpsSnapshot {
  return {
    queue,
    failedCount: state.stats?.failed_notes ?? state.retry_queue.length,
    retryCount: state.retry_queue.length,
    lastSuccessAt: state.last_success_at
  };
}
