import { describe, expect, it } from "vitest";

import type { DataApiClient, DataApiResult, QueryParameters } from "../../../src/data-api/types.js";
import { CryptoService } from "../../../src/features/crypto/service.js";
import type { JsonRecord } from "../../../src/features/shared/records.js";

describe("CryptoService", () => {
  it("normalizes and compacts CEX price data with useful quality warnings", async () => {
    const client = new RecordingDataApiClient({
      "/v1/crypto/cex/price": {
        data: {
          reference_price: "100.5",
          reference_quote: "USDT",
          confidence: { verdict: "usable" },
          unavailable_venues: [{ venue: "okx", reason: "timeout" }],
          snapshots: [
            {
              market: { base: "BTC", quote: "USDT", venue: "binance" },
              source: { provider: "binance", received_time: "2026-07-27T00:00:00Z" },
              bid: "100",
              ask: "101",
              mid: "100.5",
              quote_volume_24h: "50000",
              change_24h_pct: "25",
            },
          ],
        },
        warnings: [],
      },
    });
    const service = new CryptoService(client);

    const output = await service.getCexPrice({
      base: " btc ",
      quote: "usdt",
      venues: [],
    });

    expect(client.calls[0]).toEqual({
      path: "/v1/crypto/cex/price",
      query: { base: "BTC", quote: "USDT", venues: undefined, quote_notional: undefined },
    });
    expect(output).toMatchObject({
      symbol: "BTC",
      quote: "USDT",
      price: "100.5",
      confidence: "usable",
      as_of: "2026-07-27T00:00:00Z",
      venues: [{ venue: "binance", price: "100.5", bid: "100", ask: "101" }],
      errors: [],
    });
    expect(output.warnings.map((item) => item.code)).toEqual([
      "venue_unavailable",
      "very_low_24h_quote_volume",
      "extreme_24h_change",
    ]);
  });

  it("normalizes DEX chain aliases before requesting the Data API", async () => {
    const client = new RecordingDataApiClient({
      "/v1/crypto/dex/price": {
        data: { reference_quote: "USD", reference_price: "1", snapshots: [] },
        warnings: [],
      },
    });
    await new CryptoService(client).getDexPrice({
      chain: "eth",
      contract_address: "0x0000000000000000000000000000000000000000",
      venues: ["dexscreener"],
    });

    expect(client.calls[0]?.query).toMatchObject({
      chain: "ethereum",
      venues: ["dexscreener"],
    });
  });

  it("turns OHLCV candles into compact columns and rows", async () => {
    const client = new RecordingDataApiClient({
      "/v1/crypto/history": {
        data: {
          interval: "1h",
          series: [
            {
              interval: "1h",
              source: { provider: "binance", source_time: "2026-07-27T01:00:00Z" },
              candles: [
                {
                  open_time: "2026-07-27T00:00:00Z",
                  open: "100",
                  high: "110",
                  low: "90",
                  close: "105",
                  volume: "12",
                },
              ],
            },
          ],
        },
        warnings: [],
      },
    });
    const output = await new CryptoService(client).getOhlcv({
      base: "BTC",
      quote: "USDT",
      venue: "binance",
      market_type: "spot",
      interval: "1h",
      limit: 100,
    });

    expect(output.columns).toEqual([
      "open_time",
      "open",
      "high",
      "low",
      "close",
      "volume",
      "quote_volume",
      "close_time",
      "is_partial",
    ]);
    expect(output.rows).toEqual([
      ["2026-07-27T00:00:00Z", "100", "110", "90", "105", "12", null, null, null],
    ]);
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
