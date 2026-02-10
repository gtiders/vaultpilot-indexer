import { ErrorCode } from "../schema/error-codes";
import type { SummaryRequest, SummaryResponse } from "../types/index";

export interface OpenAiCompatibleConfig {
  baseUrl: string;
  token: string;
  model: string;
  timeoutMs: number;
}

export interface ModelCatalogResponse {
  success: boolean;
  models: string[];
  error_code?: ErrorCode;
  error_message?: string;
  unsupported?: boolean;
}

export class OpenAiCompatibleGateway {
  constructor(private readonly config: OpenAiCompatibleConfig) {}

  async listModels(): Promise<ModelCatalogResponse> {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(`${this.config.baseUrl.replace(/\/$/, "")}/v1/models`, {
        method: "GET",
        headers: this.buildHeaders(),
        signal: controller.signal
      });

      if (!response.ok) {
        const unsupported = response.status === 404 || response.status === 405 || response.status === 501;
        return {
          success: false,
          models: [],
          error_code: this.mapError(response.status),
          error_message: `HTTP ${response.status}`,
          unsupported
        };
      }

      const json = (await response.json()) as {
        data?: Array<{ id?: string; object?: string }>;
      };
      const models = (json.data ?? [])
        .map((item) => item.id?.trim() ?? "")
        .filter((id) => id.length > 0)
        .filter((id, idx, arr) => arr.indexOf(id) === idx)
        .sort((a, b) => a.localeCompare(b));

      return {
        success: true,
        models
      };
    } catch (error) {
      const isAbort = error instanceof Error && error.name === "AbortError";
      return {
        success: false,
        models: [],
        error_code: isAbort ? ErrorCode.TIMEOUT : ErrorCode.NETWORK_ERROR,
        error_message: error instanceof Error ? error.message : "Unknown gateway error"
      };
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  async summarize(request: SummaryRequest): Promise<SummaryResponse> {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), this.config.timeoutMs);
    const startedAt = Date.now();

    try {
      const response = await fetch(`${this.config.baseUrl.replace(/\/$/, "")}/v1/chat/completions`, {
        method: "POST",
        headers: this.buildHeaders(),
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            {
              role: "system",
              content:
                "Summarize this Obsidian note into one concise paragraph under the requested max characters."
            },
            {
              role: "user",
              content: `Title: ${request.title}\n\n${request.content}\n\nMax chars: ${request.max_chars}`
            }
          ],
          temperature: 0.2
        }),
        signal: controller.signal
      });

      const latency = Date.now() - startedAt;

      if (!response.ok) {
        return {
          summary: "",
          provider_meta: {
            provider: "openai-compatible",
            model: this.config.model,
            latency_ms: latency,
            generated_at: new Date().toISOString()
          },
          success: false,
          error_code: this.mapError(response.status),
          error_message: `HTTP ${response.status}`
        };
      }

      const json = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };

      const content = json.choices?.[0]?.message?.content?.trim();
      if (!content) {
        return {
          summary: "",
          provider_meta: {
            provider: "openai-compatible",
            model: this.config.model,
            latency_ms: latency,
            generated_at: new Date().toISOString()
          },
          success: false,
          error_code: ErrorCode.UPSTREAM_INVALID_RESPONSE,
          error_message: "Missing choices[0].message.content"
        };
      }

      return {
        summary: content.slice(0, request.max_chars),
        provider_meta: {
          provider: "openai-compatible",
          model: this.config.model,
          latency_ms: latency,
          tokens_input: json.usage?.prompt_tokens,
          tokens_output: json.usage?.completion_tokens,
          generated_at: new Date().toISOString()
        },
        success: true
      };
    } catch (error) {
      const isAbort = error instanceof Error && error.name === "AbortError";
      return {
        summary: "",
        provider_meta: {
          provider: "openai-compatible",
          model: this.config.model,
          latency_ms: Date.now() - startedAt,
          generated_at: new Date().toISOString()
        },
        success: false,
        error_code: isAbort ? ErrorCode.TIMEOUT : ErrorCode.NETWORK_ERROR,
        error_message: error instanceof Error ? error.message : "Unknown gateway error"
      };
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  private mapError(statusCode: number): ErrorCode {
    if (statusCode === 401 || statusCode === 403) {
      return ErrorCode.AUTH_FAILED;
    }
    if (statusCode === 429) {
      return ErrorCode.RATE_LIMIT;
    }
    if (statusCode >= 500) {
      return ErrorCode.UPSTREAM_INVALID_RESPONSE;
    }
    return ErrorCode.UPSTREAM_INVALID_RESPONSE;
  }

  private buildHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.config.token}`
    };
  }
}
