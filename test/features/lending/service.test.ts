import { describe, expect, it } from "vitest";

import type { DataApiClient, DataApiResult, QueryParameters } from "../../../src/data-api/types.js";
import { LendingService } from "../../../src/features/lending/service.js";
import { ToolInputError } from "../../../src/mcp/tool-result.js";

const MARKET_ID = `0x${"1".repeat(64)}`;
const VAULT_ADDRESS = `0x${"2".repeat(40)}`;
const WALLET_ADDRESS = `0x${"3".repeat(40)}`;

describe("LendingService", () => {
  it("finds compact variable-rate markets with a strict default-sized page", async () => {
    const client = new RecordingDataApiClient({
      "/defi/lending/variable-rate/markets": {
        data: {
          items: [
            {
              market_id: MARKET_ID,
              loan_asset: { address: VAULT_ADDRESS, symbol: "USDC", decimals: 6 },
              collateral_asset: { symbol: "WETH" },
              total_supplied_usd: "1200000",
              supply_apy: "0.041",
              lltv: "0.86",
              raw_provider_payload: { ignored: true },
            },
          ],
          has_more: true,
          source: { fetched_at: "2026-08-04T08:00:00Z" },
        },
        warnings: [],
      },
    });

    const output = await new LendingService(client).findVariableMarkets({
      protocol: "morpho_blue",
      sort: "supplyUsd",
      order: "desc",
      limit: 5,
      offset: 0,
      detail_level: "summary",
    });

    expect(client.calls[0]).toEqual({
      path: "/defi/lending/variable-rate/markets",
      query: {
        network: "base",
        protocol: "morpho_blue",
        loan_asset: undefined,
        collateral_asset: undefined,
        sort: "supplyUsd",
        order: "desc",
        limit: 5,
        offset: 0,
      },
    });
    expect(output).toMatchObject({
      detail_level: "summary",
      count: 1,
      next_offset: 5,
      has_more: true,
      as_of: "2026-08-04T08:00:00Z",
      markets: [{ market_id: MARKET_ID, protocol: "morpho_blue", supply_apy: "0.041" }],
      errors: [],
    });
    expect(output.markets[0]).not.toHaveProperty("lltv");
    expect(output.markets[0]).not.toHaveProperty("raw_provider_payload");
  });

  it("adds curated vault metrics in detailed mode and rejects invalid sort combinations", async () => {
    const client = new RecordingDataApiClient({
      "/defi/lending/vaults": {
        data: {
          items: [
            {
              vault_address: VAULT_ADDRESS,
              vault_version: "V2",
              name: "Base USDC",
              total_assets_usd: 5_000_000,
              allocations: [{}, {}],
              rewards: [{}],
            },
          ],
          has_more: false,
        },
        warnings: [],
      },
    });
    const service = new LendingService(client);

    const output = await service.findVaults({
      version: "V2",
      sort: "liquidityUsd",
      order: "desc",
      limit: 5,
      offset: 0,
      detail_level: "detailed",
    });

    expect(output.vaults[0]).toMatchObject({
      vault_address: VAULT_ADDRESS,
      allocation_count: 2,
      reward_count: 1,
    });
    await expect(
      service.findVaults({
        version: "V1",
        sort: "liquidityUsd",
        order: "desc",
        limit: 5,
        offset: 0,
        detail_level: "summary",
      }),
    ).rejects.toBeInstanceOf(ToolInputError);
    expect(client.calls).toHaveLength(1);
  });

  it("finds only active listed fixed-rate markets and preserves cursor paging", async () => {
    const client = new RecordingDataApiClient({
      "/defi/lending/fixed-rate/markets": {
        data: {
          items: [
            {
              market_id: MARKET_ID,
              loan_token: { symbol: "USDC" },
              collaterals: [{ symbol: "WETH", lltv: "0.8" }],
              maturity: "2026-12-31T00:00:00Z",
              total_units: "500000",
              best_bid: "0.045",
            },
          ],
          next_cursor: "next-page",
          has_more: true,
        },
        warnings: [],
      },
    });

    const output = await new LendingService(client).findFixedMarkets({
      maturity_from: "2026-08-04T00:00:00Z",
      maturity_to: "2026-12-31T00:00:00Z",
      sort: "totalUnits",
      order: "desc",
      limit: 5,
      cursor: "current-page",
      detail_level: "summary",
    });

    expect(client.calls[0]).toMatchObject({
      query: {
        network: "base",
        protocol: "morpho_midnight",
        active_only: true,
        listed: true,
        cursor: "current-page",
      },
    });
    expect(output).toMatchObject({
      count: 1,
      cursor: "current-page",
      next_cursor: "next-page",
      markets: [{ market_id: MARKET_ID, collateral_count: 1 }],
    });
    expect(output.markets[0]).not.toHaveProperty("best_bid");
  });

  it("routes unified detail calls by product type and validates identifiers locally", async () => {
    const client = new RecordingDataApiClient({
      "/defi/lending/vaults/detail": {
        data: {
          vault_address: VAULT_ADDRESS,
          vault_version: "V2",
          name: "Base USDC",
          allocations: [{}],
        },
        warnings: [],
      },
    });
    const service = new LendingService(client);

    const output = await service.getProductDetail({
      product_type: "vault",
      identifier: VAULT_ADDRESS,
      variable_rate_protocol: "morpho_blue",
      vault_version: "V2",
      detail_level: "detailed",
    });

    expect(client.calls[0]).toEqual({
      path: "/defi/lending/vaults/detail",
      query: { vault_address: VAULT_ADDRESS, version: "V2" },
    });
    expect(output.vault).toMatchObject({
      vault_address: VAULT_ADDRESS,
      allocation_count: 1,
    });
    await expect(
      service.getProductDetail({
        product_type: "fixed_rate_market",
        identifier: "not-a-market-id",
        variable_rate_protocol: "morpho_blue",
        vault_version: "V2",
        detail_level: "summary",
      }),
    ).rejects.toBeInstanceOf(ToolInputError);
    expect(client.calls).toHaveLength(1);
  });

  it("returns compact public wallet positions and preserves string warnings", async () => {
    const client = new RecordingDataApiClient({
      "/defi/lending/account/positions": {
        data: {
          protocol: "All",
          partial: false,
          results: [
            {
              protocol: "morpho_blue",
              summary: { blue_supplied_usd: "1500", nested: {} },
              blue_positions: [
                {
                  position_types: ["Supply"],
                  market: { market_id: MARKET_ID, loan_asset: { symbol: "USDC" } },
                  supply_assets: "1500000000",
                  supply_assets_usd: "1500",
                },
                {
                  position_types: ["Borrow"],
                  market: { market_id: MARKET_ID, loan_asset: { symbol: "USDC" } },
                  borrow_assets_usd: "200",
                },
              ],
              warnings: ["Position values may be delayed."],
              source: [{ fetched_at: "2026-08-11T08:00:00Z" }],
            },
            {
              protocol: "aave_v3",
              summary: { supplied_usd: "500", health_factor: "2.1" },
              positions: [
                {
                  position_types: ["Supply"],
                  market_address: VAULT_ADDRESS,
                  asset: { symbol: "USDC" },
                  supplied_usd: "500",
                },
              ],
            },
          ],
          errors: [],
        },
        warnings: [],
      },
    });

    const output = await new LendingService(client).getPositions({
      wallet_address: WALLET_ADDRESS,
      protocol: "All",
      position_type: "All",
      positions_per_product: 1,
      detail_level: "summary",
    });

    expect(client.calls[0]).toMatchObject({
      path: "/defi/lending/account/positions",
      query: { network: "base", protocol: "All", position_type: "All" },
    });
    expect(output).toMatchObject({
      wallet_address: WALLET_ADDRESS,
      positions_per_product: 1,
      available_counts: { blue: 2, midnight: 0, aave_v3: 1 },
      returned_counts: { blue: 1, midnight: 0, aave_v3: 1 },
      truncated: true,
      protocol_summaries: {
        morpho_blue: { blue_supplied_usd: "1500" },
        aave_v3: { supplied_usd: "500", health_factor: "2.1" },
      },
      blue_positions: [{ product: "Blue", supply_assets_usd: "1500" }],
      aave_positions: [{ product: "Aave V3", supplied_usd: "500" }],
      warnings: [{ code: "lending_position_warning", message: "Position values may be delayed." }],
    });
    expect(output.blue_positions[0]).not.toHaveProperty("supply_assets");
    expect(output.protocol_summaries.morpho_blue).not.toHaveProperty("nested");

    const fullOutput = await new LendingService(client).getPositions({
      wallet_address: WALLET_ADDRESS,
      protocol: "All",
      position_type: "All",
      positions_per_product: 0,
      detail_level: "summary",
    });
    expect(fullOutput).toMatchObject({
      returned_counts: { blue: 2, midnight: 0, aave_v3: 1 },
      truncated: false,
    });
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
