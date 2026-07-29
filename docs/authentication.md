# Authentication and Payment

`DATALINE_AUTH_MODE` selects exactly one access adapter. The default is `oauth`; there is no
automatic fallback to another credential or to a paid request.

## OAuth

OAuth will use Authorization Code with PKCE. `dataline auth login` will open a browser and
temporarily listen on a loopback callback. Tokens will be stored in an operating-system-backed,
profile-aware credential store and refreshed by the shared HTTP client. MCP hosts do not need to
remain blocked after login is complete, and the same login state will be reusable by CLI commands.

OAuth requests send a bearer token to the Data API and omit `X-Dataline-Access-Mode`.
`DATALINE_ACCESS_TOKEN` is available as a development override until profile login lands.

## API Key

API key mode currently reads `DATALINE_API_KEY`. It will also read from the active credential
profile when profile storage lands. Requests send `X-Dataline-Key` and omit
`X-Dataline-Access-Mode`.

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
