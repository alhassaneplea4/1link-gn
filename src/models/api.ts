export type SortDir = 'asc' | 'desc';

export interface ListQuery {
  page: number;
  pageSize: number;
  search?: string;
  sort?: string;
  dir?: SortDir;
  filters?: Record<string, string>;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type ApiErrorCode = 'network' | 'unauthorized' | 'forbidden' | 'not_found' | 'validation' | 'conflict' | 'rate_limited' | 'server' | 'unknown';

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status?: number;
  readonly fields?: Record<string, string>;

  constructor(code: ApiErrorCode, message?: string, opts?: { status?: number; fields?: Record<string, string> }) {
    super(message ?? code);
    this.name = 'ApiError';
    this.code = code;
    this.status = opts?.status;
    this.fields = opts?.fields;
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;
