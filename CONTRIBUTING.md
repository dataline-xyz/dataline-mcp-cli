# Contributing

Thanks for helping improve Dataline.

## Workflow

1. Create a focused branch from `main`.
2. Keep changes within one feature or infrastructure concern.
3. Add or update tests for behavior and public schemas.
4. Run `npm run check`.
5. Explain contract changes and migration impact in the pull request.

Please discuss new tool families before implementing them. A smaller, clear tool surface is
preferred to many overlapping tools.

## Code Style

- Use TypeScript strict mode.
- Keep MCP and CLI handlers thin.
- Send stdio server diagnostics to stderr only.
- Do not commit generated `dist/`, credentials, wallet material, or `.env` files.
- Keep upstream response shaping compact and preserve meaningful warnings and errors.
