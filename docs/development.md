# Development

## Commands

```bash
npm install            # install the locked dependency graph
npm run dev -- --help  # run the TypeScript CLI directly
npm run test           # unit and in-memory protocol tests
npm run build          # emit ESM JavaScript and declarations
npm run smoke:mcp      # launch the built stdio process and ping it
npm run check          # complete local/CI verification
npm run inspect        # open the official MCP Inspector
```

## Adding a Feature

Create `src/features/<feature>/` only when implementing the first operation in that domain. A normal
slice contains:

- `schema.ts`: public inputs, outputs, enums, and compact result types;
- `service.ts`: use-case logic and Data API mapping;
- `register.ts`: thin MCP registration;
- `cli.ts`: thin CLI registration when a direct command is useful.

Tests should cover the service contract and MCP descriptor. When a Data API contract changes, update
types, result shaping, examples, and tests in the same change.

## Public Repository Checks

Before opening a pull request:

1. Run `npm run check`.
2. Review `npm pack --dry-run`; source, tests, local env files, and credentials must not enter the
   tarball.
3. Run the MCP Inspector for descriptor or transport changes.
4. Add an entry under `Unreleased` in `CHANGELOG.md` for user-visible changes.

## Versioning

The npm package follows SemVer. Removing or renaming a tool, changing parameter meaning, tightening
accepted values, or changing an output field type is a breaking contract change. Additive optional
fields and new tools are normally minor changes.

## Releasing

The first npm release is published manually because npm requires a package to exist before a trusted
publisher can be configured. Later releases can use the existing GitHub OIDC workflow. Follow
[Releasing](releasing.md) for the exact checklist and the first-release boundary.

## Dependency Note

The MCP SDK currently depends on `@hono/node-server` 1.x even for stdio-only packages. That line has
a Windows static-file path traversal advisory. This project overrides it to the patched 2.0.10
release; the stdio runtime does not use Hono, and protocol/build tests guard the installed graph.
Remove the override after the MCP SDK adopts the patched dependency directly.
