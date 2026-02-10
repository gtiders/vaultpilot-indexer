# Vault Writing Navigator skill

## Purpose

Vault Writing Navigator is the companion skill for VaultPilot Indexer.
It consumes `content_index.jsonl` and returns recommendation-only guidance for:

- destination folder
- tags
- internal references
- rationale

## Inputs

- `jsonl_path`
- article title/content
- optional intent constraints

## Outputs

- folder
- tags[]
- references[]
- rationale

## Rules

- Do not modify files automatically.
- Do not hallucinate references not present in JSONL.
- Keep output deterministic and traceable to index data.

## Implementation references

- `skill/SKILL_SPEC.md`
- `skill/prompt-template.md`
- `skill/output-schema.json`
- `skill/examples.md`
