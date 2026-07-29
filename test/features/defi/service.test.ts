import { describe, expect, it } from "vitest";

import type { DataApiClient, DataApiResult, QueryParameters } from "../../../src/data-api/types.js";
import { DefiPoolsService } from "../../../src/features/defi/service.js";

describe("DefiPoolsService", () => {
  it("lists Base pools with repeated DEX filters and current sort values", async () => {
    const pools = Array.from({ length: 20 }, (_, index) => ({
      pool_id: `base_pool_${index}`,
      network: "base",
      name: `POOL ${index}`,
      dex_id: "aerodrome-base",
      reserve_in_usd: String(1_000_000 - index),
      internal_payload: { ignored: true },
    }));
    const client = new RecordingDataApiClient({
      "/defi/pools": { data: pools, warnings: [] },
    });

    const output = await new DefiPoolsService(client).list({
      dexes: ["aerodrome-base", "uniswap-v3-base"],
      sort: "price_desc",
      page: 2,
    });

    expect(client.calls[0]).toEqual({
      path: "/defi/pools",
      query: {
        networks: "base",
        dexes: ["aerodrome-base", "uniswap-v3-base"],
        sort: "price_desc",
        page: 2,
      },
    });
    expect(output).toMatchObject({
      network: "base",
      count: 20,
      next_page: 3,
      errors: [],
    });
    expect(output.pools[0]).toMatchObject({
      pool_id: "base_pool_0",
      network: "base",
      dex_id: "aerodrome-base",
      reserve_in_usd: "1000000",
    });
    expect(output.pools[0]).not.toHaveProperty("internal_payload");
  });

  it("omits the network parameter for cross-network search", async () => {
    const client = new RecordingDataApiClient({
      "/defi/pools/search": {
        data: [
          {
            pool_id: "eth_pool",
            network: "eth",
            name: "WETH / USDC",
            base_token_price_usd: 3800,
          },
        ],
        warnings: [],
      },
    });

    const output = await new DefiPoolsService(client).search({
      query: " WETH ",
      network: "all",
      page: 1,
    });

    expect(client.calls[0]).toEqual({
      path: "/defi/pools/search",
      query: { query: "WETH", network: undefined, page: 1 },
    });
    expect(output).toMatchObject({
      query: "WETH",
      network: "all",
      count: 1,
      next_page: null,
      pools: [{ pool_id: "eth_pool", base_token_price_usd: "3800" }],
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
