import { Menu, Notice, Plugin, TAbstractFile, TFile, TFolder } from "obsidian";
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
  model_catalog_fetched_at: "",
  tags_export_path: "Tags.md",
  auto_export_tags: false
};

export default class VaultPilotIndexerPlugin extends Plugin {
  private queue!: IndexEventQueue;
  private stateStore!: StateStore;
  private writer!: JsonlIndexWriter;
  private statusBarEl!: HTMLElement;
  private lastActiveFile: TFile | null = null;
  private modifiedFiles = new Set<string>();
  private externalModifyTimers = new Map<string, ReturnType<typeof setTimeout>>();
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

    new Notice("VaultPilot Indexer loaded");
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

    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        if (this.lastActiveFile && this.modifiedFiles.has(this.lastActiveFile.path)) {
          this.enqueueFileEvent("modify", this.lastActiveFile);
          this.modifiedFiles.delete(this.lastActiveFile.path);
        }
        this.lastActiveFile = file;
      })
    );

    this.registerEvent(
      this.app.workspace.on("editor-change", (editor, info) => {
        if (info.file instanceof TFile && info.file.extension === "md") {
          this.modifiedFiles.add(info.file.path);
        }
      })
    );

    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        this.handleExternalModify(file);
      })
    );

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu: Menu, file: TAbstractFile) => {
        this.addContextMenuItems(menu, file);
      })
    );
  }

  private registerCommands(): void {
    this.addCommand({
      id: "reindex-current-file",
      name: "Reindex Current File",
      checkCallback: (checking: boolean) => {
        const file = this.app.workspace.getActiveFile();
        if (file && file.extension === "md" && !this.shouldExcludePath(file.path)) {
          if (!checking) {
            void this.reindexFile(file);
          }
          return true;
        }
        return false;
      }
    });

    this.addCommand({
      id: "rebuild-index",
      name: "Rebuild Entire Vault",
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

    this.addCommand({
      id: "export-tags",
      name: "Export Tags to File",
      callback: async () => {
        await this.exportTagsToFile();
      }
    });

    this.addCommand({
      id: "export-tags-json",
      name: "Export Tags to JSON",
      callback: async () => {
        await this.exportTagsToJson();
      }
    });

    this.addCommand({
      id: "clear-index-data",
      name: "Clear Index Data",
      callback: async () => {
        await this.clearIndexData();
      }
    });

    this.addCommand({
      id: "resume-rebuild",
      name: "Resume Interrupted Rebuild",
      checkCallback: (checking: boolean) => {
        const hasCheckpoint = this.hasRebuildCheckpoint();
        if (hasCheckpoint) {
          if (!checking) {
            void this.resumeRebuild();
          }
          return true;
        }
        return false;
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

  async rebuildIndex(resume = false): Promise<void> {
    const state = await this.stateStore.load();
    let files: TFile[];
    let startIndex = 0;

    if (resume && state.rebuild_checkpoint?.in_progress) {
      const checkpoint = state.rebuild_checkpoint;
      const allFiles = this.app.vault.getMarkdownFiles().filter((file) => !this.shouldExcludePath(file.path));
      const processedSet = new Set(checkpoint.processed_files);

      files = allFiles.filter((file) => !processedSet.has(file.path));
      startIndex = checkpoint.processed_count;

      this.notify(`Resuming rebuild: ${checkpoint.processed_count}/${checkpoint.total_files} files already processed`);
    } else {
      files = this.app.vault.getMarkdownFiles().filter((file) => !this.shouldExcludePath(file.path));

      if (files.length === 0) {
        this.notify("No eligible markdown files for rebuild");
        return;
      }

      this.notify(`Starting full rebuild of ${files.length} files...`);

      state.rebuild_checkpoint = {
        in_progress: true,
        total_files: files.length,
        processed_count: 0,
        processed_files: [],
        started_at: new Date().toISOString(),
        last_updated_at: new Date().toISOString()
      };
      await this.stateStore.save(state);
    }

    const total = state.rebuild_checkpoint?.total_files || files.length;
    this.updateBuildProgress(startIndex, total);

    const CHECKPOINT_INTERVAL = 10;

    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      await this.forceProcessFile(file);

      const currentCount = startIndex + i + 1;
      this.updateBuildProgress(currentCount, total);

      if ((i + 1) % CHECKPOINT_INTERVAL === 0 || i === files.length - 1) {
        const currentState = await this.stateStore.load();
        if (currentState.rebuild_checkpoint) {
          currentState.rebuild_checkpoint.processed_count = currentCount;
          currentState.rebuild_checkpoint.processed_files.push(file.path);
          currentState.rebuild_checkpoint.last_updated_at = new Date().toISOString();
          await this.stateStore.save(currentState);
        }
      }
    }

    const finalState = await this.stateStore.load();
    if (finalState.rebuild_checkpoint) {
      finalState.rebuild_checkpoint.in_progress = false;
      await this.stateStore.save(finalState);
    }

    this.statusBarEl.setText("JSONL Index: idle");
    this.notify(`Rebuild complete: ${total} files processed`);
  }

  async resumeRebuild(): Promise<void> {
    const state = await this.stateStore.load();
    if (!state.rebuild_checkpoint?.in_progress) {
      this.notify("No interrupted rebuild found");
      return;
    }

    await this.rebuildIndex(true);
  }

  async clearRebuildCheckpoint(): Promise<void> {
    const state = await this.stateStore.load();
    if (state.rebuild_checkpoint) {
      state.rebuild_checkpoint.in_progress = false;
      await this.stateStore.save(state);
      this.notify("Rebuild checkpoint cleared");
    }
  }

  hasRebuildCheckpoint(): boolean {
    const state = this.stateStore.loadSync?.() || { rebuild_checkpoint: undefined };
    return state.rebuild_checkpoint?.in_progress || false;
  }

  getRebuildCheckpointStatus(): { in_progress: boolean; progress: string } | null {
    const state = this.stateStore.loadSync?.();
    if (!state?.rebuild_checkpoint) {
      return null;
    }
    const cp = state.rebuild_checkpoint;
    return {
      in_progress: cp.in_progress,
      progress: `${cp.processed_count}/${cp.total_files}`
    };
  }

  private async forceProcessFile(file: TFile): Promise<void> {
    const state = await this.stateStore.load();

    const content = await this.app.vault.cachedRead(file);
    const hash = computeContentHash(content);
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
    this.statusBarEl.setText(`VaultPilot Build [${bar}] ${done}/${total} (${percent}%)`);
  }

  private async reindexFile(file: TFile): Promise<void> {
    if (file.extension !== "md" || this.shouldExcludePath(file.path)) {
      this.notify("File is not eligible for indexing");
      return;
    }

    this.notify(`Reindexing: ${file.path}`);
    await this.forceProcessFile(file);
    this.notify(`Reindex complete: ${file.path}`);
  }

  private handleExternalModify(file: TAbstractFile): void {
    if (!(file instanceof TFile) || file.extension !== "md") {
      return;
    }
    if (this.shouldExcludePath(file.path)) {
      return;
    }

    const EXTERNAl_MODIFY_DELAY = 3000;

    const existingTimer = this.externalModifyTimers.get(file.path);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.externalModifyTimers.delete(file.path);
      this.enqueueFileEvent("modify", file);
    }, EXTERNAl_MODIFY_DELAY);

    this.externalModifyTimers.set(file.path, timer);
  }

  private addContextMenuItems(menu: Menu, file: TAbstractFile): void {
    if (file instanceof TFile && file.extension === "md" && !this.shouldExcludePath(file.path)) {
      menu.addItem((item) => {
        item
          .setTitle("Reindex this file")
          .setIcon("refresh-cw")
          .onClick(() => {
            void this.reindexFile(file);
          });
      });
    }

    if (file instanceof TFolder) {
      menu.addItem((item) => {
        item
          .setTitle("Reindex folder contents")
          .setIcon("refresh-cw")
          .onClick(() => {
            void this.reindexFolder(file);
          });
      });
    }
  }

  private async reindexFolder(folder: TFolder): Promise<void> {
    const files = this.app.vault.getMarkdownFiles().filter(
      (file) => file.path.startsWith(folder.path + "/") && !this.shouldExcludePath(file.path)
    );

    if (files.length === 0) {
      this.notify("No eligible markdown files in folder");
      return;
    }

    this.notify(`Reindexing ${files.length} files in ${folder.path}`);
    for (const file of files) {
      await this.forceProcessFile(file);
    }
    this.notify(`Reindex complete: ${files.length} files processed`);
  }

  async exportTagsToFile(): Promise<void> {
    const tagMap = await this.loadTagsFromIndex();

    if (tagMap.size === 0) {
      this.notify("No tags found in index");
      return;
    }

    const sortedTags = [...tagMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));

    let content = "# Tags Index\n\n";
    content += `Generated: ${new Date().toLocaleString()}\n\n`;
    content += `Total tags: ${tagMap.size}\n\n`;
    content += "---\n\n";

    for (const [tag, files] of sortedTags) {
      content += `## #${tag}\n\n`;
      content += `**Count**: ${files.length} file(s)\n\n`;
      for (const filePath of files) {
        const fileName = filePath.split("/").pop() || filePath;
        content += `- [[${filePath}|${fileName}]]\n`;
      }
      content += "\n";
    }

    const exportPath = this.settings.tags_export_path || "Tags.md";
    const existingFile = this.app.vault.getAbstractFileByPath(exportPath);

    try {
      if (existingFile instanceof TFile) {
        await this.app.vault.modify(existingFile, content);
      } else {
        await this.app.vault.create(exportPath, content);
      }
      this.notify(`Tags exported to ${exportPath} (${tagMap.size} tags)`);
    } catch (error) {
      this.notify(`Failed to export tags: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  private async loadTagsFromIndex(): Promise<Map<string, string[]>> {
    const tagMap = new Map<string, string[]>();

    try {
      const exists = await this.app.vault.adapter.exists(INDEX_FILE_PATH);
      if (!exists) {
        return tagMap;
      }

      const raw = await this.app.vault.adapter.read(INDEX_FILE_PATH);
      const lines = raw.split("\n").filter((line) => line.trim().length > 0);

      for (const line of lines) {
        try {
          const record = JSON.parse(line) as IndexRecord;
          if (record.tags && record.tags.length > 0) {
            for (const tag of record.tags) {
              if (!tagMap.has(tag)) {
                tagMap.set(tag, []);
              }
              if (!tagMap.get(tag)!.includes(record.path)) {
                tagMap.get(tag)!.push(record.path);
              }
            }
          }
        } catch {
          // Skip invalid JSON lines
        }
      }
    } catch (error) {
      console.error("Failed to load tags from index:", error);
    }

    return tagMap;
  }

  async exportTagsToJson(): Promise<void> {
    const tagMap = await this.loadTagsFromIndex();

    if (tagMap.size === 0) {
      this.notify("No tags found in index");
      return;
    }

    const tagsData: Record<string, { count: number; files: string[] }> = {};
    for (const [tag, files] of tagMap.entries()) {
      tagsData[tag] = {
        count: files.length,
        files: files.slice(0, 10)
      };
    }

    const tagsJsonPath = ".obsidian/plugins/vaultpilot-indexer/tags_index.json";

    try {
      await this.ensurePluginDir();
      await this.app.vault.adapter.write(
        tagsJsonPath,
        JSON.stringify(tagsData, null, 2)
      );
      this.notify(`Tags index exported to ${tagsJsonPath} (${tagMap.size} tags)`);
    } catch (error) {
      this.notify(`Failed to export tags JSON: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  private async ensurePluginDir(): Promise<void> {
    const pluginDir = ".obsidian/plugins/vaultpilot-indexer";
    const exists = await this.app.vault.adapter.exists(pluginDir);
    if (!exists) {
      await this.app.vault.adapter.mkdir(pluginDir);
    }
  }

  async clearIndexData(): Promise<void> {
    try {
      await this.queue.flushNow();
      this.queue.clear();

      const indexFile = this.app.vault.getAbstractFileByPath(INDEX_FILE_PATH);
      if (indexFile) {
        await this.app.vault.delete(indexFile);
      }

      const stateFile = this.app.vault.getAbstractFileByPath(STATE_FILE_PATH);
      if (stateFile) {
        await this.app.vault.delete(stateFile);
      }

      this.notify("Index data cleared successfully");
    } catch (error) {
      this.notify(`Failed to clear index: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  async clearAllData(): Promise<void> {
    try {
      await this.clearIndexData();

      if (this.settings.auto_export_tags && this.settings.tags_export_path) {
        const tagsFile = this.app.vault.getAbstractFileByPath(this.settings.tags_export_path);
        if (tagsFile) {
          await this.app.vault.delete(tagsFile);
        }
      }

      this.notify("All plugin data cleared");
    } catch (error) {
      this.notify(`Failed to clear data: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }
}
