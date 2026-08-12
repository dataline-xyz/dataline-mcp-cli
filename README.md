# Dataline MCP

Read-only crypto, derivatives, project, announcement, prediction-market, and DeFi data for MCP
clients. The package also includes a small `dataline` CLI for running the server and inspecting
configuration.

## Requirements

- Node.js 20.19 or newer
- Dataline credentials for the selected authentication mode

## Quick Start

Sign in once. The browser returns to a temporary loopback callback, and the resulting session is
stored outside the repository in the platform config directory:

```bash
npx -y @dataline/mcp auth login
```

Add this server to any client that supports local stdio MCP servers:

```json
{
  "mcpServers": {
    "dataline": {
      "command": "npx",
      "args": ["-y", "@dataline/mcp", "mcp", "serve"]
    }
  }
}
```

Credentials stay in the local MCP process and are sent only to the configured Dataline Data API.

## Configuration

| Variable                        | Default                         | Description                      |
| ------------------------------- | ------------------------------- | -------------------------------- |
| `DATALINE_AUTH_MODE`            | `oauth`                         | `oauth`, `api_key`, or `x402`    |
| `DATALINE_API_KEY`              | none                            | Required for `api_key` mode      |
| `DATALINE_ACCESS_TOKEN`         | none                            | Development token for OAuth mode |
| `DATALINE_OAUTH_ISSUER`         | Control API production issuer   | OAuth authorization server       |
| `DATALINE_OAUTH_SCOPE`          | `data.*.read`                   | Space-delimited OAuth scopes     |
| `DATALINE_OAUTH_RESOURCE`       | Data API URL                    | OAuth resource binding           |
| `DATALINE_PROFILE`              | active profile                  | Named local profile              |
| `DATALINE_CONFIG_HOME`          | platform config directory       | Override local profile storage   |
| `DATALINE_DATA_API_URL`         | `https://data-api.dataline.xyz` | Data API origin                  |
| `DATALINE_CONTROL_API_URL`      | inferred from Data API URL      | Pricing catalog origin           |
| `DATALINE_REQUEST_TIMEOUT_MS`   | `30000`                         | Upstream timeout in milliseconds |
| `DATALINE_X402_PRIVATE_KEY`     | none                            | x402 wallet private key          |
| `DATALINE_X402_NETWORK`         | `eip155:8453`                   | Base network in CAIP-2 format    |
| `DATALINE_X402_MAX_PAYMENT_USD` | `0.001`                         | Maximum payment per request      |

Environment variables override profile settings and credentials. To keep an API key out of MCP
configuration, create a local profile and import the key through stdin:

```bash
dataline profile set work --auth-mode api_key
dataline profile use work
printf '%s' "$DATALINE_API_KEY" | dataline auth set-api-key --stdin
dataline auth status
```

The client supports browser-based OAuth with PKCE and refresh-token rotation, stored API keys,
development OAuth tokens, and x402 exact-USDC payments on Base. Authentication modes are explicit
and never fall back silently.

x402 defaults to Base mainnet and spends real USDC. Its `0.001` USD default is a per-request safety
ceiling, not a fixed client-side price; Data API challenges above it are rejected before signing.

Inspect current costs without making a paid Data API request:

```bash
dataline pricing
dataline pricing get_crypto_cex_price get_lending_history
```

Agents can call the free `get_tool_pricing` MCP tool. It reports credit costs, x402 USD prices, and
the parameter condition for tools that select between multiple metered routes. Pricing is read from
Control API and cached for five minutes. Standard Dataline test and production subdomains are
inferred from `DATALINE_DATA_API_URL`; custom deployments can set `DATALINE_CONTROL_API_URL`.

## Tools

- Crypto: CEX prices, DEX token prices, and OHLCV candles
- Perpetuals: current metrics and funding/open-interest history
- Discovery: crypto projects and exchange announcements
- Prediction markets: Polymarket event search and detail
- DeFi: Base pool ranking and cross-network pool search
- Lending: Morpho Blue and Aave V3 variable-rate markets, Morpho vaults and fixed-rate markets,
  history, orderbooks, detail, and public wallet positions
- Pricing: current credit and x402 costs for every MCP tool

Run `dataline --help` for CLI commands. See [Development](docs/development.md),
[Architecture](docs/architecture.md), and [Authentication](docs/authentication.md) for contributor
documentation.

## Development

```bash
npm install
npm run check
npm run inspect
```

## Security

Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

## License

Licensed under the Apache License 2.0. See [LICENSE](LICENSE).
