# Architecture

## Product Boundary

This package is a local process launched by an MCP host. It also exposes a human-facing CLI. It is
not the remote ChatGPT MCP and does not contain ChatGPT-specific UI resources.

The two surfaces share feature services:

```text
src/cli/                 command parsing and presentation
src/mcp/                 MCP descriptors and stdio transport
src/features/<feature>/  validation, use cases, compact public results
src/data-api/             typed upstream HTTP client
src/auth/                 OAuth, API key, and x402 adapters
src/config/               environment and profile resolution
```

Directories are added when their first real implementation lands. The project does not keep
placeholder modules merely to advertise a future design.

## Dependency Direction

Transport and presentation code depend on feature services. Feature services depend on a small Data
API client interface. Authentication and payment are selected when the HTTP client is built; feature
code does not branch on auth mode.

```text
CLI ---------\
              -> feature service -> Data API client -> access adapter
MCP stdio ---/
```

This gives each operation one implementation and prevents MCP tools from shelling out to the CLI or
CLI commands from simulating MCP calls.

## Tool Contract Rules

1. Tools are read-only and idempotent.
2. One tool call maps to one logical Data API operation.
3. Search/list results stay compact; detail tools return richer records.
4. Schema enums, nullability, and timestamps are verified against deployed OpenAPI plus
   representative live responses.
5. Hard upstream business errors become MCP errors before a paid request can be considered
   successful.
6. Tool descriptors and CLI help are generated from the same feature schema wherever practical.

## x402 Boundary

The Data API is the x402 resource server. The local client receives an HTTP 402 challenge, signs the
selected payment requirement, and retries the same request. The MCP transport itself is not
paywalled.

This differs from `@x402/mcp`, which protects a tool at the MCP protocol layer. For Dataline, the
future HTTP adapter will use the official x402 fetch client because pricing and settlement belong to
the Data API route being called.

## SDK Version

The project uses the production MCP TypeScript SDK v1 line. SDK v2 is still a pre-release as of the
initial scaffold and should be adopted through an explicit migration after its protocol version
stabilizes.
