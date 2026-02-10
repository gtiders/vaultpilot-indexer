# Operations Runbook

## Commands

- `Rebuild Index`: Enqueue all markdown files and rebuild index incrementally.
- `Retry Failed Summaries`: Requeue failed records from `index_state.json` retry queue.
- `Compact Index`: Rewrite JSONL keeping latest record per `note_id`.
- `Show Index Status`: Display queue and failure counters in a notice.

## Failure Handling

- API failures are represented by `summary_status: "failed"` and queue entries in `retry_queue`.
- No algorithm fallback is used.
- Retry workflow is explicit and user-driven.

## Data Locations

- `content_index.jsonl`: `.obsidian/plugins/obsidian-jsonl-index-plugin/content_index.jsonl`
- `index_state.json`: `.obsidian/plugins/obsidian-jsonl-index-plugin/index_state.json`

## Safety

- Plugin does not mutate note content.
- Plugin writes only index/state files under plugin data directory.
