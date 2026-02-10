/**
 * Normalized error codes for API failures
 * These provide a consistent interface across different providers
 */
export enum ErrorCode {
  /** Authentication failed (invalid API key, expired token) */
  AUTH_FAILED = 'AUTH_FAILED',
  
  /** Rate limit exceeded */
  RATE_LIMIT = 'RATE_LIMIT',
  
  /** Request timed out */
  TIMEOUT = 'TIMEOUT',
  
  /** Invalid or unexpected response from upstream */
  UPSTREAM_INVALID_RESPONSE = 'UPSTREAM_INVALID_RESPONSE',
  
  /** Network connectivity issue */
  NETWORK_ERROR = 'NETWORK_ERROR',
  
  /** Content was blocked by safety filters */
  CONTENT_FILTERED = 'CONTENT_FILTERED',
  
  /** Request was cancelled */
  CANCELLED = 'CANCELLED'
}

/**
 * Human-readable descriptions for error codes
 */
export const ErrorCodeDescriptions: Record<ErrorCode, string> = {
  [ErrorCode.AUTH_FAILED]: 'Authentication failed. Check your API key or credentials.',
  [ErrorCode.RATE_LIMIT]: 'Rate limit exceeded. Please wait before retrying.',
  [ErrorCode.TIMEOUT]: 'Request timed out. The server took too long to respond.',
  [ErrorCode.UPSTREAM_INVALID_RESPONSE]: 'Received invalid response from API provider.',
  [ErrorCode.NETWORK_ERROR]: 'Network error. Check your internet connection.',
  [ErrorCode.CONTENT_FILTERED]: 'Content was blocked by safety filters.',
  [ErrorCode.CANCELLED]: 'Request was cancelled by user or system.'
};
