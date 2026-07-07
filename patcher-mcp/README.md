# matchu-patchu-mcp

An MCP (Model Context Protocol) server exposing [matchu-patchu](https://www.npmjs.com/package/matchu-patchu) — the unified-diff patcher that's tolerant of form, strict about intent — as a `patch` tool over stdio.

## Tool

`patch(filePath, diff, dryRun?)` — applies a unified diff to a file. Sloppy AI-generated diffs are repaired and applied atomically when the intent is unambiguous; ambiguous ones fail with a precise, typed error the calling model can act on in one step. `dryRun: true` reports what would change without writing.

## Setup

```bash
claude mcp add --scope user patcher -- npx matchu-patchu-mcp
```

Or in any MCP client configuration:

```json
{
  "mcpServers": {
    "patcher": { "command": "npx", "args": ["matchu-patchu-mcp"] }
  }
}
```

See the [matchu-patchu README](https://www.npmjs.com/package/matchu-patchu) for what the patcher tolerates, fuzz scores, and when to prefer it over exact string replacement.

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
