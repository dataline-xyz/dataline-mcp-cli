import type { DataApiClient, DataApiResult } from "../../data-api/types.js";
import { ToolInputError } from "../../mcp/tool-result.js";
import { collectWarnings, dedupeWarnings, warning } from "../shared/issues.js";
import {
  compactRecord,
  firstNumberLike,
  firstString,
  isRecord,
  records,
  type JsonRecord,
} from "../shared/records.js";
import type {
  ProjectDetailInput,
  ProjectDetailOutput,
  ProjectSearchInput,
  ProjectSearchOutput,
} from "./schema.js";

const SEARCH_CONTRACT_LIMIT = 4;
const DETAIL_CONTRACT_LIMIT = 12;
const DETAIL_EXCHANGE_LIMIT = 20;
const DETAIL_INVESTOR_LIMIT = 20;
const DETAIL_FUNDRAISE_LIMIT = 8;

export class ProjectsService {
  readonly #client: DataApiClient;

  constructor(client: DataApiClient) {
    this.#client = client;
  }

  async search(input: ProjectSearchInput): Promise<ProjectSearchOutput> {
    const symbol = input.symbol.trim().toUpperCase();
    const projectName = input.project_name.trim();
    const fallbackQuery = input.query.trim();
    const contractAddress = input.contract_address.trim();
    const query = symbol || projectName || fallbackQuery;
    if (!query && !contractAddress) {
      throw new ToolInputError(
        "project_search_needs_identity",
        "Provide symbol, project_name, query, or contract_address.",
      );
    }

    const response = await this.#client.get<unknown>("/v1/crypto/project/search", {
      query: query || undefined,
      contract_address: contractAddress || undefined,
      limit: input.limit,
      offset: input.offset,
    });
    return projectSearchOutput(response, query, contractAddress, input.limit, input.offset);
  }

  async get(input: ProjectDetailInput): Promise<ProjectDetailOutput> {
    const projectId = input.project_id.trim();
    const response = await this.#client.get<JsonRecord>("/v1/crypto/project/detail", {
      project_id: projectId,
    });
    return projectDetailOutput(response, projectId);
  }
}

function projectSearchOutput(
  response: DataApiResult<unknown>,
  query: string,
  contractAddress: string,
  limit: number,
  offset: number,
): ProjectSearchOutput {
  const projects = records(response.data).slice(0, limit).map(slimSearchItem);
  const localWarnings =
    !query && contractAddress
      ? [
          warning(
            "contract_address_is_auxiliary",
            "A contract address identifies one token deployment, not always the full project.",
          ),
        ]
      : [];
  return {
    query: query || contractAddress,
    limit,
    offset,
    count: projects.length,
    projects,
    warnings: dedupeWarnings([
      ...localWarnings,
      ...collectWarnings(response.warnings, response.data),
    ]),
    errors: [],
  };
}

function projectDetailOutput(
  response: DataApiResult<JsonRecord>,
  projectId: string,
): ProjectDetailOutput {
  const data = response.data;
  const allContracts = records(data.contracts).map(slimContract).filter(hasValues);
  const allExchanges = stringItems(data.exchange_presence, 160);
  const allInvestors = arrayItems(data.investors).map(slimInvestor).filter(hasValues);
  const allFundraise = records(data.fundraise).map(slimFundraise).filter(hasValues);

  return {
    project_id: trimString(data.project_id, 255) ?? projectId,
    asset: trimString(data.asset, 40),
    name: trimString(data.name, 160),
    one_liner: trimString(data.one_liner, 320),
    description: trimString(data.description, 1400),
    total_funding: optionalNumberLike(data.total_funding),
    social_media: socialMedia(data.social_media),
    market_cap_usd: sourceValue(data.market_cap_usd ?? data.market_cap),
    fully_diluted_valuation_usd: sourceValue(
      data.fully_diluted_valuation_usd ?? data.fully_diluted_valuation,
    ),
    circulating_supply: sourceValue(data.circulating_supply),
    total_supply: sourceValue(data.total_supply),
    max_supply: sourceValue(data.max_supply),
    volume_24h_usd: sourceValue(data.volume_24h_usd ?? data.volume_24h),
    contracts: allContracts.slice(0, DETAIL_CONTRACT_LIMIT),
    contract_count: allContracts.length,
    exchange_presence: allExchanges.slice(0, DETAIL_EXCHANGE_LIMIT),
    exchange_presence_count: allExchanges.length,
    investors: allInvestors.slice(0, DETAIL_INVESTOR_LIMIT),
    fundraise: allFundraise.slice(0, DETAIL_FUNDRAISE_LIMIT),
    fundraise_count: allFundraise.length,
    warnings: collectWarnings(response.warnings, data),
    errors: [],
  };
}

function slimSearchItem(item: JsonRecord): JsonRecord {
  const contracts = records(item.contracts)
    .slice(0, SEARCH_CONTRACT_LIMIT)
    .map(slimContract)
    .filter(hasValues);
  return compactRecord({
    project_id: trimString(item.project_id ?? item.coingecko_id, 255),
    asset: trimString(item.asset, 40),
    name: trimString(item.name, 160),
    one_liner: trimString(item.one_liner, 240),
    market_cap: optionalNumberLike(item.market_cap),
    contracts: contracts.length > 0 ? contracts : undefined,
  });
}

function slimContract(item: JsonRecord): JsonRecord {
  return compactRecord({
    chain: trimString(item.chain, 80),
    contract_address: trimString(item.contract_address, 220),
  });
}

function slimInvestor(value: unknown): JsonRecord {
  if (typeof value === "string") {
    return compactRecord({ name: trimString(value, 160) });
  }
  if (!isRecord(value)) {
    return {};
  }
  const type = firstString(value.type);
  return compactRecord({
    name: trimString(value.name, 160),
    type: type === "project" || type === "organization" || type === "person" ? type : undefined,
    logo: trimString(value.logo, 400),
    is_lead_investor: booleanValue(value.is_lead_investor ?? value.lead_investor),
  });
}

function slimFundraise(item: JsonRecord): ProjectDetailOutput["fundraise"][number] {
  const investors = arrayItems(item.investors).slice(0, 8).map(slimInvestor).filter(hasValues);
  return {
    round: trimString(item.round, 120),
    published_time: trimString(item.published_time, 80),
    amount: optionalNumberLike(item.amount),
    valuation: optionalNumberLike(item.valuation),
    investors,
    one_liner: trimString(item.one_liner, 260),
    x_url: trimString(item.x_url, 400),
  };
}

function sourceValue(value: unknown): JsonRecord {
  if (!isRecord(value)) {
    return {};
  }
  return compactRecord({
    coingecko: optionalNumberLike(value.coingecko ?? value.cg),
    coinmarketcap: optionalNumberLike(value.coinmarketcap ?? value.cmc),
  });
}

function socialMedia(value: unknown): JsonRecord {
  if (!isRecord(value)) {
    return {};
  }
  return compactRecord(
    Object.fromEntries(
      [
        "website",
        "x",
        "twitter",
        "telegram",
        "discord",
        "github",
        "medium",
        "linkedin",
        "gitbook",
        "docs",
        "defillama",
      ].map((key) => [key, trimString(value[key], 400)]),
    ),
  );
}

function arrayItems(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringItems(value: unknown, limit: number): string[] {
  return arrayItems(value)
    .map((item) => trimString(item, limit))
    .filter((item): item is string => item !== undefined);
}

function trimString(value: unknown, limit: number): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const clean = value.trim();
  if (!clean) {
    return undefined;
  }
  return clean.length <= limit ? clean : `${clean.slice(0, limit - 3).trimEnd()}...`;
}

function optionalNumberLike(value: unknown): string | number | undefined {
  const result = firstNumberLike(value);
  return result ?? undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (value === 0 || value === "0" || value === "false" || value === "no") {
    return false;
  }
  if (value === 1 || value === "1" || value === "true" || value === "yes") {
    return true;
  }
  return undefined;
}

function hasValues(value: JsonRecord): boolean {
  return Object.keys(value).length > 0;
}
