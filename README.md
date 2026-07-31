# Dataline MCP

Read-only crypto, derivatives, project, announcement, prediction-market, and DeFi data for MCP
clients. The package also includes a small `dataline` CLI for running the server and inspecting
configuration.

## Requirements

- Node.js 20 or newer
- Dataline credentials for the selected authentication mode

## Quick Start

Add this server to any client that supports local stdio MCP servers:

```json
{
  "mcpServers": {
    "dataline": {
      "command": "npx",
      "args": ["-y", "@dataline/mcp", "mcp", "serve"],
      "env": {
        "DATALINE_AUTH_MODE": "api_key",
        "DATALINE_API_KEY": "YOUR_API_KEY"
      }
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
| `DATALINE_PROFILE`              | active profile                  | Named local profile              |
| `DATALINE_CONFIG_HOME`          | platform config directory       | Override local profile storage   |
| `DATALINE_DATA_API_URL`         | `https://data-api.dataline.xyz` | Data API origin                  |
| `DATALINE_REQUEST_TIMEOUT_MS`   | `30000`                         | Upstream timeout in milliseconds |
| `DATALINE_X402_PRIVATE_KEY`     | none                            | x402 wallet private key          |
| `DATALINE_X402_NETWORK`         | `eip155:84532`                  | Base Sepolia or Base mainnet     |
| `DATALINE_X402_MAX_PAYMENT_USD` | `0.001`                         | Maximum payment per request      |

Environment variables override profile settings and credentials. To keep an API key out of MCP
configuration, create a local profile and import the key through stdin:

```bash
dataline profile set work --auth-mode api_key
dataline profile use work
printf '%s' "$DATALINE_API_KEY" | dataline auth set-api-key --stdin
dataline auth status
```

The client supports stored API keys, development OAuth tokens, and x402 exact-USDC payments on Base.
Interactive OAuth login and live Data API x402 settlement still depend on the corresponding backend
endpoints. Authentication modes are explicit and never fall back silently.

## Tools

- Crypto: CEX prices, DEX token prices, and OHLCV candles
- Perpetuals: current metrics and funding/open-interest history
- Discovery: crypto projects and exchange announcements
- Prediction markets: Polymarket event search and detail
- DeFi: Base pool ranking and cross-network pool search

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
