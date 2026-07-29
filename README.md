# Dataline MCP + CLI

Local market-data tools for AI agents and humans, distributed as one npm package.

`dataline` has two interfaces backed by the same application code:

- a stdio MCP server for clients such as Codex, Claude Code, and Claude Desktop;
- a CLI for authentication, diagnostics, and direct data queries.

> [!IMPORTANT] This repository is in its foundation phase. The MCP transport and CLI shell are
> runnable, while authentication and market-data tools are being ported in deliberate slices. The
> remote, ChatGPT-specific MCP and its UI widgets remain in a separate repository.

## Requirements

- Node.js 20 or newer
- npm 10 or newer

## Development

```bash
npm install
npm run check
npm run dev -- --help
```

Start the local MCP server over stdio:

```bash
npm run dev -- mcp serve
```

Inspect the built server:

```bash
npm run inspect
```

The server writes MCP messages to stdout. Runtime diagnostics must go to stderr so they cannot
corrupt the stdio protocol.

## MCP Client Configuration

The eventual public package will be configured like this:

```json
{
  "mcpServers": {
    "dataline": {
      "command": "npx",
      "args": ["-y", "@dataline/mcp", "mcp", "serve"],
      "env": {
        "DATALINE_AUTH_MODE": "oauth"
      }
    }
  }
}
```

For local development, replace the command with `node` and the arguments with the absolute path to
`dist/cli.js`, followed by `mcp` and `serve`.

## Configuration

| Variable                      | Default                         | Purpose                                             |
| ----------------------------- | ------------------------------- | --------------------------------------------------- |
| `DATALINE_AUTH_MODE`          | `oauth`                         | Explicit access mode: `oauth`, `api_key`, or `x402` |
| `DATALINE_DATA_API_URL`       | `https://data-api.dataline.xyz` | Dataline Data API origin                            |
| `DATALINE_REQUEST_TIMEOUT_MS` | `30000`                         | Upstream request timeout from 100 through 300000 ms |
| `DATALINE_ACCESS_TOKEN`       | none                            | Development OAuth bearer-token override             |
| `DATALINE_API_KEY`            | none                            | API key used when `DATALINE_AUTH_MODE=api_key`      |

The client never silently falls back between access modes. OAuth tokens, API keys, and wallet
material will live in a profile-aware credential store and must not be embedded in MCP configuration
JSON.

The request behavior is intentionally simple:

| Access mode | Data API request                                                  |
| ----------- | ----------------------------------------------------------------- |
| `oauth`     | Bearer access token; no access-mode header                        |
| `api_key`   | `X-Dataline-Key`; no access-mode header                           |
| `x402`      | Planned: `X-Dataline-Access-Mode: x402` plus challenge/sign/retry |

## Architecture

```text
MCP tools ----\
               > feature services -> Data API client -> auth/payment adapter
CLI commands -/
```

Feature code will be grouped by domain under `src/features/<feature>/`. MCP registration and CLI
presentation stay thin; validation, upstream calls, and result shaping live in shared feature
services.

## Available Tools

| Tool                            | Purpose                                                   |
| ------------------------------- | --------------------------------------------------------- |
| `get_crypto_cex_price`          | Current ticker price across centralized exchanges         |
| `get_crypto_dex_price`          | Current token price by chain and contract address         |
| `get_crypto_ohlcv`              | Historical candles from one venue                         |
| `get_perpetual_metrics`         | Current funding, open interest, price, basis, and volume  |
| `get_perpetual_metrics_history` | Funding-rate or open-interest history from a single venue |
| `search_crypto_projects`        | Resolve a symbol or project name to a project ID          |
| `get_crypto_project`            | Project fundamentals and metadata                         |
| `find_exchange_announcements`   | Search exchange announcements with structured filters     |
| `get_exchange_announcement`     | Full content for one exchange announcement                |

See [Architecture](docs/architecture.md), [Authentication](docs/authentication.md), and
[Development](docs/development.md) for the maintained design notes.

## Project Status

- [x] Data API opt-in x402 access mode
- [x] Public TypeScript package foundation
- [x] CLI and stdio MCP entry points
- [x] Protocol smoke test and CI
- [ ] Shared credential profiles and OAuth login
- [x] Typed Data API client and API key request adapter
- [ ] Profile-backed OAuth and x402 request adapters
- [x] Crypto price and OHLCV MCP tools
- [x] Perpetual snapshot and combined history MCP tools
- [x] Crypto project and exchange announcement search/detail MCP tools
- [ ] Remaining query tools and matching CLI commands
- [ ] Signed Base Sepolia end-to-end payment test

Every paid MCP tool will map to one logical Data API operation. In x402 mode, the HTTP client may
perform the protocol-defined unpaid challenge followed by one signed retry, but provider and
business logic must execute at most once.

## Security

Do not report vulnerabilities in public issues. See [SECURITY.md](SECURITY.md).

## License

Licensed under the Apache License 2.0. See [LICENSE](LICENSE).
