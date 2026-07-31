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

x402 mode is reserved but intentionally fails closed in the current release. Once implemented, it
will require wallet configuration and requests will send:

```http
X-Dataline-Access-Mode: x402
```

The client then follows the standard HTTP flow:

1. Send the unpaid request.
2. Parse the Data API's HTTP 402 payment requirements.
3. Ask for approval when policy requires it.
4. Sign a supported requirement with the configured wallet.
5. Retry the request with the payment payload.
6. Persist the returned settlement receipt without logging private material.

The first supported network will be Base Sepolia, followed by Base mainnet after signed end-to-end
validation.

## Secret Handling

- Never print access tokens, API keys, seed phrases, or private keys.
- Never include secrets in MCP tool results or errors.
- Never require secrets in a checked-in MCP JSON file.
- Environment variables are supported for automation, not recommended as the primary interactive
  credential store.
