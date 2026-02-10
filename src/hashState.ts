import { createHash } from "node:crypto";
import type { App, DataAdapter } from "obsidian";
import type { IndexState } from "../types/index";

export const STATE_FILE_PATH = ".obsidian/plugins/obsidian-jsonl-index-plugin/index_state.json";
const STATE_VERSION = "1.0.0";

export function normalizeMarkdown(content: string): string {
  return content.replace(/\r\n/g, "\n").trim();
}

export function computeContentHash(content: string): string {
  return createHash("sha256").update(normalizeMarkdown(content), "utf8").digest("hex");
}

export function createEmptyState(): IndexState {
  return {
    schema_version: STATE_VERSION,
    last_processed_hash: {},
    retry_queue: [],
    last_success_at: new Date(0).toISOString(),
    stats: {
      total_notes: 0,
      summarized_notes: 0,
      failed_notes: 0,
      pending_notes: 0
    }
  };
}

export class StateStore {
  private readonly adapter: DataAdapter;

  constructor(app: App) {
    this.adapter = app.vault.adapter;
  }

  async load(): Promise<IndexState> {
    const exists = await this.adapter.exists(STATE_FILE_PATH);
    if (!exists) {
      return createEmptyState();
    }
    const raw = await this.adapter.read(STATE_FILE_PATH);
    const parsed = JSON.parse(raw) as IndexState;
    return {
      ...createEmptyState(),
      ...parsed,
      last_processed_hash: parsed.last_processed_hash ?? {},
      retry_queue: parsed.retry_queue ?? []
    };
  }

  async save(state: IndexState): Promise<void> {
    await this.ensurePluginDir();
    await this.adapter.write(STATE_FILE_PATH, JSON.stringify(state, null, 2));
  }

  private async ensurePluginDir(): Promise<void> {
    const pluginDir = ".obsidian/plugins/obsidian-jsonl-index-plugin";
    const exists = await this.adapter.exists(pluginDir);
    if (!exists) {
      await this.adapter.mkdir(pluginDir);
    }
  }
}
