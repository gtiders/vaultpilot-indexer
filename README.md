# VaultPilot Indexer

English | [中文](README.zh-CN.md)

VaultPilot Indexer is an Obsidian plugin that builds an incremental JSONL index
for your vault and adds AI summaries for writing collaboration workflows.

## Why this project

This project helps you avoid full-vault scans during writing support. Instead,
tools can read a compact index file first, then open only relevant notes.

## Features

- Incremental indexing from file create/modify/rename/delete events
- JSONL index output plus state tracking for retry and hash cache
- OpenAI-compatible summary generation
- Model auto-discovery from `/v1/models` with manual model fallback
- Folder/file/tag exclusion rules
- Build progress status and optional notifications
- Companion skill spec for folder/tag/reference recommendations

## Project name and skill name

- Project name: **VaultPilot Indexer**
- Companion skill name: **Vault Writing Navigator**

## Output files

- Index: `.obsidian/plugins/obsidian-jsonl-index-plugin/content_index.jsonl`
- State: `.obsidian/plugins/obsidian-jsonl-index-plugin/index_state.json`

## Quick start

1. Install dependencies:

```bash
npm install
```

2. Build plugin:

```bash
npm run build
```

3. Copy `main.js` and `manifest.json` to your vault plugin directory:

```text
.obsidian/plugins/obsidian-jsonl-index-plugin/
```

4. Enable plugin in Obsidian Community plugins.

5. Open plugin settings and configure:
- API Base URL
- API Token
- Model selection (refresh catalog or manual override)
- Exclusion rules

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
