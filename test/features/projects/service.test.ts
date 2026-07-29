import { describe, expect, it } from "vitest";

import type { DataApiClient, DataApiResult, QueryParameters } from "../../../src/data-api/types.js";
import { ProjectsService } from "../../../src/features/projects/service.js";

describe("ProjectsService", () => {
  it("prefers symbol lookup and returns compact search records", async () => {
    const client = new RecordingDataApiClient({
      "/v1/crypto/project/search": {
        data: [
          {
            project_id: "ethereum",
            asset: "ETH",
            name: "Ethereum",
            one_liner: "Smart-contract platform",
            market_cap: 500_000_000_000,
            contracts: [
              { chain: "ethereum", contract_address: "native" },
              { chain: "base", contract_address: "0xeth" },
            ],
            internal_rank: 1,
          },
        ],
        warnings: [],
      },
    });

    const output = await new ProjectsService(client).search({
      symbol: " eth ",
      project_name: "Ethereum",
      query: "smart contracts",
      contract_address: "",
      limit: 5,
      offset: 0,
    });

    expect(client.calls[0]).toEqual({
      path: "/v1/crypto/project/search",
      query: {
        query: "ETH",
        contract_address: undefined,
        limit: 5,
        offset: 0,
      },
    });
    expect(output).toMatchObject({
      query: "ETH",
      count: 1,
      projects: [
        {
          project_id: "ethereum",
          asset: "ETH",
          name: "Ethereum",
          contracts: [
            { chain: "ethereum", contract_address: "native" },
            { chain: "base", contract_address: "0xeth" },
          ],
        },
      ],
      errors: [],
    });
    expect(output.projects[0]).not.toHaveProperty("internal_rank");
  });

  it("warns when a contract address is the only project identity", async () => {
    const client = new RecordingDataApiClient({
      "/v1/crypto/project/search": { data: [], warnings: [] },
    });
    const output = await new ProjectsService(client).search({
      symbol: "",
      project_name: "",
      query: "",
      contract_address: "0x0000000000000000000000000000000000000000",
      limit: 5,
      offset: 0,
    });

    expect(output.warnings).toMatchObject([{ code: "contract_address_is_auxiliary" }]);
  });

  it("normalizes project detail source values and investor fields", async () => {
    const client = new RecordingDataApiClient({
      "/v1/crypto/project/detail": {
        data: {
          project_id: "bitcoin",
          asset: "BTC",
          name: "Bitcoin",
          description: "Peer-to-peer money",
          market_cap_usd: { coingecko: 2_000_000_000_000, coinmarketcap: null },
          fully_diluted_valuation_usd: { cg: "2100000000000" },
          circulating_supply: { coingecko: 20_000_000 },
          total_supply: {},
          max_supply: { coinmarketcap: 21_000_000 },
          volume_24h_usd: { coingecko: 50_000_000_000 },
          contracts: [],
          exchange_presence: ["Binance", "Coinbase"],
          investors: [
            { name: "Unknown record", type: "unknown", is_lead_investor: 0 },
            { name: "Example Capital", type: "organization", is_lead_investor: 1 },
          ],
          fundraise: [
            {
              round: "Seed",
              amount: 1_000_000,
              investors: [{ name: "Example Capital", type: "organization" }],
            },
          ],
        },
        warnings: [],
      },
    });

    const output = await new ProjectsService(client).get({ project_id: "bitcoin" });

    expect(output).toMatchObject({
      project_id: "bitcoin",
      asset: "BTC",
      market_cap_usd: { coingecko: 2_000_000_000_000 },
      fully_diluted_valuation_usd: { coingecko: "2100000000000" },
      exchange_presence_count: 2,
      investors: [
        { name: "Unknown record", is_lead_investor: false },
        { name: "Example Capital", type: "organization", is_lead_investor: true },
      ],
      fundraise_count: 1,
      errors: [],
    });
    expect(output.investors[0]).not.toHaveProperty("type");
  });

  it("rejects an empty project search before making an API call", async () => {
    const client = new RecordingDataApiClient({});

    await expect(
      new ProjectsService(client).search({
        symbol: "",
        project_name: "",
        query: "",
        contract_address: "",
        limit: 5,
        offset: 0,
      }),
    ).rejects.toMatchObject({ code: "project_search_needs_identity" });
    expect(client.calls).toEqual([]);
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
