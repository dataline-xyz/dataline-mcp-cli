# Authentication and Payment

`DATALINE_AUTH_MODE` selects exactly one access adapter. The default is `oauth`; there is no
automatic fallback to another credential or to a paid request.

## OAuth

OAuth uses bearer access tokens with refresh-token rotation. The shared token manager refreshes an
access token 60 seconds before expiry, coalesces concurrent refreshes, persists rotated refresh
tokens, and retries one Data API request after an HTTP 401. A second 401 is returned to the caller.

Interactive login uses Authorization Code with S256 PKCE:

```bash
dataline auth login
```

The command discovers authorization-server metadata, dynamically registers a public client for an
exact `http://127.0.0.1:<port>/callback` redirect, prints the authorization URL, opens a browser,
and waits up to five minutes for the callback. Use `--no-open` in a headless shell. Only the login
command waits for a callback; MCP startup never opens a browser.

The callback requires one matching `state` and one authorization code. The code, PKCE verifier,
access token, and refresh token are never printed. The token set and its public client/resource
binding are written to the profile-aware private credential file. The CLI and MCP server then reuse
the same session.

For a non-production environment, keep issuer, Data API URL, and OAuth resource aligned:

```bash
dataline profile set test \
  --auth-mode oauth \
  --data-api-url https://data-api.t.example.com \
  --oauth-issuer https://control-api.t.example.com \
  --oauth-resource https://data-api.t.example.com
dataline profile use test
dataline auth login
```

The default scope is `data.*.read`. Override it with `--oauth-scope` on `profile set` or
`DATALINE_OAUTH_SCOPE`. The authorization server remains the scope authority; user tier and route
entitlements are evaluated by Dataline services rather than encoded as OAuth scopes.

OAuth requests send a bearer token to the Data API and omit `X-Dataline-Access-Mode`.
`DATALINE_ACCESS_TOKEN` remains available as a development override. Environment access tokens
cannot be refreshed automatically.

## API Key

API key mode reads from `DATALINE_API_KEY` first, then from the active local profile. Import a key
without putting it in process arguments:

```bash
dataline profile set work --auth-mode api_key
dataline profile use work
printf '%s' "$DATALINE_API_KEY" | dataline auth set-api-key --stdin
```

Requests send `X-Dataline-Key` and omit `X-Dataline-Access-Mode`.

## Profiles

Profiles keep non-secret runtime settings separate from credentials. `DATALINE_PROFILE` selects a
profile for one process; otherwise the active profile is used. Environment variables override both.
OAuth issuer, scope, and resource are non-secret profile settings. OAuth client binding and tokens
stay together in the private credential file so refresh rotation cannot accidentally switch clients
or resources.

By default, files live under the platform config directory in `dataline/profiles.json` and
`dataline/credentials.json`. `DATALINE_CONFIG_HOME` overrides this directory. Directories are
written with mode `0700` and files with mode `0600`. Private keys are never persisted in these
files.

## x402

x402 mode uses the official `@x402/fetch` and `@x402/evm` clients. It requires an EVM private key in
`DATALINE_X402_PRIVATE_KEY`; wallet keys are never stored in a Dataline profile. Requests send:

```http
X-Dataline-Access-Mode: x402
```

The client follows the standard HTTP flow:

1. Send the unpaid request.
2. Parse the Data API's HTTP 402 payment requirements.
3. Apply local payment policy before signing.
4. Sign an allowed requirement with the configured wallet.
5. Retry the same request with the payment payload.

Control API owns route prices and Data API translates the current route price into an x402
challenge. The client default of `0.001` USD is a safety ceiling, not a client-side price: lower
challenges are accepted and higher challenges are rejected. The policy accepts only protocol v2, the
`exact` scheme, the official USDC asset for the selected Base network, and requests under the
configured ceiling. Requests are bound to the configured HTTPS Data API base URL and redirects are
rejected.

Base mainnet (`eip155:8453`) is the default for local, test, and production deployments. Payments
spend real USDC, so fund a dedicated low-balance wallet and keep the per-request ceiling small:

```bash
DATALINE_AUTH_MODE=x402 \
DATALINE_X402_PRIVATE_KEY=0x... \
dataline mcp serve
```

One MCP tool call remains one logical Data API operation even though the x402 transport performs an
unpaid HTTP request followed by one paid retry.

The protocol-level tests cover challenge selection, signing, paid retry, request-ID preservation,
origin restrictions, and payment ceilings. A live mainnet smoke test must use a deliberately funded
wallet and the lowest available route price.

## Secret Handling

- Never print access tokens, API keys, seed phrases, or private keys.
- Never include secrets in MCP tool results or errors.
- Never require secrets in a checked-in MCP JSON file.
- Environment variables are supported for automation, not recommended as the primary interactive
  credential store.
