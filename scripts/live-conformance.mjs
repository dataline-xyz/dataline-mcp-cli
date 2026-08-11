import { Buffer } from "node:buffer";
import { performance } from "node:perf_hooks";
import { URL } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const PROD_DATA_API_URL = "https://data-api.dataline.xyz";
const TEST_WALLET = "0x161be081B853A4F2B26F48Ad45659aFC31874882";
const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

if (process.env.DATALINE_LIVE_TESTS !== "1") {
  throw new Error("Set DATALINE_LIVE_TESTS=1 to run credit-consuming production checks.");
}

const apiKey = process.env.DATALINE_API_KEY_PROD?.trim() || process.env.DATALINE_API_KEY?.trim();
if (!apiKey) {
  throw new Error("Set DATALINE_API_KEY_PROD or DATALINE_API_KEY before running live checks.");
}

const dataApiUrl = process.env.DATALINE_DATA_API_URL?.trim() || PROD_DATA_API_URL;
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["dist/cli.js", "mcp", "serve"],
  env: {
    ...process.env,
    DATALINE_AUTH_MODE: "api_key",
    DATALINE_API_KEY: apiKey,
    DATALINE_DATA_API_URL: dataApiUrl,
  },
  stderr: "pipe",
});
const client = new Client({ name: "dataline-live-conformance", version: "0.0.0" });
const results = [];

try {
  await client.connect(transport);
  await client.ping();

  const tools = await client.listTools();
  process.stdout.write(
    `Dataline live conformance: ${tools.tools.length} tools, ${new URL(dataApiUrl).origin}\n`,
  );

  await check("cex-price", "get_crypto_cex_price", {
    base: "BTC",
    quote: "USDT",
    venues: ["binance", "coinbase"],
  });
  await check("dex-price", "get_crypto_dex_price", {
    chain: "base",
    contract_address: BASE_USDC,
    venues: ["dexscreener", "geckoterminal"],
  });
  await check("ohlcv", "get_crypto_ohlcv", {
    base: "BTC",
    quote: "USDT",
    venue: "binance",
    market_type: "spot",
    interval: "1h",
    limit: 5,
  });
  await check("perpetual-metrics", "get_perpetual_metrics", {
    base: "BTC",
    quote: "USDT",
    venues: ["binance", "hyperliquid"],
  });
  await check("funding-history", "get_perpetual_metrics_history", {
    metric: "funding_rate",
    base: "BTC",
    quote: "USDT",
    venue: "binance",
    limit: 5,
  });
  await check("open-interest-history", "get_perpetual_metrics_history", {
    metric: "open_interest",
    base: "BTC",
    quote: "USDT",
    venue: "binance",
    interval: "1h",
    limit: 5,
  });

  const projects = await check("project-search", "search_crypto_projects", {
    symbol: "BTC",
    limit: 3,
  });
  const projectId = firstString(projects?.projects?.[0]?.project_id);
  await dependentCheck(
    "project-detail",
    projectId,
    "project-search returned no project_id",
    "get_crypto_project",
    { project_id: projectId },
  );

  const announcements = await check("announcement-search", "find_exchange_announcements", {
    source: "All",
    category: "All",
    limit: 3,
  });
  const announcementId = positiveInteger(announcements?.announcements?.[0]?.announcement_id);
  await dependentCheck(
    "announcement-detail",
    announcementId,
    "announcement-search returned no announcement_id",
    "get_exchange_announcement",
    { announcement_id: announcementId },
  );

  const predictions = await check("prediction-search", "find_prediction_events", {
    category: "All",
    active_status: "active",
    sort: "volume24hr",
    order: "desc",
    limit: 3,
  });
  const prediction = predictions?.events?.[0];
  const predictionSlug = firstString(prediction?.slug);
  const predictionId = positiveInteger(prediction?.event_id);
  const predictionArguments = predictionSlug
    ? { slug: predictionSlug, markets_limit: 5 }
    : { event_id: predictionId, markets_limit: 5 };
  await dependentCheck(
    "prediction-detail",
    predictionSlug || predictionId,
    "prediction-search returned neither slug nor event_id",
    "get_prediction_event",
    predictionArguments,
  );

  await check("defi-pool-list", "list_defi_pools", {
    sort: "reserve_in_usd_desc",
    page: 1,
  });
  await check("defi-pool-search", "search_defi_pools", {
    query: "USDC",
    network: "base",
    page: 1,
  });

  const morphoMarkets = await check(
    "lending-variable-morpho",
    "find_variable_rate_lending_markets",
    { protocol: "morpho_blue", limit: 3 },
  );
  await check("lending-variable-aave", "find_variable_rate_lending_markets", {
    protocol: "aave_v3",
    limit: 3,
  });
  const vaults = await check("lending-vault-list", "find_lending_vaults", {
    version: "V2",
    limit: 3,
  });
  const fixedMarkets = await check("lending-fixed-list", "find_fixed_rate_lending_markets", {
    limit: 3,
  });

  const variableMarketId = firstString(morphoMarkets?.markets?.[0]?.market_id);
  await dependentCheck(
    "lending-variable-detail",
    variableMarketId,
    "variable market search returned no market_id",
    "get_lending_product_detail",
    {
      product_type: "variable_rate_market",
      identifier: variableMarketId,
      variable_rate_protocol: "morpho_blue",
    },
  );
  const vaultAddress = firstString(vaults?.vaults?.[0]?.vault_address);
  const vaultVersion = firstString(vaults?.vaults?.[0]?.vault_version) || "V2";
  await dependentCheck(
    "lending-vault-detail",
    vaultAddress,
    "vault search returned no vault_address",
    "get_lending_product_detail",
    { product_type: "vault", identifier: vaultAddress, vault_version: vaultVersion },
  );
  const fixedMarketId = firstString(fixedMarkets?.markets?.[0]?.market_id);
  await dependentCheck(
    "lending-fixed-detail",
    fixedMarketId,
    "fixed market search returned no market_id",
    "get_lending_product_detail",
    { product_type: "fixed_rate_market", identifier: fixedMarketId },
  );

  await check("lending-positions", "get_lending_positions", {
    wallet_address: TEST_WALLET,
    protocol: "All",
    positions_per_product: 3,
  });
  await dependentCheck(
    "lending-variable-history",
    variableMarketId,
    "variable market search returned no market_id",
    "get_lending_history",
    {
      product_type: "variable_rate_market",
      identifier: variableMarketId,
      variable_rate_protocol: "morpho_blue",
      metric: "supplyApy",
      interval: "day",
      points_limit: 5,
    },
  );
  await dependentCheck(
    "lending-vault-history",
    vaultAddress,
    "vault search returned no vault_address",
    "get_lending_history",
    {
      product_type: "vault",
      identifier: vaultAddress,
      vault_version: vaultVersion,
      interval: "day",
      points_limit: 5,
    },
  );
  await dependentCheck(
    "lending-fixed-orderbook",
    fixedMarketId,
    "fixed market search returned no market_id",
    "get_fixed_rate_lending_orderbook",
    { market_id: fixedMarketId, side: "all", depth: 5 },
  );

  if (process.env.DATALINE_LIVE_EDGE_CASES === "1") {
    process.stdout.write("Edge cases:\n");
    await check("edge-cex-large-notional", "get_crypto_cex_price", {
      base: "PEPE",
      quote: "USDT",
      venues: ["binance"],
      quote_notional: 1_000_000_000,
    });
    await check("edge-dex-chain-alias", "get_crypto_dex_price", {
      chain: "eth",
      contract_address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      venues: ["dexscreener"],
    });
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 6 * 60 * 60 * 1000);
    await check("edge-ohlcv-time-range", "get_crypto_ohlcv", {
      base: "BTC",
      quote: "USDT",
      venue: "binance",
      market_type: "perpetual",
      interval: "1h",
      limit: 3,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
    });
    await check("edge-perpetual-single-venue", "get_perpetual_metrics", {
      base: "ETH",
      quote: "USDT",
      venues: ["okx"],
    });
    await check("edge-project-offset", "search_crypto_projects", {
      query: "ethereum",
      limit: 2,
      offset: 2,
    });
    await check("edge-project-empty-result", "search_crypto_projects", {
      symbol: "ZZZZNOTREAL12345",
      limit: 2,
    });
    await check("edge-announcement-filtered", "find_exchange_announcements", {
      source: "binance",
      category: "listing",
      page: 1,
      limit: 2,
    });
    await check("edge-announcement-empty-result", "find_exchange_announcements", {
      query: "dataline-no-match-9f57c130",
      limit: 2,
    });
    await check("edge-prediction-inactive-page", "find_prediction_events", {
      category: "All",
      active_status: "inactive",
      sort: "endDate",
      order: "asc",
      page: 2,
      limit: 2,
    });
    await check("edge-prediction-empty-result", "find_prediction_events", {
      query: "dataline-no-match-9f57c130",
      limit: 2,
    });
    await dependentCheck(
      "edge-prediction-offset-past-end",
      predictionSlug || predictionId,
      "prediction-search returned neither slug nor event_id",
      "get_prediction_event",
      {
        ...predictionArguments,
        markets_offset: 100_000,
        markets_limit: 1,
        market_sort: "liquidity",
      },
    );
    await check("edge-defi-filtered-page", "list_defi_pools", {
      dexes: ["aerodrome-base"],
      sort: "pool_created_at_desc",
      page: 2,
    });
    await check("edge-defi-all-networks", "search_defi_pools", {
      query: "USDC",
      network: "all",
      page: 1,
    });
    await check("edge-defi-empty-result", "search_defi_pools", {
      query: "dataline-no-match-9f57c130",
      network: "base",
      page: 1,
    });
    await check("edge-lending-variable-detailed", "find_variable_rate_lending_markets", {
      protocol: "morpho_blue",
      sort: "utilization",
      order: "asc",
      limit: 1,
      offset: 1,
      detail_level: "detailed",
    });
    await check("edge-lending-vault-v1", "find_lending_vaults", {
      version: "V1",
      sort: "netApy",
      order: "desc",
      limit: 1,
      detail_level: "detailed",
    });
    await check("edge-lending-fixed-detailed", "find_fixed_rate_lending_markets", {
      sort: "maturity",
      order: "asc",
      limit: 1,
      detail_level: "detailed",
    });
    await check("edge-lending-positions-filtered", "get_lending_positions", {
      wallet_address: TEST_WALLET,
      protocol: "aave_v3",
      position_type: "Supply",
      positions_per_product: 1,
      detail_level: "detailed",
    });
    await dependentCheck(
      "edge-lending-variable-history-one-point",
      variableMarketId,
      "variable market search returned no market_id",
      "get_lending_history",
      {
        product_type: "variable_rate_market",
        identifier: variableMarketId,
        metric: "utilization",
        interval: "hour",
        points_limit: 1,
      },
    );
    await dependentCheck(
      "edge-lending-vault-history-one-point",
      vaultAddress,
      "vault search returned no vault_address",
      "get_lending_history",
      {
        product_type: "vault",
        identifier: vaultAddress,
        vault_version: vaultVersion,
        metric: "sharePrice",
        interval: "week",
        points_limit: 1,
      },
    );
    await dependentCheck(
      "edge-lending-orderbook-detailed-bid",
      fixedMarketId,
      "fixed market search returned no market_id",
      "get_fixed_rate_lending_orderbook",
      { market_id: fixedMarketId, side: "bid", depth: 1, detail_level: "detailed" },
    );

    process.stdout.write("Expected local validation errors:\n");
    await expectError("invalid-cex-venue", "get_crypto_cex_price", {
      base: "BTC",
      venues: ["not-a-venue"],
    });
    await expectError("invalid-dex-address", "get_crypto_dex_price", {
      chain: "base",
      contract_address: "0x1234",
    });
    await expectError("invalid-ohlcv-interval", "get_crypto_ohlcv", {
      base: "BTC",
      interval: "2h",
    });
    await expectError("invalid-ohlcv-time-range", "get_crypto_ohlcv", {
      base: "BTC",
      start_time: "2026-08-11T12:00:00Z",
      end_time: "2026-08-10T12:00:00Z",
    });
    await expectError("invalid-perpetual-time-range", "get_perpetual_metrics_history", {
      metric: "funding_rate",
      base: "BTC",
      venue: "binance",
      start_time: "2026-08-11T12:00:00Z",
      end_time: "2026-08-10T12:00:00Z",
    });
    await expectError("empty-project-search", "search_crypto_projects", {});
    await expectError("invalid-announcement-time-range", "find_exchange_announcements", {
      start_time: "2026-08-11T12:00:00Z",
      end_time: "2026-08-10T12:00:00Z",
    });
    await expectError("missing-prediction-identifier", "get_prediction_event", {});
    await expectError("empty-defi-query", "search_defi_pools", { query: "" });
    await expectError("incompatible-lending-metric", "get_lending_history", {
      product_type: "vault",
      identifier: TEST_WALLET,
      metric: "supplyApy",
    });
    await expectError("invalid-orderbook-market-id", "get_fixed_rate_lending_orderbook", {
      market_id: "0x1234",
    });
  }
} finally {
  await client.close();
}

const passed = results.filter((result) => result.status === "PASS").length;
const failed = results.filter((result) => result.status === "FAIL").length;
const skipped = results.filter((result) => result.status === "SKIP").length;
const totalBytes = results.reduce((sum, result) => sum + (result.bytes ?? 0), 0);
process.stdout.write(
  `Summary: ${passed} passed, ${failed} failed, ${skipped} skipped, ${totalBytes} structured bytes\n`,
);

if (failed > 0) {
  process.exitCode = 1;
}

async function check(label, name, args) {
  const startedAt = performance.now();
  try {
    const result = await client.callTool({ name, arguments: args });
    const elapsedMs = Math.round(performance.now() - startedAt);
    if (result.isError) {
      const message = toolErrorMessage(result);
      record({ label, status: "FAIL", elapsedMs, message });
      return undefined;
    }

    const data = result.structuredContent;
    const bytes = Buffer.byteLength(JSON.stringify(data ?? {}));
    const warnings = Array.isArray(data?.warnings) ? data.warnings.length : 0;
    const errors = Array.isArray(data?.errors) ? data.errors.length : 0;
    const collections = collectionSummary(data);
    record({
      label,
      status: errors > 0 ? "FAIL" : "PASS",
      elapsedMs,
      bytes,
      warnings,
      errors,
      collections,
    });
    return data;
  } catch (error) {
    const elapsedMs = Math.round(performance.now() - startedAt);
    record({ label, status: "FAIL", elapsedMs, message: safeMessage(error) });
    return undefined;
  }
}

async function dependentCheck(label, dependency, reason, name, args) {
  if (!dependency) {
    record({ label, status: "SKIP", message: reason });
    return undefined;
  }
  return check(label, name, args);
}

async function expectError(label, name, args) {
  const startedAt = performance.now();
  try {
    const result = await client.callTool({ name, arguments: args });
    const elapsedMs = Math.round(performance.now() - startedAt);
    if (!result.isError) {
      record({ label, status: "FAIL", elapsedMs, message: "Expected a tool error." });
      return;
    }
    const error = toolErrorDetails(result);
    record({
      label,
      status: "PASS",
      elapsedMs,
      message: `rejected locally (${error.code ?? "schema_validation"})`,
    });
  } catch (error) {
    const elapsedMs = Math.round(performance.now() - startedAt);
    record({ label, status: "FAIL", elapsedMs, message: safeMessage(error) });
  }
}

function record(result) {
  results.push(result);
  const details = [
    result.elapsedMs === undefined ? undefined : `${result.elapsedMs}ms`,
    result.bytes === undefined ? undefined : `${result.bytes}B`,
    result.warnings ? `${result.warnings} warnings` : undefined,
    result.errors ? `${result.errors} errors` : undefined,
    result.collections,
    result.message,
  ].filter(Boolean);
  process.stdout.write(
    `${result.status.padEnd(4)} ${result.label}${details.length ? ` | ${details.join(" | ")}` : ""}\n`,
  );
}

function collectionSummary(data) {
  if (!data || typeof data !== "object") {
    return undefined;
  }
  const collections = Object.entries(data)
    .filter(([, value]) => Array.isArray(value))
    .map(([key, value]) => `${key}=${value.length}`);
  return collections.length > 0 ? collections.join(",") : undefined;
}

function toolErrorMessage(result) {
  const error = toolErrorDetails(result);
  return safeMessage(error.message ?? error.code ?? "Tool returned an unspecified error.");
}

function toolErrorDetails(result) {
  const text = result.content?.find((item) => item.type === "text")?.text;
  if (!text) {
    return {};
  }
  try {
    const parsed = JSON.parse(text);
    return parsed?.error && typeof parsed.error === "object" ? parsed.error : { message: text };
  } catch {
    return { message: text };
  }
}

function safeMessage(value) {
  const message = value instanceof Error ? value.message : String(value);
  return message.replace(/\s+/g, " ").slice(0, 300);
}

function firstString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
}
