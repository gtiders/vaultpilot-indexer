# Architecture

## Overview

VaultPilot Indexer has three major layers:

1. Event ingestion and queueing
2. Index/state persistence
3. AI gateway and settings controls

## Event ingestion

The plugin subscribes to Obsidian vault events:

- `create`
- `modify`
- `rename`
- `delete`

Events are pushed into a debounced queue keyed by note identity to avoid
duplicate processing in edit bursts.

## Index pipeline

For each markdown file event, the pipeline:

1. Applies path and tag exclusion rules
2. Reads note content
3. Computes normalized SHA-256 hash
4. Skips unchanged content (except rename flows)
5. Requests summary (if API config exists)
6. Appends an index record into JSONL
7. Updates state cache and retry queue

## Data contracts

- `schema/index-record.schema.json` defines index record format
- `schema/state.schema.json` defines state format
- `types/index.ts` mirrors runtime contracts

## Output paths

- Index file: `.obsidian/plugins/vaultpilot-indexer/content_index.jsonl`
- State file: `.obsidian/plugins/vaultpilot-indexer/index_state.json`

## Model selection strategy

The settings UI supports:

- Auto-discovery via `GET /v1/models`
- Cached model catalog per endpoint
- Manual model override when discovery is unsupported

This design keeps model selection resilient across different
OpenAI-compatible providers.
