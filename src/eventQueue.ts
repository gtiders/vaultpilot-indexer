import type { IndexEvent } from "./events";

export interface EventQueueStats {
  queued: number;
  processed: number;
  droppedAsDuplicate: number;
  failed: number;
  lastProcessedAt?: string;
}

export type QueueProcessor = (event: IndexEvent) => Promise<void>;

export class IndexEventQueue {
  private readonly pending = new Map<string, IndexEvent>();
  private readonly debounceMs: number;
  private readonly processor: QueueProcessor;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private isProcessing = false;

  readonly stats: EventQueueStats = {
    queued: 0,
    processed: 0,
    droppedAsDuplicate: 0,
    failed: 0
  };

  constructor(processor: QueueProcessor, debounceMs = 500) {
    this.processor = processor;
    this.debounceMs = debounceMs;
  }

  enqueue(event: IndexEvent): void {
    const previous = this.pending.get(event.noteId);
    if (previous) {
      this.stats.droppedAsDuplicate += 1;
    }
    this.pending.set(event.noteId, event);
    this.stats.queued = this.pending.size;
    this.schedule();
  }

  flushNow(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    return this.process();
  }

  clear(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.pending.clear();
    this.stats.queued = 0;
  }

  private schedule(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      void this.process();
    }, this.debounceMs);
  }

  private async process(): Promise<void> {
    if (this.isProcessing || this.pending.size === 0) {
      return;
    }
    this.isProcessing = true;

    const batch = [...this.pending.values()].sort((a, b) => a.timestamp - b.timestamp);
    this.pending.clear();
    this.stats.queued = 0;

    for (const event of batch) {
      try {
        await this.processor(event);
        this.stats.processed += 1;
      } catch {
        this.stats.failed += 1;
      }
    }

    this.stats.lastProcessedAt = new Date().toISOString();
    this.isProcessing = false;

    if (this.pending.size > 0) {
      this.schedule();
    }
  }
}
