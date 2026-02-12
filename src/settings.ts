import { PluginSettingTab, Setting } from "obsidian";
import type ObsidianJsonlIndexPlugin from "./main";
import { parseRuleList } from "./exclusions";

export class JsonlIndexSettingTab extends PluginSettingTab {
  constructor(private readonly plugin: ObsidianJsonlIndexPlugin) {
    super(plugin.app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("API Base URL")
      .setDesc("OpenAI-compatible endpoint base URL")
      .addText((text) => {
        text.setPlaceholder("https://api.example.com")
          .setValue(this.plugin.settings.api_base_url)
          .onChange(async (value) => {
            this.plugin.settings.api_base_url = value.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("API Token")
      .setDesc("Bearer token for summary API")
      .addText((text) => {
        text.inputEl.type = "password";
        text.setPlaceholder("sk-...")
          .setValue(this.plugin.settings.api_token)
          .onChange(async (value) => {
            this.plugin.settings.api_token = value.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Model")
      .setDesc("Auto-discovered models for current endpoint")
      .addDropdown((dropdown) => {
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
      })
      .addButton((button) => {
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

    new Setting(containerEl)
      .setName("Model (manual override)")
      .setDesc("Use this when discovery is unsupported or model is missing from the list")
      .addText((text) => {
        text.setPlaceholder("deepseek-chat")
          .setValue(this.plugin.settings.model)
          .onChange(async (value) => {
            this.plugin.settings.model = value.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Model catalog status")
      .setDesc(this.plugin.getModelCatalogStatusText());

    new Setting(containerEl)
      .setName("Summary max characters")
      .addSlider((slider) => {
        slider
          .setLimits(80, 500, 10)
          .setValue(this.plugin.settings.max_summary_chars)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.max_summary_chars = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Request timeout (ms)")
      .addText((text) => {
        text
          .setValue(String(this.plugin.settings.timeout_ms))
          .onChange(async (value) => {
            const parsed = Number(value);
            if (!Number.isFinite(parsed) || parsed < 500) {
              return;
            }
            this.plugin.settings.timeout_ms = Math.floor(parsed);
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Max concurrency")
      .addText((text) => {
        text
          .setValue(String(this.plugin.settings.max_concurrency))
          .onChange(async (value) => {
            const parsed = Number(value);
            if (!Number.isFinite(parsed) || parsed < 1) {
              return;
            }
            this.plugin.settings.max_concurrency = Math.floor(parsed);
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Enable pop-up notifications")
      .setDesc("Show Notice pop-ups for queued/processed file changes and command results")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.enable_notifications).onChange(async (value) => {
          this.plugin.settings.enable_notifications = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Excluded folders")
      .setDesc("Comma or newline separated folder paths to skip")
      .addTextArea((text) => {
        text
          .setPlaceholder("Templates\nArchive/private")
          .setValue(this.plugin.settings.excluded_folders.join("\n"))
          .onChange(async (value) => {
            this.plugin.settings.excluded_folders = parseRuleList(value);
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Excluded file patterns")
      .setDesc("Wildcard patterns, comma or newline separated (example: *.canvas, daily/*)")
      .addTextArea((text) => {
        text
          .setPlaceholder("*.canvas\nDaily Notes/*")
          .setValue(this.plugin.settings.excluded_file_patterns.join("\n"))
          .onChange(async (value) => {
            this.plugin.settings.excluded_file_patterns = parseRuleList(value);
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Excluded tags")
      .setDesc("Comma or newline separated tags that should not be indexed")
      .addTextArea((text) => {
        text
          .setPlaceholder("private\narchive")
          .setValue(this.plugin.settings.excluded_tags.join("\n"))
          .onChange(async (value) => {
            this.plugin.settings.excluded_tags = parseRuleList(value);
            await this.plugin.saveSettings();
          });
      });

    const checkpointStatus = this.plugin.getRebuildCheckpointStatus?.();

    if (checkpointStatus?.in_progress) {
      new Setting(containerEl)
        .setName("Resume interrupted rebuild")
        .setDesc(`Previous rebuild was interrupted at ${checkpointStatus.progress} files`)
        .addButton((button) => {
          button.setButtonText("Resume Build").setCta().onClick(async () => {
            button.setDisabled(true);
            try {
              await this.plugin.resumeRebuild();
            } finally {
              button.setDisabled(false);
              this.display();
            }
          });
        })
        .addButton((button) => {
          button.setButtonText("Clear Checkpoint").onClick(async () => {
            button.setDisabled(true);
            try {
              await this.plugin.clearRebuildCheckpoint();
              this.display();
            } finally {
              button.setDisabled(false);
            }
          });
        });
    }

    new Setting(containerEl)
      .setName("Start index rebuild")
      .setDesc(checkpointStatus?.in_progress ? "Start a fresh rebuild (will overwrite checkpoint)" : "Queue a full vault rebuild with current rules")
      .addButton((button) => {
        button.setButtonText("Start Build").onClick(async () => {
          button.setDisabled(true);
          try {
            await this.plugin.rebuildIndex();
          } finally {
            button.setDisabled(false);
            this.display();
          }
        });
      });

    new Setting(containerEl)
      .setName("Test API Connectivity")
      .setDesc("Run a quick API request with current settings")
      .addButton((button) => {
        button.setButtonText("Test Connection").onClick(async () => {
          button.setDisabled(true);
          try {
            await this.plugin.testApiConnectivity();
          } finally {
            button.setDisabled(false);
          }
        });
      });

    new Setting(containerEl)
      .setName("Index file location")
      .setDesc(this.plugin.getIndexFilePath());

    new Setting(containerEl)
      .setName("State file location")
      .setDesc(this.plugin.getStateFilePath());

    containerEl.createEl("h3", { text: "Tags Export" });

    new Setting(containerEl)
      .setName("Export tags to JSON")
      .setDesc("Export tags index for skill integration (.obsidian/plugins/vaultpilot-indexer/tags_index.json)")
      .addButton((button) => {
        button.setButtonText("Export Tags").onClick(async () => {
          button.setDisabled(true);
          try {
            await this.plugin.exportTagsToJson();
          } finally {
            button.setDisabled(false);
          }
        });
      });

    containerEl.createEl("h3", { text: "Data Management" });

    new Setting(containerEl)
      .setName("Clear index data")
      .setDesc("Delete index and state files (keeps tags export file)")
      .addButton((button) => {
        button.setButtonText("Clear Index").setWarning().onClick(async () => {
          button.setDisabled(true);
          try {
            await this.plugin.clearIndexData();
          } finally {
            button.setDisabled(false);
          }
        });
      });

    new Setting(containerEl)
      .setName("Clear all data")
      .setDesc("Delete all plugin data including tags export file")
      .addButton((button) => {
        button.setButtonText("Clear All").setWarning().onClick(async () => {
          button.setDisabled(true);
          try {
            await this.plugin.clearAllData();
          } finally {
            button.setDisabled(false);
          }
        });
      });
  }
}
