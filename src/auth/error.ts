export class AccessAdapterError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly status: number | undefined;

  constructor(code: string, message: string, retryable: boolean, status?: number) {
    super(message);
    this.name = "AccessAdapterError";
    this.code = code;
    this.retryable = retryable;
    this.status = status;
  }
}
