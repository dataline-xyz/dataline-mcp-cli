export interface DataApiErrorOptions {
  code: string;
  message: string;
  retryable: boolean;
  status?: number;
  requestId?: string;
  cause?: unknown;
}

export class DataApiError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly status: number | undefined;
  readonly requestId: string | undefined;

  constructor(options: DataApiErrorOptions) {
    super(options.message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "DataApiError";
    this.code = options.code;
    this.retryable = options.retryable;
    this.status = options.status;
    this.requestId = options.requestId;
  }
}
