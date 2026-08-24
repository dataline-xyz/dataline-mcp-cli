import { describe, expect, it } from "vitest";

import type { DataApiClient, DataApiResult, QueryParameters } from "../../../src/data-api/types.js";
import { LendingAnalyticsService } from "../../../src/features/lending/analytics-service.js";
import { ToolInputError } from "../../../src/mcp/tool-result.js";

const MARKET_ID = `0x${"1".repeat(64)}`;
const VAULT_ADDRESS = `0x${"2".repeat(40)}`;
const AAVE_MARKET_ADDRESS = `0x${"3".repeat(40)}`;
const AAVE_ASSET_ADDRESS = `0x${"4".repeat(40)}`;
const AAVE_MARKET_ID = `${AAVE_MARKET_ADDRESS}:${AAVE_ASSET_ADDRESS}`;

describe("LendingAnalyticsService", () => {
  it("returns the most recent bounded history points with explicit truncation", async () => {
    const client = new RecordingDataApiClient({
      "/defi/lending/variable-rate/markets/history": {
        data: {
          protocol: "morpho_blue",
          market_id: MARKET_ID,
          metric: "supplyApy",
          interval: "hour",
          value_unit: "ratio",
          upstream_window: "LAST_WEEK",
          start_time: "2026-08-11T00:00:00Z",
          end_time: "2026-08-11T03:00:00Z",
          includes_rewards: true,
          fees_deducted: false,
          points: [
            { timestamp: "2026-08-11T01:00:00Z", value: "0.030" },
            { timestamp: "2026-08-11T02:00:00Z", value: "0.031" },
            { timestamp: "2026-08-11T03:00:00Z", value: null, is_missing: true },
          ],
          source: { fetched_at: "2026-08-11T03:00:01Z" },
        },
        warnings: [],
      },
    });

    const output = await new LendingAnalyticsService(client).getHistory({
      product_type: "variable_rate_market",
      identifier: MARKET_ID,
      variable_rate_protocol: "morpho_blue",
      vault_version: "V2",
      metric: "supplyApy",
      interval: "hour",
      start_time: "2026-08-11T00:00:00Z",
      end_time: "2026-08-11T03:00:00Z",
      points_limit: 2,
    });

    expect(client.calls[0]).toEqual({
      path: "/defi/lending/variable-rate/markets/history",
      query: {
        network: "base",
        protocol: "morpho_blue",
        market_id: MARKET_ID,
        metric: "supplyApy",
        interval: "hour",
        start_time: "2026-08-11T00:00:00Z",
        end_time: "2026-08-11T03:00:00Z",
      },
    });
    expect(output).toMatchObject({
      available_points: 3,
      returned_points: 2,
      truncated: true,
      points: [
        { timestamp: "2026-08-11T02:00:00Z", value: "0.031", is_missing: false },
        { timestamp: "2026-08-11T03:00:00Z", value: null, is_missing: true },
      ],
      as_of: "2026-08-11T03:00:01Z",
      errors: [],
    });
  });

  it("rejects incompatible history metrics before contacting Data API", async () => {
    const client = new RecordingDataApiClient({});
    const service = new LendingAnalyticsService(client);

    await expect(
      service.getHistory({
        product_type: "vault",
        identifier: VAULT_ADDRESS,
        variable_rate_protocol: "morpho_blue",
        vault_version: "V2",
        metric: "supplyApy",
        interval: "day",
        points_limit: 60,
      }),
    ).rejects.toBeInstanceOf(ToolInputError);
    await expect(
      service.getHistory({
        product_type: "variable_rate_market",
        identifier: MARKET_ID,
        variable_rate_protocol: "aave_v3",
        vault_version: "V2",
        metric: "utilization",
        interval: "day",
        points_limit: 60,
      }),
    ).rejects.toBeInstanceOf(ToolInputError);
    expect(client.calls).toHaveLength(0);
  });

  it("accepts Aave market:token identifiers and enforces the supported time window", async () => {
    const client = new RecordingDataApiClient({
      "/defi/lending/variable-rate/markets/history": {
        data: {
          protocol: "aave_v3",
          market_id: AAVE_MARKET_ID,
          metric: "supplyApy",
          interval: "day",
          value_unit: "ratio",
          upstream_window: "LAST_MONTH",
          start_time: "2026-08-01T00:00:00Z",
          end_time: "2026-08-02T00:00:00Z",
          includes_rewards: false,
          fees_deducted: null,
          points: [],
        },
        warnings: [],
      },
    });
    const service = new LendingAnalyticsService(client);

    await service.getHistory({
      product_type: "variable_rate_market",
      identifier: AAVE_MARKET_ID,
      variable_rate_protocol: "aave_v3",
      vault_version: "V2",
      metric: "supplyApy",
      interval: "day",
      start_time: "2026-08-01T00:00:00Z",
      end_time: "2026-08-02T00:00:00Z",
      points_limit: 60,
    });

    expect(client.calls[0]).toMatchObject({
      path: "/defi/lending/variable-rate/markets/history",
      query: { protocol: "aave_v3", market_id: AAVE_MARKET_ID },
    });

    const now = Date.now();
    await expect(
      service.getHistory({
        product_type: "variable_rate_market",
        identifier: AAVE_MARKET_ID,
        variable_rate_protocol: "aave_v3",
        vault_version: "V2",
        metric: "supplyApy",
        interval: "day",
        start_time: new Date(now - 366 * 24 * 60 * 60 * 1000).toISOString(),
        end_time: new Date(now).toISOString(),
        points_limit: 60,
      }),
    ).rejects.toMatchObject({ code: "history_range_too_large" });
    expect(client.calls).toHaveLength(1);
  });

  it("chooses a product-specific metric when history metric is omitted", async () => {
    const client = new RecordingDataApiClient({
      "/defi/lending/variable-rate/markets/history": historyResponse("supplyApy"),
      "/defi/lending/vaults/history": historyResponse("netApy"),
    });
    const service = new LendingAnalyticsService(client);

    await service.getHistory({
      product_type: "variable_rate_market",
      identifier: MARKET_ID,
      variable_rate_protocol: "morpho_blue",
      vault_version: "V2",
      interval: "day",
      points_limit: 5,
    });
    await service.getHistory({
      product_type: "vault",
      identifier: VAULT_ADDRESS,
      variable_rate_protocol: "morpho_blue",
      vault_version: "V2",
      interval: "day",
      points_limit: 5,
    });

    expect(client.calls.map((call) => call.query?.metric)).toEqual(["supplyApy", "netApy"]);
  });

  it("returns compact fixed-rate orderbook levels and sends one bounded request", async () => {
    const client = new RecordingDataApiClient({
      "/defi/lending/fixed-rate/markets/orderbook": {
        data: {
          protocol: "morpho_midnight",
          market_id: MARKET_ID,
          bids: [
            {
              tick: 42,
              price: "952380952380952380",
              units: "10000000000",
              assets: "9523809523",
              count: 3,
              implied_annualized_rate: "0.052",
            },
          ],
          asks: [],
          time_to_maturity_seconds: 86_400,
          rate_calculation: "annualized fixed-point formula",
          fees_included: false,
          source: { fetched_at: "2026-08-11T04:00:00Z" },
        },
        warnings: [],
      },
    });

    const output = await new LendingAnalyticsService(client).getFixedRateOrderbook({
      market_id: MARKET_ID,
      side: "all",
      depth: 20,
      detail_level: "summary",
    });

    expect(client.calls[0]).toEqual({
      path: "/defi/lending/fixed-rate/markets/orderbook",
      query: {
        network: "base",
        protocol: "morpho_midnight",
        market_id: MARKET_ID,
        side: "all",
        depth: 20,
      },
    });
    expect(output).toMatchObject({
      bid_count: 1,
      ask_count: 0,
      bids: [
        {
          price: "952380952380952380",
          units: "10000000000",
          implied_annualized_rate: "0.052",
        },
      ],
      errors: [],
    });
    expect(output.bids[0]).not.toHaveProperty("tick");
    expect(output.bids[0]).not.toHaveProperty("assets");
  });
});

class RecordingDataApiClient implements DataApiClient {
  readonly calls: Array<{ path: string; query: QueryParameters | undefined }> = [];
  readonly #responses: Readonly<Record<string, Omit<DataApiResult<unknown>, "requestId">>>;

  constructor(responses: Readonly<Record<string, Omit<DataApiResult<unknown>, "requestId">>>) {
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

function historyResponse(metric: string): Omit<DataApiResult<unknown>, "requestId"> {
  return {
    data: {
      protocol: "morpho",
      metric,
      value_unit: "ratio",
      start_time: "2026-08-01T00:00:00Z",
      end_time: "2026-08-11T00:00:00Z",
      points: [],
    },
    warnings: [],
  };
}
