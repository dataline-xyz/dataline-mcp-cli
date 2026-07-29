import { describe, expect, it } from "vitest";

import type { DataApiClient, DataApiResult, QueryParameters } from "../../../src/data-api/types.js";
import { PredictionService } from "../../../src/features/prediction/service.js";

describe("PredictionService", () => {
  it("passes category, activity, and sort filters to event search", async () => {
    const client = new RecordingDataApiClient({
      "/prediction/events/list": {
        data: [
          {
            provider: "polymarket",
            event_id: 30615,
            slug: "world-cup-winner",
            title: "World Cup Winner",
            volume_24h: 80_000_000,
            is_active: true,
          },
        ],
        warnings: [],
      },
    });

    const output = await new PredictionService(client).search({
      category: "Sports",
      query: "world cup",
      active_status: "active",
      sort: "volume24hr",
      order: "desc",
      page: 1,
      limit: 5,
    });

    expect(client.calls[0]).toEqual({
      path: "/prediction/events/list",
      query: {
        category: "Sports",
        query: "world cup",
        page: 1,
        limit: 5,
        is_active: true,
        sort: "volume24hr",
        order: "desc",
      },
    });
    expect(output).toMatchObject({
      count: 1,
      next_page: null,
      events: [
        {
          event_id: 30615,
          slug: "world-cup-winner",
          title: "World Cup Winner",
          is_active: true,
        },
      ],
      errors: [],
    });
  });

  it("uses the slug once, then sorts and pages child markets locally", async () => {
    const client = new RecordingDataApiClient({
      "/prediction/events/detail": {
        data: {
          provider: "polymarket",
          event_id: 30615,
          slug: "world-cup-winner",
          title: "World Cup Winner",
          is_active: true,
          rules: [{ rules_primary: "The winner resolves Yes." }],
          url: { polymarket: "https://polymarket.com/event/world-cup-winner" },
          markets: {
            polymarket: [
              {
                id: 1,
                title: "France",
                best_yes_ask: "0.19",
                outcomes: ["Yes", "No"],
                outcome_prices: ["0.19", "0.81"],
                volume_24h: "2000000",
              },
              {
                id: 2,
                title: "Spain",
                best_yes_ask: "0.14",
                outcomes: ["Yes", "No"],
                outcome_prices: ["0.14", "0.86"],
                volume_24h: "3000000",
              },
              {
                id: 3,
                title: "England",
                best_yes_ask: "0.13",
                outcomes: ["Yes", "No"],
                outcome_prices: ["0.13", "0.87"],
                volume_24h: "1000000",
              },
            ],
          },
        },
        warnings: [],
      },
    });

    const output = await new PredictionService(client).get({
      slug: "world-cup-winner",
      event_id: 999,
      markets_limit: 1,
      markets_offset: 1,
      market_sort: "yes_price",
    });

    expect(client.calls).toEqual([
      {
        path: "/prediction/events/detail",
        query: { slug: "world-cup-winner", event_id: undefined },
      },
    ]);
    expect(output).toMatchObject({
      event: { event_id: 30615, title: "World Cup Winner" },
      markets_total: 3,
      markets_returned: 1,
      markets_next_offset: 2,
      markets: [
        {
          market_id: "2",
          title: "Spain",
          best_yes_ask: "0.14",
          outcomes: [
            { label: "Yes", price: "0.14" },
            { label: "No", price: "0.86" },
          ],
        },
      ],
      url: "https://polymarket.com/event/world-cup-winner",
      errors: [],
    });
  });

  it("sorts close times chronologically with missing values last", async () => {
    const client = new RecordingDataApiClient({
      "/prediction/events/detail": {
        data: {
          event_id: 1,
          title: "Event",
          is_active: true,
          markets: [
            { id: "missing", title: "Missing" },
            { id: "late", title: "Late", close_time: "2026-08-02T00:00:00Z" },
            { id: "early", title: "Early", close_time: "2026-08-01T00:00:00Z" },
          ],
        },
        warnings: [],
      },
    });

    const output = await new PredictionService(client).get({
      slug: "event",
      event_id: 0,
      markets_limit: 8,
      markets_offset: 0,
      market_sort: "close_time",
    });

    expect(output.markets.map((market) => market.market_id)).toEqual(["early", "late", "missing"]);
  });

  it("rejects missing event identity before an API request", async () => {
    const client = new RecordingDataApiClient({});

    await expect(
      new PredictionService(client).get({
        slug: "",
        event_id: 0,
        markets_limit: 8,
        markets_offset: 0,
        market_sort: "yes_price",
      }),
    ).rejects.toMatchObject({ code: "prediction_event_needs_id" });
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
