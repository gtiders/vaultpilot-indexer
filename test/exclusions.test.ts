import { describe, expect, it } from "vitest";
import { isPathExcluded, parseRuleList } from "../src/exclusions";

describe("exclusions", () => {
  it("parses comma/newline rule list", () => {
    const rules = parseRuleList("a,b\n c \n\n");
    expect(rules).toEqual(["a", "b", "c"]);
  });

  it("matches folder and wildcard path exclusions", () => {
    expect(isPathExcluded("Daily Notes/2026-02-10.md", ["Daily Notes"], [])).toBe(true);
    expect(isPathExcluded("Projects/test.canvas", [], ["*.canvas"])).toBe(true);
    expect(isPathExcluded("Notes/article.md", ["Daily Notes"], ["*.canvas"])).toBe(false);
  });
});
