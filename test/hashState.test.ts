import { describe, expect, it } from "vitest";
import { computeContentHash, normalizeMarkdown } from "../src/hashState";

describe("hashState utilities", () => {
  it("normalizes CRLF and trims before hashing", () => {
    const a = "line1\r\nline2\r\n";
    const b = "line1\nline2";

    expect(normalizeMarkdown(a)).toBe(normalizeMarkdown(b));
    expect(computeContentHash(a)).toBe(computeContentHash(b));
  });
});
