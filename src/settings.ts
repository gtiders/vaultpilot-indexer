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

    new Setting(containerEl)
      .setName("Start index rebuild")
      .setDesc("Queue a full vault rebuild with current rules")
      .addButton((button) => {
        button.setButtonText("Start Build").onClick(async () => {
          button.setDisabled(true);
          try {
            await this.plugin.rebuildIndex();
          } finally {
            button.setDisabled(false);
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
  }
}
