# Vault Writing Navigator - Skill Specification

## Purpose

Vault Writing Navigator guides collaborators on how to organize new articles in an Obsidian vault by analyzing the `content_index.jsonl` file and providing recommendations for:
- **Folder placement**: Where to save the new note
- **Tag selection**: Which tags to apply
- **Cross-references**: Which existing notes to link
- **Rationale**: Why these recommendations make sense

## Core Principles

1. **Recommendation-only**: The skill never modifies the vault automatically
2. **JSONL-first**: All decisions are based on the index file, not full vault scan
3. **Context-aware**: Uses summaries, tags, and links to find relevant connections
4. **Consistent**: Follows established patterns in the vault

## Input Contract

### Required Parameters

```typescript
interface SkillInput {
  /** Path to content_index.jsonl file */
  jsonl_path: string;
  
  /** Article metadata */
  article: {
    title: string;
    content: string;
    proposed_tags?: string[];
  };
  
  /** User intent/constraints */
  intent?: {
    topic_area?: string;
    related_to?: string[];
    avoid_folders?: string[];
  };
}
```

### Example Input

```json
{
  "jsonl_path": "/path/to/content_index.jsonl",
  "article": {
    "title": "Kubernetes Service Mesh Comparison",
    "content": "This article compares Istio, Linkerd, and Consul Connect...",
    "proposed_tags": ["kubernetes", "microservices"]
  },
  "intent": {
    "topic_area": "infrastructure",
    "avoid_folders": ["archive", "drafts"]
  }
}
```

## Output Contract

### Response Format

```typescript
interface SkillOutput {
  /** Suggested folder path (relative to vault root) */
  folder: string;
  
  /** Recommended tags to apply */
  tags: string[];
  
  /** Suggested references to existing notes */
  references: Reference[];
  
  /** Explanation of recommendations */
  rationale: string;
}

interface Reference {
  /** Note ID/path */
  note_id: string;
  /** Why this note is relevant */
  reason: string;
  /** Suggested link text */
  link_text?: string;
}
```

### Example Output

```json
{
  "folder": "infrastructure/kubernetes",
  "tags": ["kubernetes", "service-mesh", "microservices", "infrastructure"],
  "references": [
    {
      "note_id": "infrastructure/kubernetes-overview.md",
      "reason": "Parent topic - provides context for Kubernetes architecture",
      "link_text": "Kubernetes architecture overview"
    },
    {
      "note_id": "architecture/microservices-patterns.md",
      "reason": "Related patterns for distributed systems",
      "link_text": "microservices patterns"
    }
  ],
  "rationale": "This article belongs in the Kubernetes infrastructure section based on existing similar content. It extends topics covered in 'kubernetes-overview' and relates to microservices architecture patterns. Tags align with existing notes in this domain."
}
```

## Behavior Rules

### Must DO
- ✅ Always provide folder, tags, references, and rationale
- ✅ Use existing patterns from JSONL analysis
- ✅ Suggest references that share tags or semantic similarity
- ✅ Respect intent constraints (avoid_folders, topic_area)
- ✅ Keep summaries under 200 characters

### Must NOT DO
- ❌ Never suggest automatic file moves or modifications
- ❌ Never suggest destructive operations (delete, overwrite)
- ❌ Never ignore user intent constraints
- ❌ Never hallucinate references not in JSONL
- ❌ Never include file-write commands in output

## Decision Process

1. **Parse JSONL**: Load and index all records
2. **Extract Keywords**: From article title and content
3. **Find Matches**: Notes with similar tags, titles, or summaries
4. **Score Candidates**: By tag overlap, folder proximity, semantic similarity
5. **Recommend**: Top-scoring folder, relevant tags, best references
6. **Explain**: Why these choices make sense in vault context

## Error Handling

If JSONL is missing or malformed:
- Return error: "Index file not found. Run plugin to generate content_index.jsonl"

If article content is too short (< 50 chars):
- Return warning: "Article content too short for meaningful recommendations"

If no relevant notes found:
- Return: "No strong matches found. Consider creating new category or check index coverage"

## Usage Example

```typescript
// User writes new article in Obsidian
const input = {
  jsonl_path: ".obsidian/content_index.jsonl",
  article: {
    title: "Redis Cluster Setup Guide",
    content: "Step-by-step guide for setting up Redis in cluster mode..."
  }
};

// Skill analyzes and returns recommendations
const output = await skill.recommend(input);

// User reviews and decides whether to follow
// Plugin does NOT automatically apply these - user decides
```

## Integration with Plugin

The plugin generates `content_index.jsonl`. The skill consumes it. This separation means:
- Plugin focuses on indexing and API calls
- Skill focuses on organizational intelligence
- Both share a single source of truth (JSONL)
- No circular dependencies
