# Dataline MCP

Read-only crypto, derivatives, project, announcement, prediction-market, and DeFi data for MCP
clients. The package also includes a small `dataline` CLI for running the server and inspecting
configuration.

## Requirements

- Node.js 20 or newer
- A Dataline API key

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

| Variable                      | Default                         | Description                      |
| ----------------------------- | ------------------------------- | -------------------------------- |
| `DATALINE_AUTH_MODE`          | `oauth`                         | `oauth`, `api_key`, or `x402`    |
| `DATALINE_API_KEY`            | none                            | Required for `api_key` mode      |
| `DATALINE_ACCESS_TOKEN`       | none                            | Development token for OAuth mode |
| `DATALINE_DATA_API_URL`       | `https://data-api.dataline.xyz` | Data API origin                  |
| `DATALINE_REQUEST_TIMEOUT_MS` | `30000`                         | Upstream timeout in milliseconds |

The current release supports API keys and development OAuth tokens. Interactive OAuth login and x402
payment are not yet available. Authentication modes are explicit and never fall back silently.

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
