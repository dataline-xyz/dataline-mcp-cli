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

| Variable                | Default                         | Purpose                                             |
| ----------------------- | ------------------------------- | --------------------------------------------------- |
| `DATALINE_AUTH_MODE`    | `oauth`                         | Explicit access mode: `oauth`, `api_key`, or `x402` |
| `DATALINE_DATA_API_URL` | `https://data-api.dataline.xyz` | Dataline Data API origin                            |

The client never silently falls back between access modes. OAuth tokens, API keys, and wallet
material will live in a profile-aware credential store and must not be embedded in MCP configuration
JSON.

The request behavior is intentionally simple:

| Access mode | Data API request                                                  |
| ----------- | ----------------------------------------------------------------- |
| `oauth`     | Bearer access token; no access-mode header                        |
| `api_key`   | `X-Dataline-Key`; no access-mode header                           |
| `x402`      | `X-Dataline-Access-Mode: x402` plus HTTP 402 challenge/sign/retry |

## Architecture

```text
MCP tools ----\
               > feature services -> Data API client -> auth/payment adapter
CLI commands -/
```

Feature code will be grouped by domain under `src/features/<feature>/`. MCP registration and CLI
presentation stay thin; validation, upstream calls, and result shaping live in shared feature
services.

See [Architecture](docs/architecture.md), [Authentication](docs/authentication.md), and
[Development](docs/development.md) for the maintained design notes.

## Project Status

- [x] Data API opt-in x402 access mode
- [x] Public TypeScript package foundation
- [x] CLI and stdio MCP entry points
- [x] Protocol smoke test and CI
- [ ] Shared credential profiles and OAuth login
- [ ] API key and x402 HTTP clients
- [ ] Query tool and CLI command slices
- [ ] Signed Base Sepolia end-to-end payment test

Every paid MCP tool will map to one logical Data API operation. In x402 mode, the HTTP client may
perform the protocol-defined unpaid challenge followed by one signed retry, but provider and
business logic must execute at most once.

## Security

Do not report vulnerabilities in public issues. See [SECURITY.md](SECURITY.md).

## License

Licensed under the Apache License 2.0. See [LICENSE](LICENSE).
