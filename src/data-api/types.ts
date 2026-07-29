export type QueryValue = string | number | boolean | readonly (string | number | boolean)[];
export type QueryParameters = Readonly<Record<string, QueryValue | null | undefined>>;

export interface DataApiWarning {
  code: string;
  message: string;
  severity: "info" | "warning" | "critical";
}

export interface DataApiResult<T> {
  data: T;
  warnings: DataApiWarning[];
  requestId?: string;
}

export interface DataApiRequest {
  method: "GET" | "POST";
  path: string;
  query?: QueryParameters;
  body?: unknown;
}

export interface DataApiClient {
  get<T>(path: string, query?: QueryParameters): Promise<DataApiResult<T>>;
  post<T>(path: string, body: unknown, query?: QueryParameters): Promise<DataApiResult<T>>;
}
