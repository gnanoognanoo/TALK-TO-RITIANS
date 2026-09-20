/**
 * ============================================================================
 * TALK TO RITIANS - API Response & Service Result Contracts
 * ============================================================================
 */

export interface ApiResponse<T> {
  data: T | null;
  error: ApiError | null;
  success: boolean;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}
