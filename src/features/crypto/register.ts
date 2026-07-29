import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { runTool } from "../../mcp/tool-result.js";
import {
  cexPriceInputSchema,
  cryptoOhlcvOutputSchema,
  cryptoPriceOutputSchema,
  dexPriceInputSchema,
  ohlcvInputSchema,
} from "./schema.js";
import type { CryptoService } from "./service.js";

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

export function registerCryptoTools(server: McpServer, service: CryptoService): void {
  server.registerTool(
    "get_crypto_cex_price",
    {
      title: "Get CEX crypto price",
      description:
        "Get the current spot price of one ticker across centralized exchanges. Use get_crypto_dex_price for a chain and contract address, and get_crypto_ohlcv for candles.",
      inputSchema: cexPriceInputSchema,
      outputSchema: cryptoPriceOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    (input) => runTool(() => service.getCexPrice(input)),
  );

  server.registerTool(
    "get_crypto_dex_price",
    {
      title: "Get DEX token price",
      description:
        "Get the current token price by blockchain and contract address. Use get_crypto_cex_price for ticker-only assets such as BTC or ETH.",
      inputSchema: dexPriceInputSchema,
      outputSchema: cryptoPriceOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    (input) => runTool(() => service.getDexPrice(input)),
  );

  server.registerTool(
    "get_crypto_ohlcv",
    {
      title: "Get crypto OHLCV",
      description:
        "Get historical OHLCV candles from one venue as compact columns and rows. Use the price tools when only a current price is needed.",
      inputSchema: ohlcvInputSchema,
      outputSchema: cryptoOhlcvOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    (input) => runTool(() => service.getOhlcv(input)),
  );
}
