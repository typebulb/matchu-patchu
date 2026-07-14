# matchu-patchu-mcp

An MCP (Model Context Protocol) server exposing [matchu-patchu](https://www.npmjs.com/package/matchu-patchu) — the unified-diff patcher that's tolerant of form, strict about intent — as a `patch` tool over stdio.

## Tool

`patch(filePath, diff, dryRun?)` — applies a unified diff to a file. Sloppy AI-generated diffs are repaired and applied atomically when the intent is unambiguous; ambiguous ones fail with a precise, typed error the calling model can act on in one step. `dryRun: true` reports what would change without writing.

## Setup

```bash
claude mcp add --scope user patcher -- npx -y matchu-patchu-mcp@latest
```

(`-y` skips npx's first-run install prompt, which would otherwise hang the server spawn; `@latest` re-resolves against the registry at each session start, so new sessions pick up updates automatically.)

**In a pnpm workspace, use pnpm's runner instead** — an npm bug ([npm/cli#4787](https://github.com/npm/cli/issues/4787)) makes `npx` crash there (see Troubleshooting):

```bash
claude mcp add --scope user patcher -- pnpm dlx matchu-patchu-mcp@latest
```

(Same auto-updates — `pnpm dlx` re-resolves `@latest` when its cache expires, at most daily.)

This works as-is on Windows — Claude Code spawns `npx` correctly there; no wrapper or global install needed.

Then restart Claude Code — MCP servers load at session startup, so the `patch` tool won't appear until a new session. The same applies to updates: a running session keeps serving the build it started with; a new version takes effect on the next session (or `/mcp` reconnect). To verify which build is serving, make any `patch` call (`dryRun: true` works) — every reply ends with a version + build-time tag.

Or in any MCP client configuration:

```json
{
  "mcpServers": {
    "patcher": { "command": "npx", "args": ["-y", "matchu-patchu-mcp@latest"] }
  }
}
```

See the [matchu-patchu README](https://www.npmjs.com/package/matchu-patchu) for what the patcher tolerates, fuzz scores, and when to prefer it over exact string replacement.

## Troubleshooting

**`npx matchu-patchu-mcp` crashes with `Cannot read properties of null (reading 'package')`** — this is an npm bug ([npm/cli#4787](https://github.com/npm/cli/issues/4787), unfixed as of npm 11), not a package bug: npx scans the *current project's* `node_modules` before downloading anything, and that scan crashes in some pnpm workspaces (e.g. links whose target lives inside the same project tree). The fix is the pnpm registration form from Setup — `pnpm dlx matchu-patchu-mcp@latest` — which never runs npm's scan and keeps auto-updates.

**Windows, MCP clients other than Claude Code** — some clients can't spawn `npx` directly on Windows (it's a `.cmd` shim, not an `.exe`). Claude Code handles this itself, so the Setup command above needs no change; for a client that doesn't, wrap it — this keeps `@latest` auto-updates:

```json
{
  "mcpServers": {
    "patcher": { "command": "cmd", "args": ["/c", "npx", "-y", "matchu-patchu-mcp@latest"] }
  }
}
```

(A global install also sidesteps this — `"command": "matchu-patchu-mcp"` works as-is — but pins the installed version; prefer the `cmd /c` wrapper.)

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
