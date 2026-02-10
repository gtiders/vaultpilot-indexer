import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorCode } from "../schema/error-codes";
import { OpenAiCompatibleGateway } from "../src/gateway";

describe("OpenAiCompatibleGateway", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns summary on successful response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "This is a generated summary." } }],
            usage: { prompt_tokens: 12, completion_tokens: 8 }
          }),
          { status: 200 }
        )
      )
    );

    const gateway = new OpenAiCompatibleGateway({
      baseUrl: "https://example.com",
      token: "token",
      model: "mock-model",
      timeoutMs: 1000
    });

    const result = await gateway.summarize({
      note_id: "a.md",
      title: "Title",
      content: "Body",
      max_chars: 160
    });

    expect(result.success).toBe(true);
    expect(result.summary.length).toBeGreaterThan(0);
    expect(result.provider_meta.model).toBe("mock-model");
  });

  it("maps HTTP 429 to RATE_LIMIT", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "rate limit" }), { status: 429 }))
    );

    const gateway = new OpenAiCompatibleGateway({
      baseUrl: "https://example.com",
      token: "token",
      model: "mock-model",
      timeoutMs: 1000
    });

    const result = await gateway.summarize({
      note_id: "a.md",
      title: "Title",
      content: "Body",
      max_chars: 160
    });

    expect(result.success).toBe(false);
    expect(result.error_code).toBe(ErrorCode.RATE_LIMIT);
  });

  it("lists models from /v1/models", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [{ id: "deepseek-chat" }, { id: "deepseek-reasoner" }]
          }),
          { status: 200 }
        )
      )
    );

    const gateway = new OpenAiCompatibleGateway({
      baseUrl: "https://example.com",
      token: "token",
      model: "mock-model",
      timeoutMs: 1000
    });

    const result = await gateway.listModels();

    expect(result.success).toBe(true);
    expect(result.models).toEqual(["deepseek-chat", "deepseek-reasoner"]);
  });

  it("marks model discovery unsupported on 404", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));

    const gateway = new OpenAiCompatibleGateway({
      baseUrl: "https://example.com",
      token: "token",
      model: "mock-model",
      timeoutMs: 1000
    });

    const result = await gateway.listModels();

    expect(result.success).toBe(false);
    expect(result.unsupported).toBe(true);
  });
});
