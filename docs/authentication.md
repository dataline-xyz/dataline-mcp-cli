# Authentication and Payment

`DATALINE_AUTH_MODE` selects exactly one access adapter. The default is `oauth`; there is no
automatic fallback to another credential or to a paid request.

## OAuth

OAuth uses bearer access tokens with refresh-token rotation. The shared token manager refreshes an
access token 60 seconds before expiry, coalesces concurrent refreshes, persists rotated refresh
tokens, and retries one Data API request after an HTTP 401. A second 401 is returned to the caller.

Interactive login will use Authorization Code with PKCE. `dataline auth login` will open a browser
and temporarily listen on a loopback callback. Tokens will use the profile-aware private credential
file. MCP hosts do not need to remain blocked after login is complete, and the same login state will
be reusable by CLI commands.

OAuth requests send a bearer token to the Data API and omit `X-Dataline-Access-Mode`.
`DATALINE_ACCESS_TOKEN` is available as a development override until Control API discovery,
authorization, and token endpoint configuration is finalized. Environment access tokens cannot be
refreshed automatically.

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

The Data API challenge is the price authority. The client default of `0.001` USD is a safety
ceiling, not a client-side price: lower challenges are accepted and higher challenges are rejected.
The policy accepts only protocol v2, the `exact` scheme, the official USDC asset for the selected
Base network, and requests under the configured ceiling. Requests are bound to the configured HTTPS
Data API base URL and redirects are rejected.

Base Sepolia (`eip155:84532`) is the default. Base mainnet (`eip155:8453`) must be selected
explicitly:

```bash
DATALINE_AUTH_MODE=x402 \
DATALINE_X402_NETWORK=eip155:84532 \
DATALINE_X402_PRIVATE_KEY=0x... \
dataline mcp serve
```

One MCP tool call remains one logical Data API operation even though the x402 transport performs an
unpaid HTTP request followed by one paid retry.

The client flow is covered with protocol-level mock tests. Signed Base Sepolia end-to-end validation
remains pending until the Data API emits and settles x402 challenges.

## Secret Handling

- Never print access tokens, API keys, seed phrases, or private keys.
- Never include secrets in MCP tool results or errors.
- Never require secrets in a checked-in MCP JSON file.
- Environment variables are supported for automation, not recommended as the primary interactive
  credential store.
