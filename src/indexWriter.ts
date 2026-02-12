import type { App, DataAdapter } from "obsidian";
import type { IndexRecord } from "../types/index";

export const INDEX_FILE_PATH = ".obsidian/plugins/vaultpilot-indexer/content_index.jsonl";

export class JsonlIndexWriter {
  private readonly adapter: DataAdapter;

  constructor(app: App) {
    this.adapter = app.vault.adapter;
  }

  async append(record: IndexRecord): Promise<void> {
    await this.ensurePluginDir();
    const line = `${JSON.stringify(record)}\n`;
    await this.adapter.append(INDEX_FILE_PATH, line);
  }

  async compact(): Promise<void> {
    const exists = await this.adapter.exists(INDEX_FILE_PATH);
    if (!exists) {
      return;
    }

    const raw = await this.adapter.read(INDEX_FILE_PATH);
    const lines = raw.split("\n").filter((line) => line.trim().length > 0);
    const latestByNoteId = new Map<string, IndexRecord>();

    for (const line of lines) {
      const rec = JSON.parse(line) as IndexRecord;
      latestByNoteId.set(rec.note_id, rec);
    }

    const compacted = [...latestByNoteId.values()].map((r) => JSON.stringify(r)).join("\n");
    const finalText = compacted.length > 0 ? `${compacted}\n` : "";
    await this.adapter.write(INDEX_FILE_PATH, finalText);
  }

  private async ensurePluginDir(): Promise<void> {
    const pluginDir = ".obsidian/plugins/vaultpilot-indexer";
    const exists = await this.adapter.exists(pluginDir);
    if (!exists) {
      await this.adapter.mkdir(pluginDir);
    }
  }
}
