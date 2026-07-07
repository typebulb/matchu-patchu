# matchu-patchu

**The unified-diff patcher that's tolerant of form, strict about intent.** Repairs sloppy AI-generated diffs — fuzzy-matched anchors, mangled headers, whitespace drift — when the intent is unambiguous, and fails atomically with a precise, typed error when it isn't.

Two packages in this workspace:

| Package | What | Docs |
|---|---|---|
| [`matchu-patchu`](patcher/) | Pure, zero-dependency TypeScript library + `npx matchu-patchu` CLI + agent skill | [README](patcher/README.md) |
| [`matchu-patchu-mcp`](patcher-mcp/) | MCP server exposing the patcher as a `patch` tool | [README](patcher-mcp/README.md) |

The [patcher README](patcher/README.md) is the single source of truth for usage — CLI, library API, MCP setup, and what the patcher tolerates by design.

## Development

```bash
pnpm install
pnpm build
pnpm test
```

Strictly test-first: every behavior change starts as a failing test. The core is a pure function from `(diff, input text)` to `(output text, edits, errors)` — no filesystem, no state — so every real-world failure replays as a two-string fixture, forever.

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
