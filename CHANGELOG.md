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
- CI, package-content validation, contribution guidance, architecture notes, and security reporting
  policy.
