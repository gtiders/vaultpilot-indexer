# VaultPilot Indexer

English | [中文](README.zh-CN.md)

VaultPilot Indexer is an Obsidian plugin that builds an incremental JSONL index
for your vault and adds AI summaries for writing collaboration workflows.

## Why this project

This project helps you avoid full-vault scans during writing support. Instead,
tools can read a compact index file first, then open only relevant notes.

## Features

- **Incremental indexing** from file create/modify/rename/delete events
- **JSONL index output** plus state tracking for retry and hash cache
- **OpenAI-compatible summary generation** with model auto-discovery
- **Folder/file/tag exclusion rules** for fine-grained control
- **Build progress status** with checkpoint resume support
- **Tags export** to Markdown and JSON formats
- **External editor detection** with debounced indexing
- **Companion skill** for folder/tag/reference recommendations with tag deduplication

## Project name

- Project name: **VaultPilot Indexer**

## Output files

- **Index**: `.obsidian/plugins/vaultpilot-indexer/content_index.jsonl` - Main JSONL index with note metadata
- **State**: `.obsidian/plugins/vaultpilot-indexer/index_state.json` - Processing state and checkpoint data
- **Tags (Markdown)**: `Tags.md` (configurable) - Human-readable tags index
- **Tags (JSON)**: `.obsidian/plugins/vaultpilot-indexer/tags_index.json` - Machine-readable tags for skill integration

## Quick start

1. Install dependencies:

```bash
npm install
```

2. Build plugin release package:

```bash
npm run build
```

3. Build output is generated in:

```text
dist/vaultpilot-indexer/
```

4. Copy the whole `vaultpilot-indexer` folder into your vault plugin directory:

```text
.obsidian/plugins/
```

5. Enable plugin in Obsidian Community plugins.

6. Open plugin settings and configure:
   - API Base URL
   - API Token
   - Model selection (refresh catalog or manual override)
   - Exclusion rules (folders, files, tags)
   - Tags export path

## Available Commands

- **Regenerate Current File** - Force re-index the active note
- **Rebuild Vault Index** - Full vault rebuild with progress tracking
- **Resume Interrupted Rebuild** - Continue from checkpoint if rebuild was interrupted
- **Export Tags to File** - Generate human-readable tags index (Markdown)
- **Export Tags to JSON** - Generate machine-readable tags index for skill integration
- **Clear Index Data** - Remove all index files and state

## How It Works

### Indexing Triggers
- **File open**: When switching between files in Obsidian
- **File save**: When saving changes in the editor
- **External modify**: Detects changes from external editors (3-second debounce)

### Checkpoint Resume
If a full vault rebuild is interrupted (Obsidian closed, crash, etc.), the plugin saves progress every 10 files. When you reopen Obsidian, you can resume from where it left off.

### Tag Deduplication (Skill)
The companion skill references `tags_index.json` to avoid creating synonymous tags:
- Prefers full words over abbreviations (`javascript` > `js`)
- Prefers singular over plural (`note` > `notes`)
- Uses existing tags when semantically equivalent

## Development scripts

- `npm run build`
- `npm run typecheck`
- `npm test`

## Docs

- `docs/architecture.md`
- `docs/skill.md`
- `skill/SKILL_SPEC.md`

## License

MIT. See `LICENSE`.
