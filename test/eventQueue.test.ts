import { describe, expect, it, vi } from "vitest";
import { IndexEventQueue } from "../src/eventQueue";

describe("IndexEventQueue", () => {
  it("deduplicates events by noteId before processing", async () => {
    const processor = vi.fn(async () => {});
    const queue = new IndexEventQueue(processor, 20);

    queue.enqueue({
      type: "modify",
      noteId: "a.md",
      path: "a.md",
      timestamp: Date.now()
    });
    queue.enqueue({
      type: "modify",
      noteId: "a.md",
      path: "a.md",
      timestamp: Date.now() + 1
    });

    await queue.flushNow();

    expect(processor).toHaveBeenCalledTimes(1);
    expect(queue.stats.droppedAsDuplicate).toBe(1);
  });
});
