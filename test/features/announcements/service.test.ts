import { describe, expect, it } from "vitest";

import type { DataApiClient, DataApiResult, QueryParameters } from "../../../src/data-api/types.js";
import { AnnouncementsService } from "../../../src/features/announcements/service.js";
import type { JsonRecord } from "../../../src/features/shared/records.js";

describe("AnnouncementsService", () => {
  it("passes explicit enum filters and keeps list records compact", async () => {
    const client = new RecordingDataApiClient({
      "/cex/announcements/list": {
        data: {
          page: 2,
          limit: 5,
          count: 1,
          has_more: true,
          items: [
            {
              id: 42,
              source: "binance",
              external_id: "external-42",
              category_name: "listing",
              title: "New listing",
              summary: "A token will be listed.",
              content: "Full content must not appear in list results.",
              announced_at: "2026-07-27T00:00:00Z",
              status: 1,
            },
          ],
        },
        warnings: [],
      },
    });

    const output = await new AnnouncementsService(client).search({
      source: "binance",
      category: "listing",
      query: "token",
      start_time: "2026-07-01T00:00:00Z",
      page: 2,
      limit: 5,
    });

    expect(client.calls[0]).toEqual({
      path: "/cex/announcements/list",
      query: {
        source: "binance",
        category: "listing",
        query: "token",
        start_time: "2026-07-01T00:00:00Z",
        end_time: undefined,
        page: 2,
        limit: 5,
      },
    });
    expect(output).toMatchObject({
      page: 2,
      count: 1,
      has_more: true,
      announcements: [
        {
          announcement_id: 42,
          source: "binance",
          category: "listing",
          title: "New listing",
        },
      ],
      errors: [],
    });
    expect(output.announcements[0]).not.toHaveProperty("content");
  });

  it("uses the detail endpoint and bounds full content", async () => {
    const client = new RecordingDataApiClient({
      "/cex/announcements/detail": {
        data: {
          id: 42,
          source: "binance",
          external_id: "external-42",
          title: "New listing",
          content: "x".repeat(3200),
        },
        warnings: [],
      },
    });

    const output = await new AnnouncementsService(client).get({ announcement_id: 42 });

    expect(client.calls[0]).toEqual({
      path: "/cex/announcements/detail",
      query: { announcement_id: 42 },
    });
    expect(output.announcement.content).toHaveLength(3000);
    expect(output.announcement.content?.endsWith("...")).toBe(true);
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
