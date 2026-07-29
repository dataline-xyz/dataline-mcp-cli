import type { DataApiClient, DataApiResult } from "../../data-api/types.js";
import { collectWarnings } from "../shared/issues.js";
import { compactRecord, records, type JsonRecord } from "../shared/records.js";
import type {
  DefiPoolListInput,
  DefiPoolListOutput,
  DefiPoolSearchInput,
  DefiPoolSearchOutput,
} from "./schema.js";

const PAGE_SIZE = 20;

export class DefiPoolsService {
  readonly #client: DataApiClient;

  constructor(client: DataApiClient) {
    this.#client = client;
  }

  async list(input: DefiPoolListInput): Promise<DefiPoolListOutput> {
    const response = await this.#client.get<unknown>("/defi/pools", {
      networks: "base",
      dexes: input.dexes.length > 0 ? input.dexes : undefined,
      sort: input.sort,
      page: input.page,
    });
    const page = poolPage(response, input.page);
    return {
      network: "base",
      dexes: input.dexes,
      sort: input.sort,
      page: input.page,
      ...page,
    };
  }

  async search(input: DefiPoolSearchInput): Promise<DefiPoolSearchOutput> {
    const query = input.query.trim();
    const response = await this.#client.get<unknown>("/defi/pools/search", {
      query,
      network: input.network === "all" ? undefined : input.network,
      page: input.page,
    });
    const page = poolPage(response, input.page);
    return {
      query,
      network: input.network,
      page: input.page,
      ...page,
    };
  }
}

function poolPage(
  response: DataApiResult<unknown>,
  page: number,
): Pick<DefiPoolListOutput, "count" | "next_page" | "pools" | "warnings" | "errors"> {
  const raw = records(response.data);
  const pools = raw.map(slimPool);
  return {
    count: pools.length,
    next_page: raw.length >= PAGE_SIZE ? page + 1 : null,
    pools,
    warnings: collectWarnings(response.warnings, response.data),
    errors: [],
  };
}

function slimPool(item: JsonRecord): DefiPoolListOutput["pools"][number] {
  return compactRecord({
    pool_id: stringValue(item.pool_id) ?? "unknown",
    network: stringValue(item.network),
    address: stringValue(item.address),
    name: stringValue(item.name),
    dex_id: stringValue(item.dex_id),
    base_token_id: stringValue(item.base_token_id),
    quote_token_id: stringValue(item.quote_token_id),
    base_token_price_usd: stringValue(item.base_token_price_usd),
    quote_token_price_usd: stringValue(item.quote_token_price_usd),
    reserve_in_usd: stringValue(item.reserve_in_usd),
    fdv_usd: stringValue(item.fdv_usd),
    market_cap_usd: stringValue(item.market_cap_usd),
    pool_created_at: stringValue(item.pool_created_at),
  }) as DefiPoolListOutput["pools"][number];
}

function stringValue(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") {
    return undefined;
  }
  const text = String(value).trim();
  return text || undefined;
}
