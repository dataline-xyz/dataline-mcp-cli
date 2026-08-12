export const DATALINE_TOOL_NAMES = [
  "get_tool_pricing",
  "get_crypto_cex_price",
  "get_crypto_dex_price",
  "get_crypto_ohlcv",
  "get_perpetual_metrics",
  "get_perpetual_metrics_history",
  "search_crypto_projects",
  "get_crypto_project",
  "find_exchange_announcements",
  "get_exchange_announcement",
  "find_prediction_events",
  "get_prediction_event",
  "list_defi_pools",
  "search_defi_pools",
  "find_variable_rate_lending_markets",
  "find_lending_vaults",
  "find_fixed_rate_lending_markets",
  "get_lending_product_detail",
  "get_lending_positions",
  "get_lending_history",
  "get_fixed_rate_lending_orderbook",
] as const;

export type DatalineToolName = (typeof DATALINE_TOOL_NAMES)[number];

export interface ToolRouteBinding {
  routeId: string;
  when?: string;
}

export interface ToolPricingDefinition {
  toolName: DatalineToolName;
  billing: "free" | "metered";
  routes: readonly ToolRouteBinding[];
  note?: string;
}

export const TOOL_PRICING_DEFINITIONS: readonly ToolPricingDefinition[] = [
  {
    toolName: "get_tool_pricing",
    billing: "free",
    routes: [],
    note: "Pricing discovery is free and does not call a metered Data API route.",
  },
  metered("get_crypto_cex_price", "crypto.cex.price.read"),
  metered("get_crypto_dex_price", "crypto.dex.price.read"),
  metered("get_crypto_ohlcv", "crypto.history.read"),
  metered("get_perpetual_metrics", "crypto.perpetuals.metrics.read"),
  {
    toolName: "get_perpetual_metrics_history",
    billing: "metered",
    routes: [
      {
        routeId: "crypto.perpetuals.funding_history.read",
        when: "metric=funding_rate",
      },
      {
        routeId: "crypto.perpetuals.open_interest_history.read",
        when: "metric=open_interest",
      },
    ],
  },
  metered("search_crypto_projects", "crypto.project.search.read"),
  metered("get_crypto_project", "crypto.project.detail.read"),
  metered("find_exchange_announcements", "cex.announcements.list.read"),
  metered("get_exchange_announcement", "cex.announcements.detail.read"),
  metered("find_prediction_events", "prediction.events.list.read"),
  metered("get_prediction_event", "prediction.events.detail.read"),
  metered("list_defi_pools", "defi.pools.list.read"),
  metered("search_defi_pools", "defi.pools.search.read"),
  metered("find_variable_rate_lending_markets", "defi.lending.variable_rate_markets.list.read"),
  metered("find_lending_vaults", "defi.lending.vaults.list.read"),
  metered("find_fixed_rate_lending_markets", "defi.lending.fixed_rate_markets.list.read"),
  {
    toolName: "get_lending_product_detail",
    billing: "metered",
    routes: [
      {
        routeId: "defi.lending.variable_rate_markets.detail.read",
        when: "product_type=variable_rate_market",
      },
      {
        routeId: "defi.lending.vaults.detail.read",
        when: "product_type=vault",
      },
      {
        routeId: "defi.lending.fixed_rate_markets.detail.read",
        when: "product_type=fixed_rate_market",
      },
    ],
  },
  metered("get_lending_positions", "defi.lending.account_positions.read"),
  {
    toolName: "get_lending_history",
    billing: "metered",
    routes: [
      {
        routeId: "defi.lending.variable_rate_markets.history.read",
        when: "product_type=variable_rate_market",
      },
      {
        routeId: "defi.lending.vaults.history.read",
        when: "product_type=vault",
      },
    ],
  },
  metered("get_fixed_rate_lending_orderbook", "defi.lending.fixed_rate_markets.orderbook.read"),
];

export function isDatalineToolName(value: string): value is DatalineToolName {
  return DATALINE_TOOL_NAMES.some((toolName) => toolName === value);
}

function metered(toolName: DatalineToolName, routeId: string): ToolPricingDefinition {
  return { toolName, billing: "metered", routes: [{ routeId }] };
}
