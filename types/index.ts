/**
 * TypeScript type definitions for Obsidian JSONL Index Plugin
 * 
 * These types match the JSON schemas and provide compile-time safety
 */

/**
 * Provider metadata for summary generation
 */
export interface ProviderMeta {
  /** Provider identifier (e.g., 'openai-compatible') */
  provider: string;
  
  /** Model name used for generation */
  model: string;
  
  /** Request latency in milliseconds */
  latency_ms: number;
  
  /** Input token count */
  tokens_input?: number;
  
  /** Output token count */
  tokens_output?: number;
  
  /** Generation timestamp */
  generated_at: string;
}

/**
 * Summary generation status
 */
export type SummaryStatus = 'ok' | 'failed' | 'pending' | 'skipped';

/**
 * Single record in content_index.jsonl
 */
export interface IndexRecord {
  /** Schema version for migration compatibility */
  schema_version: string;
  
  /** Unique identifier for the note (vault-relative path) */
  note_id: string;
  
  /** Vault-relative file path */
  path: string;
  
  /** Note title from frontmatter or filename */
  title: string;
  
  /** Tags extracted from note */
  tags: string[];
  
  /** Outbound wikilinks from note */
  outlinks: string[];
  
  /** AI-generated summary (80-180 chars, 1 paragraph) */
  summary?: string;
  
  /** Summary generation status */
  summary_status: SummaryStatus;
  
  /** SHA-256 hash of normalized content */
  hash: string;
  
  /** Last modification time in ISO 8601 format */
  mtime: string;
  
  /** Metadata about the summary provider */
  provider_meta?: ProviderMeta;
}

/**
 * Failed item in retry queue
 */
export interface RetryQueueItem {
  /** Note identifier */
  note_id: string;
  
  /** File path */
  path: string;
  
  /** Failure timestamp */
  failed_at: string;
  
  /** Normalized error code */
  error_code: string;
  
  /** Detailed error message */
  error_message?: string;
  
  /** Number of retry attempts */
  retry_count: number;
  
  /** Last retry timestamp */
  last_retry_at?: string;
}

/**
 * Plugin state stored in index_state.json
 */
export interface IndexState {
  /** Schema version for migration compatibility */
  schema_version: string;
  
  /** Map of note_id -> hash for incremental updates */
  last_processed_hash: Record<string, string>;
  
  /** Queue of failed summary requests to retry */
  retry_queue: RetryQueueItem[];
  
  /** Timestamp of last successful index update */
  last_success_at: string;
  
  /** Indexing statistics */
  stats?: {
    total_notes: number;
    summarized_notes: number;
    failed_notes: number;
    pending_notes: number;
  };
}

/**
 * Configuration for the plugin
 */
export interface PluginConfig {
  /** Base URL for API endpoint */
  api_base_url: string;
  
  /** API authentication token */
  api_token: string;
  
  /** Model identifier */
  model: string;
  
  /** Maximum characters for summary */
  max_summary_chars: number;
  
  /** Request timeout in milliseconds */
  timeout_ms: number;
  
  /** Maximum concurrent requests */
  max_concurrency: number;
  
  /** Folders to exclude from indexing */
  excluded_folders: string[];

  /** File path wildcard patterns to exclude from indexing */
  excluded_file_patterns: string[];
  
  /** Tags to exclude from indexing */
  excluded_tags: string[];

  /** Whether popup notices are shown for index events */
  enable_notifications: boolean;

  /** Discovered model IDs from OpenAI-compatible /v1/models endpoint */
  discovered_models: string[];

  /** Endpoint URL that produced the discovered model list */
  model_catalog_endpoint: string;

  /** Last successful discovery timestamp */
  model_catalog_fetched_at: string;

  /** Path to export all tags (relative to vault root) */
  tags_export_path: string;

  /** Whether to auto-export tags when index is updated */
  auto_export_tags: boolean;
}

/**
 * Gateway request for summary generation
 */
export interface SummaryRequest {
  /** Note identifier */
  note_id: string;
  
  /** Note title */
  title: string;
  
  /** Note content */
  content: string;
  
  /** Maximum characters for summary */
  max_chars: number;
}

/**
 * Gateway response for summary generation
 */
export interface SummaryResponse {
  /** Generated summary text */
  summary: string;
  
  /** Provider metadata */
  provider_meta: ProviderMeta;
  
  /** Whether the request succeeded */
  success: boolean;
  
  /** Error code if failed */
  error_code?: string;
  
  /** Error message if failed */
  error_message?: string;
}
