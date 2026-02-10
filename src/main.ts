import { Notice, Plugin, TAbstractFile, TFile } from "obsidian";
import type { IndexRecord, RetryQueueItem, SummaryStatus } from "../types/index";
import { IndexEventQueue } from "./eventQueue";
import type { IndexEvent, IndexEventType } from "./events";
import { computeContentHash, StateStore } from "./hashState";
import { STATE_FILE_PATH } from "./hashState";
import { INDEX_FILE_PATH, JsonlIndexWriter } from "./indexWriter";
import { buildOpsSnapshot } from "./ops";
import { OpenAiCompatibleGateway } from "./gateway";
import { JsonlIndexSettingTab } from "./settings";
import type { PluginConfig } from "../types/index";
import { isPathExcluded } from "./exclusions";

const INDEX_SCHEMA_VERSION = "1.0.0";

const DEFAULT_SETTINGS: PluginConfig = {
  api_base_url: "",
  api_token: "",
  model: "gpt-4o-mini",
  max_summary_chars: 180,
  timeout_ms: 15000,
  max_concurrency: 2,
  excluded_folders: [],
  excluded_file_patterns: [],
  excluded_tags: [],
  enable_notifications: true,
  discovered_models: [],
  model_catalog_endpoint: "",
  model_catalog_fetched_at: ""
};

export default class ObsidianJsonlIndexPlugin extends Plugin {
  private queue!: IndexEventQueue;
  private stateStore!: StateStore;
  private writer!: JsonlIndexWriter;
  private statusBarEl!: HTMLElement;
  settings: PluginConfig = { ...DEFAULT_SETTINGS };

  async onload(): Promise<void> {
    await this.loadSettings();
    this.stateStore = new StateStore(this.app);
    this.writer = new JsonlIndexWriter(this.app);
    this.queue = new IndexEventQueue(async (event) => this.processEvent(event), 600);
    this.statusBarEl = this.addStatusBarItem();
    this.statusBarEl.setText("JSONL Index: idle");

    this.registerVaultEvents();
    this.registerCommands();
    this.addSettingTab(new JsonlIndexSettingTab(this));

    new Notice("Obsidian JSONL Index Plugin loaded");
  }

  onunload(): void {
    void this.queue.flushNow();
    this.queue.clear();
    this.statusBarEl.setText("JSONL Index: unloaded");
  }

  private registerVaultEvents(): void {
    this.registerEvent(
      this.app.vault.on("create", (file) => {
        this.enqueueFileEvent("create", file);
      })
    );

    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        this.enqueueFileEvent("modify", file);
      })
    );

    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        this.enqueueFileEvent("delete", file);
      })
    );

    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (!(file instanceof TFile) || file.extension !== "md") {
          return;
        }
        if (this.shouldExcludePath(file.path)) {
          return;
        }
        this.queue.enqueue({
          type: "rename",
          noteId: file.path,
          path: file.path,
          oldPath,
          timestamp: Date.now()
        });
      })
    );
  }

  private registerCommands(): void {
    this.addCommand({
      id: "rebuild-index",
      name: "Rebuild Index",
      callback: async () => {
        await this.rebuildIndex();
      }
    });

    this.addCommand({
      id: "retry-failed-summaries",
      name: "Retry Failed Summaries",
      callback: async () => {
        await this.retryFailedSummaries();
      }
    });

    this.addCommand({
      id: "compact-index",
      name: "Compact Index",
      callback: async () => {
        await this.writer.compact();
        new Notice("Index compacted");
      }
    });

    this.addCommand({
      id: "show-index-status",
      name: "Show Index Status",
      callback: async () => {
        const state = await this.stateStore.load();
        const snapshot = buildOpsSnapshot(this.queue.stats, state);
        new Notice(
          `Queued:${snapshot.queue.queued} Processed:${snapshot.queue.processed} Failed:${snapshot.failedCount} Retry:${snapshot.retryCount}`
        );
      }
    });

    this.addCommand({
      id: "test-api-connectivity",
      name: "Test API Connectivity",
      callback: async () => {
        await this.testApiConnectivity();
      }
    });

    this.addCommand({
      id: "refresh-model-catalog",
      name: "Refresh Model Catalog",
      callback: async () => {
        await this.refreshModelCatalog();
      }
    });

    this.addCommand({
      id: "show-index-file-location",
      name: "Show Index File Location",
      callback: () => {
        this.notify(`Index: ${INDEX_FILE_PATH} | State: ${STATE_FILE_PATH}`);
      }
    });
  }

  private enqueueFileEvent(type: IndexEventType, file: TAbstractFile): void {
    if (!(file instanceof TFile) || file.extension !== "md") {
      return;
    }
    if (this.shouldExcludePath(file.path)) {
      return;
    }

    this.queue.enqueue({
      type,
      noteId: file.path,
      path: file.path,
      timestamp: Date.now()
    });
  }

  private async processEvent(event: IndexEvent): Promise<void> {
    const state = await this.stateStore.load();

    if (event.type === "delete") {
      delete state.last_processed_hash[event.noteId];
      state.last_success_at = new Date().toISOString();
      await this.stateStore.save(state);
      return;
    }

    const targetPath = event.path;
    if (this.shouldExcludePath(targetPath)) {
      delete state.last_processed_hash[event.noteId];
      state.last_success_at = new Date().toISOString();
      await this.stateStore.save(state);
      return;
    }

    const file = this.app.vault.getAbstractFileByPath(targetPath);
    if (!(file instanceof TFile) || file.extension !== "md") {
      return;
    }

    const content = await this.app.vault.cachedRead(file);
    const hash = computeContentHash(content);
    const existingHash = state.last_processed_hash[file.path];

    if (existingHash === hash && event.type !== "rename") {
      return;
    }

    const tags = this.extractTags(content);
    const outlinks = this.extractOutlinks(content);

    if (this.hasExcludedTag(tags)) {
      delete state.last_processed_hash[file.path];
      state.last_success_at = new Date().toISOString();
      await this.stateStore.save(state);
      return;
    }

    let summaryStatus: SummaryStatus = "pending";
    let summary: string | undefined;
    let providerMeta: IndexRecord["provider_meta"];

    if (this.hasApiConfig()) {
      const gateway = new OpenAiCompatibleGateway({
        baseUrl: this.settings.api_base_url,
        token: this.settings.api_token,
        model: this.settings.model,
        timeoutMs: this.settings.timeout_ms
      });
      const result = await gateway.summarize({
        note_id: file.path,
        title: file.basename,
        content,
        max_chars: this.settings.max_summary_chars
      });

      providerMeta = result.provider_meta;
      if (result.success) {
        summaryStatus = "ok";
        summary = result.summary;
        this.removeRetryQueueItem(state, file.path);
        this.notify(`Summary ready: ${file.path}`);
      } else {
        summaryStatus = "failed";
        this.upsertRetryQueueItem(state, {
          note_id: file.path,
          path: file.path,
          failed_at: new Date().toISOString(),
          error_code: result.error_code ?? "UPSTREAM_INVALID_RESPONSE",
          error_message: result.error_message,
          retry_count: this.nextRetryCount(state, file.path)
        });
        this.notify(`Summary failed (${result.error_code ?? "UNKNOWN"}): ${file.path}`);
      }
    }

    const record: IndexRecord = {
      schema_version: INDEX_SCHEMA_VERSION,
      note_id: file.path,
      path: file.path,
      title: file.basename,
      tags,
      outlinks,
      summary,
      summary_status: summaryStatus,
      hash,
      mtime: new Date(file.stat.mtime).toISOString(),
      provider_meta: providerMeta
    };

    await this.writer.append(record);

    if (event.type === "rename" && event.oldPath) {
      delete state.last_processed_hash[event.oldPath];
    }
    state.last_processed_hash[file.path] = hash;
    state.last_success_at = new Date().toISOString();
    state.stats = {
      total_notes: Object.keys(state.last_processed_hash).length,
      summarized_notes:
        summaryStatus === "ok"
          ? (state.stats?.summarized_notes ?? 0) + 1
          : state.stats?.summarized_notes ?? 0,
      failed_notes: state.retry_queue.length,
      pending_notes: summaryStatus === "pending" ? (state.stats?.pending_notes ?? 0) + 1 : state.stats?.pending_notes ?? 0
    };
    await this.stateStore.save(state);
  }

  async rebuildIndex(): Promise<void> {
    const files = this.app.vault.getMarkdownFiles().filter((file) => !this.shouldExcludePath(file.path));
    const total = files.length;
    if (total === 0) {
      this.notify("No eligible markdown files for rebuild");
      return;
    }

    this.updateBuildProgress(0, total);
    for (let i = 0; i < total; i += 1) {
      const file = files[i];
      await this.processEvent({
        type: "modify",
        noteId: file.path,
        path: file.path,
        timestamp: Date.now()
      });
      this.updateBuildProgress(i + 1, total);
    }

    this.statusBarEl.setText("JSONL Index: idle");
    this.notify(`Rebuild complete: ${total} files processed`);
  }

  private async retryFailedSummaries(): Promise<void> {
    const state = await this.stateStore.load();
    if (state.retry_queue.length === 0) {
      new Notice("No failed summaries to retry");
      return;
    }

    for (const item of state.retry_queue) {
      this.queue.enqueue({
        type: "modify",
        noteId: item.note_id,
        path: item.path,
        timestamp: Date.now()
      });
    }
    state.retry_queue = [];
    await this.stateStore.save(state);
    await this.queue.flushNow();
    this.notify("Retry queue processed");
  }

  private extractTags(content: string): string[] {
    const matches = content.match(/(^|\s)#([\w/-]+)/g) ?? [];
    return [...new Set(matches.map((m) => m.trim().replace(/^#/, "").replace(/^\s#/, "")))];
  }

  private extractOutlinks(content: string): string[] {
    const linkRegex = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;
    const links = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = linkRegex.exec(content)) !== null) {
      links.add(match[1].trim());
    }
    return [...links];
  }

  private shouldExcludePath(path: string): boolean {
    return isPathExcluded(path, this.settings.excluded_folders, this.settings.excluded_file_patterns);
  }

  private hasExcludedTag(tags: string[]): boolean {
    const excluded = new Set(this.settings.excluded_tags.map((tag) => tag.toLowerCase()));
    return tags.some((tag) => excluded.has(tag.toLowerCase()));
  }

  private hasApiConfig(): boolean {
    return this.settings.api_base_url.trim().length > 0 && this.settings.api_token.trim().length > 0;
  }

  private upsertRetryQueueItem(state: Awaited<ReturnType<StateStore["load"]>>, item: RetryQueueItem): void {
    const index = state.retry_queue.findIndex((existing) => existing.note_id === item.note_id);
    if (index >= 0) {
      state.retry_queue[index] = {
        ...state.retry_queue[index],
        ...item
      };
      return;
    }
    state.retry_queue.push(item);
  }

  private removeRetryQueueItem(state: Awaited<ReturnType<StateStore["load"]>>, noteId: string): void {
    state.retry_queue = state.retry_queue.filter((item) => item.note_id !== noteId);
  }

  private nextRetryCount(state: Awaited<ReturnType<StateStore["load"]>>, noteId: string): number {
    const existing = state.retry_queue.find((item) => item.note_id === noteId);
    return (existing?.retry_count ?? 0) + 1;
  }

  async loadSettings(): Promise<void> {
    const loaded = (await this.loadData()) as Partial<PluginConfig> | null;
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...(loaded ?? {})
    };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async testApiConnectivity(): Promise<void> {
    if (!this.settings.api_base_url || !this.settings.api_token) {
      this.notify("Set API Base URL and API Token in plugin settings first");
      return;
    }

    const gateway = new OpenAiCompatibleGateway({
      baseUrl: this.settings.api_base_url,
      token: this.settings.api_token,
      model: this.settings.model,
      timeoutMs: this.settings.timeout_ms
    });

    const result = await gateway.summarize({
      note_id: "connectivity-test",
      title: "Connectivity Test",
      content: "Return a short sentence confirming API connectivity.",
      max_chars: this.settings.max_summary_chars
    });

    if (result.success) {
      this.notify(`API OK (${result.provider_meta.model}, ${result.provider_meta.latency_ms}ms)`);
      return;
    }

    this.notify(`API Failed: ${result.error_code ?? "UNKNOWN"}`);
  }

  getModelOptions(): string[] {
    const endpointMatches =
      this.settings.model_catalog_endpoint.trim().toLowerCase() === this.settings.api_base_url.trim().toLowerCase();
    const discovered = endpointMatches ? this.settings.discovered_models : [];
    const combined = [...discovered, this.settings.model].filter((model, idx, arr) => model && arr.indexOf(model) === idx);
    return combined.sort((a, b) => a.localeCompare(b));
  }

  getModelCatalogStatusText(): string {
    if (!this.settings.api_base_url.trim()) {
      return "Set API Base URL and token, then refresh models.";
    }
    if (this.settings.discovered_models.length === 0) {
      return "No discovered models cached for this endpoint yet.";
    }
    const at = this.settings.model_catalog_fetched_at || "unknown time";
    return `Cached ${this.settings.discovered_models.length} model(s), fetched at ${at}`;
  }

  async refreshModelCatalog(): Promise<void> {
    if (!this.settings.api_base_url || !this.settings.api_token) {
      this.notify("Set API Base URL and API Token in plugin settings first");
      return;
    }

    const gateway = new OpenAiCompatibleGateway({
      baseUrl: this.settings.api_base_url,
      token: this.settings.api_token,
      model: this.settings.model,
      timeoutMs: this.settings.timeout_ms
    });

    const catalog = await gateway.listModels();
    if (!catalog.success) {
      if (catalog.unsupported) {
        this.notify("This endpoint does not support /v1/models. Use custom model name.");
      } else {
        this.notify(`Model discovery failed: ${catalog.error_code ?? "UNKNOWN"}`);
      }
      return;
    }

    this.settings.discovered_models = catalog.models;
    this.settings.model_catalog_endpoint = this.settings.api_base_url.trim();
    this.settings.model_catalog_fetched_at = new Date().toISOString();

    if (!catalog.models.includes(this.settings.model) && catalog.models.length > 0) {
      this.settings.model = catalog.models[0];
    }

    await this.saveSettings();
    this.notify(`Discovered ${catalog.models.length} model(s)`);
  }

  getIndexFilePath(): string {
    return INDEX_FILE_PATH;
  }

  getStateFilePath(): string {
    return STATE_FILE_PATH;
  }

  private notify(message: string): void {
    if (this.settings.enable_notifications) {
      new Notice(message);
    }
  }

  private updateBuildProgress(done: number, total: number): void {
    const ratio = total === 0 ? 0 : done / total;
    const percent = Math.round(ratio * 100);
    const barSize = 16;
    const filled = Math.round(ratio * barSize);
    const bar = `${"#".repeat(filled)}${"-".repeat(barSize - filled)}`;
    this.statusBarEl.setText(`JSONL Build [${bar}] ${done}/${total} (${percent}%)`);
  }
}
