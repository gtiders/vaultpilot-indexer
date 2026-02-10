import { describe, expect, it } from "vitest";
import { IndexEventQueue } from "../src/eventQueue";

describe("e2e pipeline skeleton", () => {
  it("processes a mixed event batch deterministically", async () => {
    const processed: string[] = [];
    const queue = new IndexEventQueue(async (event) => {
      processed.push(`${event.type}:${event.noteId}`);
    }, 10);

    queue.enqueue({ type: "modify", noteId: "a.md", path: "a.md", timestamp: 1 });
    queue.enqueue({ type: "modify", noteId: "a.md", path: "a.md", timestamp: 2 });
    queue.enqueue({ type: "delete", noteId: "b.md", path: "b.md", timestamp: 3 });

    await queue.flushNow();

    expect(processed).toEqual(["modify:a.md", "delete:b.md"]);
    expect(queue.stats.failed).toBe(0);
  });
});
