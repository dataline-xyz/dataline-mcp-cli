# Releasing

`@dataline-xyz/mcp` is a public package in the npm `dataline-xyz` scope. The npm organization is
separate from the `dataline-xyz` GitHub organization: the publishing account must belong to both
places with the required permissions.

## First npm Release

npm requires a package to exist before a trusted publisher can be configured, so bootstrap the first
version from a maintainer workstation.

1. Make the GitHub repository public and ensure the intended commit is on `main`.
2. Create or join the `dataline` npm organization with publish access and enable 2FA on the npm
   account.
3. Authenticate the local npm CLI:

```bash
npm login
npm whoami
```

4. From the repository root, verify exactly what will be published:

```bash
npm ci
npm run check
npm publish --access public --dry-run
git status --short
```

5. Publish the immutable version:

```bash
npm publish --access public
```

6. Verify the registry package and a clean install:

```bash
npm view @dataline-xyz/mcp@0.1.0 version dist.integrity repository.url
npx --yes --package @dataline-xyz/mcp@0.1.0 dataline --version
npx --yes --package @dataline-xyz/mcp@0.1.0 dataline config show
```

7. Tag the exact published commit only after verification:

```bash
git tag -a v0.1.0 -m "v0.1.0"
git push origin v0.1.0
```

Do not publish a GitHub Release for this manually published version. The current `release.yml`
workflow listens for published GitHub Releases and would attempt to publish the same immutable npm
version again. A Git tag alone does not trigger that workflow.

The first workstation release will not have npm provenance. Do not add a long-lived npm token to
GitHub just to bootstrap it.

## Later Manual Releases

For each release, update these files to the same SemVer version:

- `package.json`
- `package-lock.json`
- `server.json`
- `CHANGELOG.md`

Run `npm run check`, commit the release metadata, then repeat the publish, verification, and tagging
steps with the new version. npm versions are immutable; fix a bad release with a new version rather
than trying to overwrite it.

## Enable Trusted Publishing Later

After the first package exists, configure its npm Trusted Publisher with:

- provider: GitHub Actions
- organization or user: `dataline-xyz`
- repository: `dataline-mcp-cli`
- workflow filename: `release.yml`
- environment: empty unless a GitHub deployment environment is added
- allowed action: `npm publish`

The workflow already uses a GitHub-hosted runner, grants `id-token: write`, and installs an npm
version that supports OIDC. Once the trusted publisher is configured, a GitHub Release named
`v<package-version>` runs the full checks, publishes npm with automatic provenance, and publishes
`server.json` to the MCP Registry. For an automated release, do not publish that npm version
manually first.
