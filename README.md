# Dataline MCP

Read-only crypto, derivatives, project, announcement, prediction-market, and DeFi data for MCP
clients. The package also includes a small `dataline` CLI for running the server and inspecting
configuration.

## Requirements

- Node.js 20.19 or newer
- One of: a Dataline account, a Dataline API key, or a funded Base wallet

## Install

No global installation is required:

```bash
npx -y @dataline-xyz/mcp@latest --version
```

For a persistent CLI installation:

```bash
npm install --global @dataline-xyz/mcp
dataline --version
```

## MCP Client

Add the server to any client that supports local stdio MCP servers. OAuth is the default mode:

```json
{
  "mcpServers": {
    "dataline": {
      "command": "npx",
      "args": ["-y", "@dataline-xyz/mcp@latest", "mcp", "serve"]
    }
  }
}
```

Pin `@dataline-xyz/mcp` to an exact version instead of `latest` when reproducible installations are
required. Credentials stay in the local MCP process and are sent only to the configured Dataline
Data API.

## Authentication

Choose one authentication mode. Modes are explicit and never fall back to another credential or to a
paid request.

### OAuth

Sign in once. The browser returns to a temporary loopback callback, and the resulting session is
stored outside the repository in the platform config directory. The CLI and MCP server reuse the
same session and refresh it automatically:

```bash
npx -y @dataline-xyz/mcp@latest auth login
npx -y @dataline-xyz/mcp@latest auth status
```

Use `--no-open` to print the authorization URL instead of opening a browser. No environment
variables are required for the default production OAuth configuration.

### API Key

Create a Dataline API key, then store it in a named local profile without putting the secret in
process arguments or MCP JSON:

```bash
npx -y @dataline-xyz/mcp@latest profile set api-key --auth-mode api_key
npx -y @dataline-xyz/mcp@latest profile use api-key
printf '%s' "$DATALINE_API_KEY" | npx -y @dataline-xyz/mcp@latest auth set-api-key --stdin
npx -y @dataline-xyz/mcp@latest auth status
```

For non-interactive environments, inject the key through the MCP client's secret or environment
configuration:

```json
{
  "mcpServers": {
    "dataline": {
      "command": "npx",
      "args": ["-y", "@dataline-xyz/mcp@latest", "mcp", "serve"],
      "env": {
        "DATALINE_AUTH_MODE": "api_key",
        "DATALINE_API_KEY": "<your-api-key>"
      }
    }
  }
}
```

Do not commit a configuration file containing a real API key.

### x402

x402 pays each accepted Data API request with native USDC on Base mainnet. Prepare a dedicated EVM
wallet, fund it with a small USDC balance on Base, and provide its private key through the MCP
client's secret or environment configuration:

```json
{
  "mcpServers": {
    "dataline": {
      "command": "npx",
      "args": ["-y", "@dataline-xyz/mcp@latest", "mcp", "serve"],
      "env": {
        "DATALINE_AUTH_MODE": "x402",
        "DATALINE_X402_PRIVATE_KEY": "0x<private-key>",
        "DATALINE_X402_NETWORK": "eip155:8453",
        "DATALINE_X402_MAX_PAYMENT_USD": "0.001"
      }
    }
  }
}
```

`DATALINE_X402_MAX_PAYMENT_USD` is a per-request safety ceiling, not a fixed price. A challenge
above the ceiling is rejected before signing. x402 spends real funds; use a dedicated low-balance
wallet and never commit its private key or seed phrase.

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
configuration, prefer the local profile flow shown above.

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

Run `dataline --help` for CLI commands. See
[Development](https://github.com/dataline-xyz/dataline-mcp-cli/blob/main/docs/development.md),
[Architecture](https://github.com/dataline-xyz/dataline-mcp-cli/blob/main/docs/architecture.md),
[Authentication](https://github.com/dataline-xyz/dataline-mcp-cli/blob/main/docs/authentication.md),
and [Releasing](https://github.com/dataline-xyz/dataline-mcp-cli/blob/main/docs/releasing.md) for
contributor documentation.

## Development

```bash
npm install
npm run check
npm run inspect
```

## Security

Report vulnerabilities privately as described in the
[security policy](https://github.com/dataline-xyz/dataline-mcp-cli/blob/main/SECURITY.md).

## License

Licensed under the Apache License 2.0. See [LICENSE](LICENSE).
