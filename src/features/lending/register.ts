import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { runTool } from "../../mcp/tool-result.js";
import {
  fixedRateOrderbookInputSchema,
  fixedRateOrderbookOutputSchema,
  lendingHistoryInputSchema,
  lendingHistoryOutputSchema,
} from "./analytics-schema.js";
import type { LendingAnalyticsService } from "./analytics-service.js";
import {
  fixedMarketSearchInputSchema,
  fixedMarketSearchOutputSchema,
  lendingPositionsInputSchema,
  lendingPositionsOutputSchema,
  lendingProductDetailInputSchema,
  lendingProductDetailOutputSchema,
  lendingVaultSearchInputSchema,
  lendingVaultSearchOutputSchema,
  variableMarketSearchInputSchema,
  variableMarketSearchOutputSchema,
} from "./schema.js";
import type { LendingService } from "./service.js";

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

export function registerLendingTools(
  server: McpServer,
  service: LendingService,
  analyticsService: LendingAnalyticsService,
): void {
  server.registerTool(
    "find_variable_rate_lending_markets",
    {
      title: "Find variable-rate lending markets",
      description:
        "Browse Morpho Blue or Aave V3 variable-rate markets on Base. Results default to 5 compact items; raise limit deliberately when broader coverage is worth the added agent context.",
      inputSchema: variableMarketSearchInputSchema,
      outputSchema: variableMarketSearchOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    (input) => runTool(() => service.findVariableMarkets(input)),
  );

  server.registerTool(
    "find_lending_vaults",
    {
      title: "Find lending vaults",
      description:
        "Browse Morpho lending vaults on Base by asset, version, assets, liquidity, or APY. Results default to 5 compact items; use detail_level=detailed only when extra metrics matter.",
      inputSchema: lendingVaultSearchInputSchema,
      outputSchema: lendingVaultSearchOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    (input) => runTool(() => service.findVaults(input)),
  );

  server.registerTool(
    "find_fixed_rate_lending_markets",
    {
      title: "Find fixed-rate lending markets",
      description:
        "Browse active, listed Morpho fixed-rate markets on Base, optionally filtered by asset addresses or maturity. Results default to 5 compact items and support cursor pagination.",
      inputSchema: fixedMarketSearchInputSchema,
      outputSchema: fixedMarketSearchOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    (input) => runTool(() => service.findFixedMarkets(input)),
  );

  server.registerTool(
    "get_lending_product_detail",
    {
      title: "Get lending product detail",
      description:
        "Get one Morpho variable-rate market, vault, or fixed-rate market on Base. Pass the market ID or vault address returned by a lending discovery tool.",
      inputSchema: lendingProductDetailInputSchema,
      outputSchema: lendingProductDetailOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    (input) => runTool(() => service.getProductDetail(input)),
  );

  server.registerTool(
    "get_lending_positions",
    {
      title: "Get lending positions",
      description:
        "Read public Morpho Blue, Morpho Midnight, or Aave V3 positions for one Base wallet. Defaults to 10 compact positions per protocol; set positions_per_product=0 only to return every position.",
      inputSchema: lendingPositionsInputSchema,
      outputSchema: lendingPositionsOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    (input) => runTool(() => service.getPositions(input)),
  );

  server.registerTool(
    "get_lending_history",
    {
      title: "Get lending history",
      description:
        "Get one variable-rate market or vault metric series. Returns the 60 most recent points by default; set points_limit=0 only when the full series is worth the added agent context.",
      inputSchema: lendingHistoryInputSchema,
      outputSchema: lendingHistoryOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    (input) => runTool(() => analyticsService.getHistory(input)),
  );

  server.registerTool(
    "get_fixed_rate_lending_orderbook",
    {
      title: "Get fixed-rate lending orderbook",
      description:
        "Get bid and ask levels for one Morpho Midnight market on Base, with bounded depth and compact or detailed levels.",
      inputSchema: fixedRateOrderbookInputSchema,
      outputSchema: fixedRateOrderbookOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    (input) => runTool(() => analyticsService.getFixedRateOrderbook(input)),
  );
}
