# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Public TypeScript package foundation for the combined Dataline CLI and local stdio MCP server.
- Explicit `oauth`, `api_key`, and `x402` runtime mode configuration.
- In-memory and process-level MCP protocol smoke tests.
- Typed Data API fetch client with explicit credential injection, bounded responses, timeout
  handling, repeated query parameters, partial-result warnings, and compact structured errors.
- Development OAuth-token and API-key environment adapters with fail-closed mode selection.
- Read-only CEX price, DEX contract-price, and OHLCV MCP tools with explicit input/output schemas,
  compact structured results, chain alias normalization, and liquidity/volume/change warnings.
- Read-only perpetual snapshot and combined funding-rate/open-interest history tools with compact
  row-oriented series, explicit venue/interval enums, availability warnings, and actionable errors
  for unsupported metric and venue combinations.
- Read-only crypto project and exchange announcement search/detail tools with explicit source and
  category enums, bounded detail fields, compact list records, and agent-correctable input errors.
- Read-only Polymarket event search/detail tools with explicit category and sort enums, integer
  event IDs, slug-first lookup, and local child-market sorting/paging over one Data API response.
- Read-only DeFi pool list/search tools with current Base DEX and sort enums, compact pool records,
  explicit cross-network search semantics, and page continuation hints.
- CI, package-content validation, contribution guidance, architecture notes, and security reporting
  policy.
- MCP Registry metadata and npm trusted-publishing release automation.
