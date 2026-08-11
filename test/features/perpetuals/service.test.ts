import { describe, expect, it } from "vitest";

import type { DataApiClient, DataApiResult, QueryParameters } from "../../../src/data-api/types.js";
import { PerpetualsService } from "../../../src/features/perpetuals/service.js";
import type { JsonRecord } from "../../../src/features/shared/records.js";
import { ToolInputError } from "../../../src/mcp/tool-result.js";

describe("PerpetualsService", () => {
  it("rejects an inverted history time range before contacting Data API", async () => {
    const client = new RecordingDataApiClient({});

    await expect(
      new PerpetualsService(client).getHistory({
        metric: "funding_rate",
        base: "BTC",
        quote: "USDT",
        venue: "binance",
        interval: "1h",
        limit: 5,
        start_time: "2026-08-11T12:00:00Z",
        end_time: "2026-08-10T12:00:00Z",
      }),
    ).rejects.toBeInstanceOf(ToolInputError);
    expect(client.calls).toHaveLength(0);
  });
  it("compacts current venue metrics and preserves availability warnings", async () => {
    const client = new RecordingDataApiClient({
      "/v1/crypto/perpetuals/metrics": {
        data: {
          unavailable_venues: [{ venue: "okx", reason: "timeout" }],
          metrics: [
            {
              market: { venue: "binance", symbol: "BTCUSDT", quote: "USDT" },
              source: { provider: "binance", received_time: "2026-07-27T00:00:00Z" },
              mark: "118000",
              index: "117990",
              funding_rate: "0.0001",
              annualized_funding_rate_pct: "10.95",
              open_interest_usd: "25000000000",
              volume_24h: "40000000000",
              basis_abs: "10",
            },
          ],
        },
        warnings: [],
      },
    });

    const output = await new PerpetualsService(client).getMetrics({
      base: " btc ",
      quote: "usdt",
      venues: ["binance", "okx"],
    });

    expect(client.calls[0]).toEqual({
      path: "/v1/crypto/perpetuals/metrics",
      query: { base: "BTC", quote: "USDT", venues: ["binance", "okx"] },
    });
    expect(output).toMatchObject({
      base: "BTC",
      quote: "USDT",
      as_of: "2026-07-27T00:00:00Z",
      metrics: [
        {
          venue: "binance",
          symbol: "BTCUSDT",
          mark: "118000",
          funding_rate: "0.0001",
          open_interest_usd: "25000000000",
        },
      ],
      warnings: [
        {
          code: "venue_unavailable",
          message: "okx unavailable: timeout",
        },
      ],
      errors: [],
    });
    expect(output.metrics[0]).not.toHaveProperty("basis_abs");
  });

  it("maps funding history to stable columns and omits the interval parameter", async () => {
    const client = new RecordingDataApiClient({
      "/v1/crypto/perpetuals/funding-history": {
        data: {
          series: [
            {
              source: { provider: "bybit", source_time: "2026-07-27T01:00:00Z" },
              funding_interval_hours: "8",
              points: [
                {
                  timestamp: "2026-07-27T00:00:00Z",
                  funding_rate: "0.0001",
                  annualized_funding_rate_pct: "10.95",
                  mark_price: "118000",
                },
              ],
            },
          ],
        },
        warnings: [],
      },
    });

    const output = await new PerpetualsService(client).getHistory({
      metric: "funding_rate",
      base: "BTC",
      quote: "USDT",
      venue: "bybit",
      interval: "4h",
      limit: 24,
    });

    expect(client.calls[0]).toEqual({
      path: "/v1/crypto/perpetuals/funding-history",
      query: {
        base: "BTC",
        quote: "USDT",
        venue: "bybit",
        limit: 24,
        start_time: undefined,
        end_time: undefined,
        interval: undefined,
      },
    });
    expect(output).toMatchObject({
      metric: "funding_rate",
      interval: null,
      funding_interval_hours: "8",
      as_of: "2026-07-27T01:00:00Z",
    });
    expect(output.columns).toEqual([
      "timestamp",
      "funding_rate",
      "annualized_funding_rate_pct",
      "mark_price",
      "premium",
    ]);
    expect(output.rows).toEqual([["2026-07-27T00:00:00Z", "0.0001", "10.95", "118000", null]]);
  });

  it("uses the dedicated open-interest endpoint and requested interval", async () => {
    const client = new RecordingDataApiClient({
      "/v1/crypto/perpetuals/open-interest-history": {
        data: {
          series: [
            {
              interval: "4h",
              source: { provider: "okx", received_time: "2026-07-27T04:00:00Z" },
              points: [
                {
                  timestamp: "2026-07-27T00:00:00Z",
                  open_interest: "1000",
                  open_interest_usd: "118000000",
                },
              ],
            },
          ],
        },
        warnings: [],
      },
    });

    const output = await new PerpetualsService(client).getHistory({
      metric: "open_interest",
      base: "BTC",
      quote: "USDT",
      venue: "okx",
      interval: "4h",
      limit: 24,
    });

    expect(client.calls[0]?.path).toBe("/v1/crypto/perpetuals/open-interest-history");
    expect(client.calls[0]?.query).toMatchObject({ interval: "4h" });
    expect(output).toMatchObject({
      metric: "open_interest",
      interval: "4h",
      funding_interval_hours: null,
      columns: ["timestamp", "open_interest", "open_interest_usd"],
      rows: [["2026-07-27T00:00:00Z", "1000", "118000000"]],
    });
  });

  it("rejects unsupported Hyperliquid open-interest history before an API call", async () => {
    const client = new RecordingDataApiClient({});

    await expect(
      new PerpetualsService(client).getHistory({
        metric: "open_interest",
        base: "BTC",
        quote: "USDT",
        venue: "hyperliquid",
        interval: "1h",
        limit: 24,
      }),
    ).rejects.toMatchObject({
      code: "feature_not_implemented",
      hint: "choose_supported_venue",
    } satisfies Partial<ToolInputError>);
    expect(client.calls).toEqual([]);
  });
});

class RecordingDataApiClient implements DataApiClient {
  readonly calls: Array<{ path: string; query: QueryParameters | undefined }> = [];
  readonly #responses: Readonly<Record<string, Omit<DataApiResult<JsonRecord>, "requestId">>>;

  constructor(responses: Readonly<Record<string, Omit<DataApiResult<JsonRecord>, "requestId">>>) {
    this.#responses = responses;
  }

  get<T>(path: string, query?: QueryParameters): Promise<DataApiResult<T>> {
    this.calls.push({ path, query });
    const response = this.#responses[path];
    if (!response) {
      return Promise.reject(new Error(`Unexpected path: ${path}`));
    }
    return Promise.resolve(response as DataApiResult<T>);
  }

  post<T>(): Promise<DataApiResult<T>> {
    return Promise.reject(new Error("Unexpected POST"));
  }
}
