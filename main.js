"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => ObsidianJsonlIndexPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian2 = require("obsidian");

// src/eventQueue.ts
var IndexEventQueue = class {
  pending = /* @__PURE__ */ new Map();
  debounceMs;
  processor;
  timer = null;
  isProcessing = false;
  stats = {
    queued: 0,
    processed: 0,
    droppedAsDuplicate: 0,
    failed: 0
  };
  constructor(processor, debounceMs = 500) {
    this.processor = processor;
    this.debounceMs = debounceMs;
  }
  enqueue(event) {
    const previous = this.pending.get(event.noteId);
    if (previous) {
      this.stats.droppedAsDuplicate += 1;
    }
    this.pending.set(event.noteId, event);
    this.stats.queued = this.pending.size;
    this.schedule();
  }
  flushNow() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    return this.process();
  }
  clear() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.pending.clear();
    this.stats.queued = 0;
  }
  schedule() {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      void this.process();
    }, this.debounceMs);
  }
  async process() {
    if (this.isProcessing || this.pending.size === 0) {
      return;
    }
    this.isProcessing = true;
    const batch = [...this.pending.values()].sort((a, b) => a.timestamp - b.timestamp);
    this.pending.clear();
    this.stats.queued = 0;
    for (const event of batch) {
      try {
        await this.processor(event);
        this.stats.processed += 1;
      } catch {
        this.stats.failed += 1;
      }
    }
    this.stats.lastProcessedAt = (/* @__PURE__ */ new Date()).toISOString();
    this.isProcessing = false;
    if (this.pending.size > 0) {
      this.schedule();
    }
  }
};

// src/hashState.ts
var import_node_crypto = require("node:crypto");
var STATE_FILE_PATH = ".obsidian/plugins/obsidian-jsonl-index-plugin/index_state.json";
var STATE_VERSION = "1.0.0";
function normalizeMarkdown(content) {
  return content.replace(/\r\n/g, "\n").trim();
}
function computeContentHash(content) {
  return (0, import_node_crypto.createHash)("sha256").update(normalizeMarkdown(content), "utf8").digest("hex");
}
function createEmptyState() {
  return {
    schema_version: STATE_VERSION,
    last_processed_hash: {},
    retry_queue: [],
    last_success_at: (/* @__PURE__ */ new Date(0)).toISOString(),
    stats: {
      total_notes: 0,
      summarized_notes: 0,
      failed_notes: 0,
      pending_notes: 0
    }
  };
}
var StateStore = class {
  adapter;
  constructor(app) {
    this.adapter = app.vault.adapter;
  }
  async load() {
    const exists = await this.adapter.exists(STATE_FILE_PATH);
    if (!exists) {
      return createEmptyState();
    }
    const raw = await this.adapter.read(STATE_FILE_PATH);
    const parsed = JSON.parse(raw);
    return {
      ...createEmptyState(),
      ...parsed,
      last_processed_hash: parsed.last_processed_hash ?? {},
      retry_queue: parsed.retry_queue ?? []
    };
  }
  async save(state) {
    await this.ensurePluginDir();
    await this.adapter.write(STATE_FILE_PATH, JSON.stringify(state, null, 2));
  }
  async ensurePluginDir() {
    const pluginDir = ".obsidian/plugins/obsidian-jsonl-index-plugin";
    const exists = await this.adapter.exists(pluginDir);
    if (!exists) {
      await this.adapter.mkdir(pluginDir);
    }
  }
};

// src/indexWriter.ts
var INDEX_FILE_PATH = ".obsidian/plugins/obsidian-jsonl-index-plugin/content_index.jsonl";
var JsonlIndexWriter = class {
  adapter;
  constructor(app) {
    this.adapter = app.vault.adapter;
  }
  async append(record) {
    await this.ensurePluginDir();
    const line = `${JSON.stringify(record)}
`;
    await this.adapter.append(INDEX_FILE_PATH, line);
  }
  async compact() {
    const exists = await this.adapter.exists(INDEX_FILE_PATH);
    if (!exists) {
      return;
    }
    const raw = await this.adapter.read(INDEX_FILE_PATH);
    const lines = raw.split("\n").filter((line) => line.trim().length > 0);
    const latestByNoteId = /* @__PURE__ */ new Map();
    for (const line of lines) {
      const rec = JSON.parse(line);
      latestByNoteId.set(rec.note_id, rec);
    }
    const compacted = [...latestByNoteId.values()].map((r) => JSON.stringify(r)).join("\n");
    const finalText = compacted.length > 0 ? `${compacted}
` : "";
    await this.adapter.write(INDEX_FILE_PATH, finalText);
  }
  async ensurePluginDir() {
    const pluginDir = ".obsidian/plugins/obsidian-jsonl-index-plugin";
    const exists = await this.adapter.exists(pluginDir);
    if (!exists) {
      await this.adapter.mkdir(pluginDir);
    }
  }
};

// src/ops.ts
function buildOpsSnapshot(queue, state) {
  return {
    queue,
    failedCount: state.stats?.failed_notes ?? state.retry_queue.length,
    retryCount: state.retry_queue.length,
    lastSuccessAt: state.last_success_at
  };
}

// src/gateway.ts
var OpenAiCompatibleGateway = class {
  constructor(config) {
    this.config = config;
  }
  async listModels() {
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
      const json = await response.json();
      const models = (json.data ?? []).map((item) => item.id?.trim() ?? "").filter((id) => id.length > 0).filter((id, idx, arr) => arr.indexOf(id) === idx).sort((a, b) => a.localeCompare(b));
      return {
        success: true,
        models
      };
    } catch (error) {
      const isAbort = error instanceof Error && error.name === "AbortError";
      return {
        success: false,
        models: [],
        error_code: isAbort ? "TIMEOUT" /* TIMEOUT */ : "NETWORK_ERROR" /* NETWORK_ERROR */,
        error_message: error instanceof Error ? error.message : "Unknown gateway error"
      };
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
  async summarize(request) {
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
              content: "Summarize this Obsidian note into one concise paragraph under the requested max characters."
            },
            {
              role: "user",
              content: `Title: ${request.title}

${request.content}

Max chars: ${request.max_chars}`
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
            generated_at: (/* @__PURE__ */ new Date()).toISOString()
          },
          success: false,
          error_code: this.mapError(response.status),
          error_message: `HTTP ${response.status}`
        };
      }
      const json = await response.json();
      const content = json.choices?.[0]?.message?.content?.trim();
      if (!content) {
        return {
          summary: "",
          provider_meta: {
            provider: "openai-compatible",
            model: this.config.model,
            latency_ms: latency,
            generated_at: (/* @__PURE__ */ new Date()).toISOString()
          },
          success: false,
          error_code: "UPSTREAM_INVALID_RESPONSE" /* UPSTREAM_INVALID_RESPONSE */,
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
          generated_at: (/* @__PURE__ */ new Date()).toISOString()
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
          generated_at: (/* @__PURE__ */ new Date()).toISOString()
        },
        success: false,
        error_code: isAbort ? "TIMEOUT" /* TIMEOUT */ : "NETWORK_ERROR" /* NETWORK_ERROR */,
        error_message: error instanceof Error ? error.message : "Unknown gateway error"
      };
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
  mapError(statusCode) {
    if (statusCode === 401 || statusCode === 403) {
      return "AUTH_FAILED" /* AUTH_FAILED */;
    }
    if (statusCode === 429) {
      return "RATE_LIMIT" /* RATE_LIMIT */;
    }
    if (statusCode >= 500) {
      return "UPSTREAM_INVALID_RESPONSE" /* UPSTREAM_INVALID_RESPONSE */;
    }
    return "UPSTREAM_INVALID_RESPONSE" /* UPSTREAM_INVALID_RESPONSE */;
  }
  buildHeaders() {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.config.token}`
    };
  }
};

// src/settings.ts
var import_obsidian = require("obsidian");

// src/exclusions.ts
function parseRuleList(raw) {
  return raw.split(/[,\n]/g).map((item) => item.trim()).filter((item) => item.length > 0);
}
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function wildcardToRegExp(pattern) {
  const escaped = pattern.split("*").map((chunk) => escapeRegExp(chunk)).join(".*");
  return new RegExp(`^${escaped}$`, "i");
}
function normalizePath(path) {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
}
function isPathExcluded(path, excludedFolders, excludedFilePatterns) {
  const normalized = normalizePath(path);
  const folderHit = excludedFolders.some((folder) => {
    const normalizedFolder = normalizePath(folder).replace(/\/+$/, "");
    return normalized === normalizedFolder || normalized.startsWith(`${normalizedFolder}/`);
  });
  if (folderHit) {
    return true;
  }
  return excludedFilePatterns.some((pattern) => wildcardToRegExp(normalizePath(pattern)).test(normalized));
}

// src/settings.ts
var JsonlIndexSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(plugin) {
    super(plugin.app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian.Setting(containerEl).setName("API Base URL").setDesc("OpenAI-compatible endpoint base URL").addText((text) => {
      text.setPlaceholder("https://api.example.com").setValue(this.plugin.settings.api_base_url).onChange(async (value) => {
        this.plugin.settings.api_base_url = value.trim();
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian.Setting(containerEl).setName("API Token").setDesc("Bearer token for summary API").addText((text) => {
      text.inputEl.type = "password";
      text.setPlaceholder("sk-...").setValue(this.plugin.settings.api_token).onChange(async (value) => {
        this.plugin.settings.api_token = value.trim();
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian.Setting(containerEl).setName("Model").setDesc("Auto-discovered models for current endpoint").addDropdown((dropdown) => {
      const options = this.plugin.getModelOptions();
      for (const model of options) {
        dropdown.addOption(model, model);
      }
      if (!options.includes(this.plugin.settings.model) && this.plugin.settings.model) {
        dropdown.addOption(this.plugin.settings.model, `${this.plugin.settings.model} (manual)`);
      }
      dropdown.setValue(this.plugin.settings.model).onChange(async (value) => {
        this.plugin.settings.model = value.trim();
        await this.plugin.saveSettings();
      });
    }).addButton((button) => {
      button.setButtonText("Refresh Models").onClick(async () => {
        button.setDisabled(true);
        try {
          await this.plugin.refreshModelCatalog();
          this.display();
        } finally {
          button.setDisabled(false);
        }
      });
    });
    new import_obsidian.Setting(containerEl).setName("Model (manual override)").setDesc("Use this when discovery is unsupported or model is missing from the list").addText((text) => {
      text.setPlaceholder("deepseek-chat").setValue(this.plugin.settings.model).onChange(async (value) => {
        this.plugin.settings.model = value.trim();
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian.Setting(containerEl).setName("Model catalog status").setDesc(this.plugin.getModelCatalogStatusText());
    new import_obsidian.Setting(containerEl).setName("Summary max characters").addSlider((slider) => {
      slider.setLimits(80, 500, 10).setValue(this.plugin.settings.max_summary_chars).setDynamicTooltip().onChange(async (value) => {
        this.plugin.settings.max_summary_chars = value;
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian.Setting(containerEl).setName("Request timeout (ms)").addText((text) => {
      text.setValue(String(this.plugin.settings.timeout_ms)).onChange(async (value) => {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed < 500) {
          return;
        }
        this.plugin.settings.timeout_ms = Math.floor(parsed);
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian.Setting(containerEl).setName("Max concurrency").addText((text) => {
      text.setValue(String(this.plugin.settings.max_concurrency)).onChange(async (value) => {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed < 1) {
          return;
        }
        this.plugin.settings.max_concurrency = Math.floor(parsed);
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian.Setting(containerEl).setName("Enable pop-up notifications").setDesc("Show Notice pop-ups for queued/processed file changes and command results").addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.enable_notifications).onChange(async (value) => {
        this.plugin.settings.enable_notifications = value;
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian.Setting(containerEl).setName("Excluded folders").setDesc("Comma or newline separated folder paths to skip").addTextArea((text) => {
      text.setPlaceholder("Templates\nArchive/private").setValue(this.plugin.settings.excluded_folders.join("\n")).onChange(async (value) => {
        this.plugin.settings.excluded_folders = parseRuleList(value);
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian.Setting(containerEl).setName("Excluded file patterns").setDesc("Wildcard patterns, comma or newline separated (example: *.canvas, daily/*)").addTextArea((text) => {
      text.setPlaceholder("*.canvas\nDaily Notes/*").setValue(this.plugin.settings.excluded_file_patterns.join("\n")).onChange(async (value) => {
        this.plugin.settings.excluded_file_patterns = parseRuleList(value);
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian.Setting(containerEl).setName("Excluded tags").setDesc("Comma or newline separated tags that should not be indexed").addTextArea((text) => {
      text.setPlaceholder("private\narchive").setValue(this.plugin.settings.excluded_tags.join("\n")).onChange(async (value) => {
        this.plugin.settings.excluded_tags = parseRuleList(value);
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian.Setting(containerEl).setName("Start index rebuild").setDesc("Queue a full vault rebuild with current rules").addButton((button) => {
      button.setButtonText("Start Build").onClick(async () => {
        button.setDisabled(true);
        try {
          await this.plugin.rebuildIndex();
        } finally {
          button.setDisabled(false);
        }
      });
    });
    new import_obsidian.Setting(containerEl).setName("Test API Connectivity").setDesc("Run a quick API request with current settings").addButton((button) => {
      button.setButtonText("Test Connection").onClick(async () => {
        button.setDisabled(true);
        try {
          await this.plugin.testApiConnectivity();
        } finally {
          button.setDisabled(false);
        }
      });
    });
    new import_obsidian.Setting(containerEl).setName("Index file location").setDesc(this.plugin.getIndexFilePath());
    new import_obsidian.Setting(containerEl).setName("State file location").setDesc(this.plugin.getStateFilePath());
  }
};

// src/main.ts
var INDEX_SCHEMA_VERSION = "1.0.0";
var DEFAULT_SETTINGS = {
  api_base_url: "",
  api_token: "",
  model: "gpt-4o-mini",
  max_summary_chars: 180,
  timeout_ms: 15e3,
  max_concurrency: 2,
  excluded_folders: [],
  excluded_file_patterns: [],
  excluded_tags: [],
  enable_notifications: true,
  discovered_models: [],
  model_catalog_endpoint: "",
  model_catalog_fetched_at: ""
};
var ObsidianJsonlIndexPlugin = class extends import_obsidian2.Plugin {
  queue;
  stateStore;
  writer;
  statusBarEl;
  settings = { ...DEFAULT_SETTINGS };
  async onload() {
    await this.loadSettings();
    this.stateStore = new StateStore(this.app);
    this.writer = new JsonlIndexWriter(this.app);
    this.queue = new IndexEventQueue(async (event) => this.processEvent(event), 600);
    this.statusBarEl = this.addStatusBarItem();
    this.statusBarEl.setText("JSONL Index: idle");
    this.registerVaultEvents();
    this.registerCommands();
    this.addSettingTab(new JsonlIndexSettingTab(this));
    new import_obsidian2.Notice("Obsidian JSONL Index Plugin loaded");
  }
  onunload() {
    void this.queue.flushNow();
    this.queue.clear();
    this.statusBarEl.setText("JSONL Index: unloaded");
  }
  registerVaultEvents() {
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
        if (!(file instanceof import_obsidian2.TFile) || file.extension !== "md") {
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
  registerCommands() {
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
        new import_obsidian2.Notice("Index compacted");
      }
    });
    this.addCommand({
      id: "show-index-status",
      name: "Show Index Status",
      callback: async () => {
        const state = await this.stateStore.load();
        const snapshot = buildOpsSnapshot(this.queue.stats, state);
        new import_obsidian2.Notice(
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
  enqueueFileEvent(type, file) {
    if (!(file instanceof import_obsidian2.TFile) || file.extension !== "md") {
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
  async processEvent(event) {
    const state = await this.stateStore.load();
    if (event.type === "delete") {
      delete state.last_processed_hash[event.noteId];
      state.last_success_at = (/* @__PURE__ */ new Date()).toISOString();
      await this.stateStore.save(state);
      return;
    }
    const targetPath = event.path;
    if (this.shouldExcludePath(targetPath)) {
      delete state.last_processed_hash[event.noteId];
      state.last_success_at = (/* @__PURE__ */ new Date()).toISOString();
      await this.stateStore.save(state);
      return;
    }
    const file = this.app.vault.getAbstractFileByPath(targetPath);
    if (!(file instanceof import_obsidian2.TFile) || file.extension !== "md") {
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
      state.last_success_at = (/* @__PURE__ */ new Date()).toISOString();
      await this.stateStore.save(state);
      return;
    }
    let summaryStatus = "pending";
    let summary;
    let providerMeta;
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
          failed_at: (/* @__PURE__ */ new Date()).toISOString(),
          error_code: result.error_code ?? "UPSTREAM_INVALID_RESPONSE",
          error_message: result.error_message,
          retry_count: this.nextRetryCount(state, file.path)
        });
        this.notify(`Summary failed (${result.error_code ?? "UNKNOWN"}): ${file.path}`);
      }
    }
    const record = {
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
    state.last_success_at = (/* @__PURE__ */ new Date()).toISOString();
    state.stats = {
      total_notes: Object.keys(state.last_processed_hash).length,
      summarized_notes: summaryStatus === "ok" ? (state.stats?.summarized_notes ?? 0) + 1 : state.stats?.summarized_notes ?? 0,
      failed_notes: state.retry_queue.length,
      pending_notes: summaryStatus === "pending" ? (state.stats?.pending_notes ?? 0) + 1 : state.stats?.pending_notes ?? 0
    };
    await this.stateStore.save(state);
  }
  async rebuildIndex() {
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
  async retryFailedSummaries() {
    const state = await this.stateStore.load();
    if (state.retry_queue.length === 0) {
      new import_obsidian2.Notice("No failed summaries to retry");
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
  extractTags(content) {
    const matches = content.match(/(^|\s)#([\w/-]+)/g) ?? [];
    return [...new Set(matches.map((m) => m.trim().replace(/^#/, "").replace(/^\s#/, "")))];
  }
  extractOutlinks(content) {
    const linkRegex = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;
    const links = /* @__PURE__ */ new Set();
    let match;
    while ((match = linkRegex.exec(content)) !== null) {
      links.add(match[1].trim());
    }
    return [...links];
  }
  shouldExcludePath(path) {
    return isPathExcluded(path, this.settings.excluded_folders, this.settings.excluded_file_patterns);
  }
  hasExcludedTag(tags) {
    const excluded = new Set(this.settings.excluded_tags.map((tag) => tag.toLowerCase()));
    return tags.some((tag) => excluded.has(tag.toLowerCase()));
  }
  hasApiConfig() {
    return this.settings.api_base_url.trim().length > 0 && this.settings.api_token.trim().length > 0;
  }
  upsertRetryQueueItem(state, item) {
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
  removeRetryQueueItem(state, noteId) {
    state.retry_queue = state.retry_queue.filter((item) => item.note_id !== noteId);
  }
  nextRetryCount(state, noteId) {
    const existing = state.retry_queue.find((item) => item.note_id === noteId);
    return (existing?.retry_count ?? 0) + 1;
  }
  async loadSettings() {
    const loaded = await this.loadData();
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...loaded ?? {}
    };
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  async testApiConnectivity() {
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
  getModelOptions() {
    const endpointMatches = this.settings.model_catalog_endpoint.trim().toLowerCase() === this.settings.api_base_url.trim().toLowerCase();
    const discovered = endpointMatches ? this.settings.discovered_models : [];
    const combined = [...discovered, this.settings.model].filter((model, idx, arr) => model && arr.indexOf(model) === idx);
    return combined.sort((a, b) => a.localeCompare(b));
  }
  getModelCatalogStatusText() {
    if (!this.settings.api_base_url.trim()) {
      return "Set API Base URL and token, then refresh models.";
    }
    if (this.settings.discovered_models.length === 0) {
      return "No discovered models cached for this endpoint yet.";
    }
    const at = this.settings.model_catalog_fetched_at || "unknown time";
    return `Cached ${this.settings.discovered_models.length} model(s), fetched at ${at}`;
  }
  async refreshModelCatalog() {
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
    this.settings.model_catalog_fetched_at = (/* @__PURE__ */ new Date()).toISOString();
    if (!catalog.models.includes(this.settings.model) && catalog.models.length > 0) {
      this.settings.model = catalog.models[0];
    }
    await this.saveSettings();
    this.notify(`Discovered ${catalog.models.length} model(s)`);
  }
  getIndexFilePath() {
    return INDEX_FILE_PATH;
  }
  getStateFilePath() {
    return STATE_FILE_PATH;
  }
  notify(message) {
    if (this.settings.enable_notifications) {
      new import_obsidian2.Notice(message);
    }
  }
  updateBuildProgress(done, total) {
    const ratio = total === 0 ? 0 : done / total;
    const percent = Math.round(ratio * 100);
    const barSize = 16;
    const filled = Math.round(ratio * barSize);
    const bar = `${"#".repeat(filled)}${"-".repeat(barSize - filled)}`;
    this.statusBarEl.setText(`JSONL Build [${bar}] ${done}/${total} (${percent}%)`);
  }
};
