import type { DataApiClient, DataApiResult } from "../../data-api/types.js";
import { collectWarnings } from "../shared/issues.js";
import { compactRecord, records, type JsonRecord } from "../shared/records.js";
import type {
  AnnouncementDetailInput,
  AnnouncementDetailOutput,
  AnnouncementSearchInput,
  AnnouncementSearchOutput,
} from "./schema.js";

export class AnnouncementsService {
  readonly #client: DataApiClient;

  constructor(client: DataApiClient) {
    this.#client = client;
  }

  async search(input: AnnouncementSearchInput): Promise<AnnouncementSearchOutput> {
    const response = await this.#client.get<JsonRecord>("/cex/announcements/list", {
      source: input.source,
      category: input.category,
      query: input.query || undefined,
      start_time: input.start_time,
      end_time: input.end_time,
      page: input.page,
      limit: input.limit,
    });
    return announcementSearchOutput(response, input);
  }

  async get(input: AnnouncementDetailInput): Promise<AnnouncementDetailOutput> {
    const response = await this.#client.get<JsonRecord>("/cex/announcements/detail", {
      announcement_id: input.announcement_id,
    });
    return {
      announcement: announcementItem(response.data, true),
      warnings: collectWarnings(response.warnings, response.data),
      errors: [],
    };
  }
}

function announcementSearchOutput(
  response: DataApiResult<JsonRecord>,
  input: AnnouncementSearchInput,
): AnnouncementSearchOutput {
  const items = records(response.data.items)
    .slice(0, input.limit)
    .map((item) => announcementItem(item));
  return {
    source: input.source,
    category: input.category,
    page: integerValue(response.data.page, input.page),
    limit: integerValue(response.data.limit, input.limit),
    count: integerValue(response.data.count, items.length),
    has_more: response.data.has_more === true,
    announcements: items,
    warnings: collectWarnings(response.warnings, response.data),
    errors: [],
  };
}

function announcementItem(
  item: JsonRecord,
  includeContent = false,
): AnnouncementDetailOutput["announcement"] {
  const id = integerValue(item.id ?? item.announcement_id, 0);
  const source = stringValue(item.source) ?? "unknown";
  const title = stringValue(item.title) ?? "Untitled announcement";
  return compactRecord({
    announcement_id: id,
    source,
    external_id: stringValue(item.external_id),
    category: stringValue(item.category_name ?? item.category),
    source_category_name: stringValue(item.source_category_name),
    title,
    summary: trimString(item.summary, 700),
    content: includeContent ? trimString(item.content, 3000) : undefined,
    web_url: stringValue(item.web_url),
    published_at: stringValue(item.published_at),
    announced_at: stringValue(item.announced_at),
    status: optionalInteger(item.status),
    risk_warning: trimString(item.risk_warning, 500),
  }) as AnnouncementDetailOutput["announcement"];
}

function integerValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) ? value : fallback;
}

function optionalInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function trimString(value: unknown, limit: number): string | undefined {
  const clean = stringValue(value);
  if (!clean) {
    return undefined;
  }
  return clean.length <= limit ? clean : `${clean.slice(0, limit - 3).trimEnd()}...`;
}
