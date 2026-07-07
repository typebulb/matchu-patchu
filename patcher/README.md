# matchu-patchu

**The unified-diff patcher that's tolerant of form, strict about intent.** Repairs sloppy AI-generated diffs — fuzzy-matched anchors, mangled headers, whitespace drift — when the intent is unambiguous, and fails atomically with a precise, typed error when it isn't. A pure, zero-dependency TypeScript library with a thin CLI, plus a companion [MCP server](https://www.npmjs.com/package/matchu-patchu-mcp) for Claude Code and other MCP clients — built for a world where LLMs write the diffs and the diffs are almost right.

This README doubles as the agent skill: `npx matchu-patchu skill` prints it wrapped in Agent Skills (SKILL.md) frontmatter.

## CLI

Pipe a unified diff to stdin, name the target file:

```bash
npx matchu-patchu path/to/file.ts <<'DIFF'
--- a/file.ts
+++ b/file.ts
@@ any description you like — line numbers are optional @@
 const a = 1;
-const b = 2;
+const b = 42;
 const c = 3;
DIFF
```

- `--dry-run` prints the patched result to stdout instead of writing the file.
- stderr reports a summary — `2 edit(s)`, plus `fuzz=N` when fuzzy matching was needed and `errors=N` on failures.
- Failed hunks print structured YAML to stderr describing the exact failed chunk with a suggested fix.
- Exit code is 1 only when nothing applied and there were errors.

### What it tolerates (by design)

- **Line numbers are optional** — hunks anchor by context lines, and line numbers are nearly always ignored (when present, they serve only as a rare tiebreaker between equally plausible anchor sites). Never count lines; give each hunk 1–3 unambiguous context lines instead.
- **Bare, descriptive `@@` headers** — `@@ remove unused imports @@` is encouraged.
- Optional git `a/`/`b/` prefixes; loose file headers (in single-file CLI mode the file you name is patched, whatever the headers say).
- Missing line prefixes, doubled markers, surrounding code fences, decorative markers — all sanitized away.
- Whitespace drift, Unicode homoglyphs, invisible characters — matched through escalating fuzz passes.
- **Atomic** — all hunks apply or none do. Duplicate hunks dedupe silently.

### What it refuses (by design)

- **Raw control characters in inserted lines** (a NUL, a stray ESC — C0 controls other than tab/newline/form feed) are rejected loudly by default, naming the offending code points: they're transport damage, not content, and writing them corrupts the target for much of the toolchain. Opt out per call with the `controlChars` policy (`'error'` | `'warn'` | `'ignore'`; `'warn'` applies and sets `ControlCharsSuspected`). Delete/context lines are never policed — deleting an already-damaged line stays possible.
- **Truncated diffs**: a final hunk that ends mid-change-run with its header promising more than the body delivered looks like a token cutoff. The default (`truncation: 'warn'`) applies and sets `TruncationSuspected`; raw-text channels can opt into `'error'`.

### Fuzz scores

Fuzz is the accumulated looseness cost across matched lines: 0 (unreported) means every hunk matched exactly; ~1/line means trailing-whitespace differences; ~100/line means an indentation-insensitive match; 200+/line means Unicode normalization (homoglyphs, invisibles) was needed. High fuzz means the patch applied, but the anchors were shaky — worth a glance at the result.

### When to use (vs. exact string replacement)

- Many small edits to one file — one call instead of a sequence of exact-match edits.
- Whitespace or invisible-character trouble with exact-match editing.
- Large deletions or insertions, expressed naturally as `-`/`+` lines.

A single trivial replacement is still fine with an exact-match edit tool.

## Library

Pure string-in/string-out — no Node APIs, no dependencies; runs in browsers and edge runtimes.

```ts
import { Patcher, PatchInputFile } from 'matchu-patchu';

const result = Patcher.Apply(diff, [new PatchInputFile('src/app.ts', content)]);
const file = result.Files[0];

file.OutputFullText;  // the patched content
file.Edits;           // applied edits (line index, deleted/inserted lines, per-edit fuzz)
file.Fuzz;            // accumulated fuzz cost (0 = all exact)
file.Errors;          // failures, each with a .SuggestedFixYaml
```

Multi-file patches: pass one `PatchInputFile` per file; hunks are routed by the diff's file headers. An empty key (`''`) opts into single-file fallback matching, where headers are matched loosely.

## MCP server

The companion `matchu-patchu-mcp` package exposes a `patch` tool (`filePath`, `diff`, `dryRun`) over stdio:

```bash
claude mcp add --scope user patcher -- npx -y matchu-patchu-mcp@latest
```

## Skill

`npx matchu-patchu skill` prints this README wrapped in SKILL.md frontmatter (name, description, version stamp) to stdout — redirect it wherever your harness loads skills from:

```bash
npx matchu-patchu skill > .claude/skills/matchu-patchu/SKILL.md
```

The command only ever prints; it never installs anything. Both skill sources — `description.md` (the frontmatter blurb) and this README — ship in the npm package, so a harness that's skittish about running unfamiliar commands can simply read them from `node_modules/matchu-patchu/` instead.

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
