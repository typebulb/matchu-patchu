#!/usr/bin/env node
import { existsSync, readFileSync, statSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Patcher, PatchError, PatchInputFile, PatchParserException } from 'matchu-patchu';
import { z } from 'zod';

const PkgVersion = (() => {
  try {
    const self = fileURLToPath(import.meta.url);
    return JSON.parse(readFileSync(join(dirname(self), '..', 'package.json'), 'utf-8')).version ?? '?';
  } catch {
    return '?';
  }
})();

// Every reply names the serving build: rebuilds don't respawn an already-running server
// process, so a stale process silently serving old behavior stays visible to callers.
// The patcher dep is a live symlink, so its entry mtime counts too.
const BuildStamp = (() => {
  try {
    const self = fileURLToPath(import.meta.url);
    const patcherEntry = createRequire(import.meta.url).resolve('matchu-patchu');
    const built = new Date(Math.max(statSync(self).mtimeMs, statSync(patcherEntry).mtimeMs));
    const p = (n: number) => String(n).padStart(2, '0');
    const ts = `${built.getFullYear()}-${p(built.getMonth() + 1)}-${p(built.getDate())} ${p(built.getHours())}:${p(built.getMinutes())}:${p(built.getSeconds())}`;
    return `[matchu-patchu-mcp ${PkgVersion}, built ${ts}]`;
  } catch {
    return '[matchu-patchu-mcp build unknown]';
  }
})();

// First contact: an MCP client spawns this bin with no args and piped stdio, so any
// arg — or a TTY on stdin — means a person (or their agent) ran it directly, usually
// while trying to figure out how to install it. Print the critical setup facts and
// exit instead of silently waiting for a JSON-RPC handshake that will never come.
const argv = process.argv.slice(2);
if (argv.includes('--version') || argv.includes('-v')) {
  console.log(PkgVersion);
  process.exit(0);
}
if (argv.length > 0 || process.stdin.isTTY) {
  console.log(`matchu-patchu-mcp ${PkgVersion} — an MCP server speaking JSON-RPC over stdio, not an interactive CLI.
(Run with no arguments by an MCP client, it serves; it was waiting for a client handshake, not hanging.)

Register with Claude Code (copy exactly — each flag matters):

  claude mcp add --scope user patcher -- npx -y matchu-patchu-mcp@latest

  -y        skips npx's first-run install prompt, which would hang the server spawn
  @latest   re-resolves against the registry each session start, so updates arrive automatically

Any other MCP client, in its JSON config (complete document — the top-level key must be "mcpServers"):

  { "mcpServers": { "patcher": { "command": "npx", "args": ["-y", "matchu-patchu-mcp@latest"] } } }

  (For Claude Code project scope this JSON belongs in .mcp.json at the project ROOT.)

Then restart the session — MCP tools load at session startup — and verify:

  claude mcp list        # expect: patcher ... Connected

Tool exposed: patch(filePath, diff, dryRun?) — applies unified diffs; tolerant of form, strict about intent.
Docs: https://www.npmjs.com/package/matchu-patchu-mcp`);
  process.exit(0);
}

function patchFailureMessage(errors: PatchError[], note = ''): string {
  const parts = [`Patch failed with ${errors.length} error(s)${note}:`];
  for (const e of errors) parts.push('', e.toString());
  return parts.join('\n');
}

function applyCore(filePath: string, diff: string, dryRun: boolean): { ok: boolean; message: string; patched?: string } {
  if (!existsSync(filePath))
    return { ok: false, message: `Error: file not found: ${filePath}` };

  if (!diff.trim())
    return { ok: false, message: 'Error: patch is empty' };

  try {
    // Node keeps a UTF-8 BOM as a leading ﻿ in the string, so a BOM round-trips
    // through OutputFullText on its own (matching is BOM-tolerant via StripInvisibles).
    const content = readFileSync(filePath, 'utf-8');
    const result = Patcher.Apply(diff, [new PatchInputFile('', content)]);

    if (result.Files.length === 0)
      return { ok: false, message: 'Error: no files were processed in the diff' };

    const out = result.Files[0];

    // Aggregate across ALL entries: foreign hunk groups arrive as report entries
    // appended after the held file, and must not read as a clean apply.
    const errors = result.Files.flatMap(f => f.Errors);
    if (errors.length > 0) {
      const note = errors.some(e => e.Type === 'FileMismatch') ? ` (this tool patches only ${filePath})` : '';
      return { ok: false, message: patchFailureMessage(errors, note) };
    }

    // Zero edits is a no-op, not a normal success: say why, and don't touch the file
    // (a rewrite of identical content still churns mtime/watchers).
    if (out.Edits.length === 0)
      return {
        ok: true,
        message: out.AlreadyAppliedCount > 0
          ? `Applied 0 edit(s) to ${filePath}: the file already contains this change (${out.AlreadyAppliedCount} chunk(s) detected as already applied). File left unmodified.`
          : `Applied 0 edit(s) to ${filePath}: the patch parsed but produced no changes for this file. File left unmodified.`,
      };

    if (!dryRun)
      writeFileSync(filePath, out.OutputFullText);

    const fuzz = out.Fuzz > 0 ? ` (applied with fuzz factor ${out.Fuzz})` : '';
    return {
      ok: true,
      message: `Successfully applied ${out.Edits.length} edit(s) to ${filePath}${fuzz}.`,
      patched: dryRun ? out.OutputFullText : undefined,
    };
  } catch (ex) {
    if (ex instanceof PatchParserException)
      return { ok: false, message: `Error: failed to parse patch — ${ex.message}` };
    return { ok: false, message: `Error: ${ex instanceof Error ? ex.message : String(ex)}` };
  }
}

const server = new McpServer(
  { name: 'patcher', version: PkgVersion },
  {
    instructions:
      'Use this tool when you run into (or anticipate) whitespace or other issues with exact string replacement tools, or when you have many small edits that you want to apply efficiently to a file in one step.',
  },
);

server.tool(
  'patch',
  `Apply a unified diff to a file using context matching (line numbers in @@ headers are optional and nearly always ignored).
Accepts lenient diff formats: bare @@ headers, git a/b prefixes, decorated headers, missing line prefixes.
Matching is line-based: quote whole physical lines — a prose paragraph is often ONE long line.
Atomic: either all hunks apply or none do. Duplicate hunks are silently deduplicated.
Returns a success message, or an error message describing why the patch failed.`,
  {
    filePath: z.string().describe('Absolute path to the file to patch'),
    diff: z.string().describe('Unified diff content to apply'),
    dryRun: z.boolean().optional().default(false).describe('If true, return the patched content without writing to disk'),
  },
  async ({ filePath, diff, dryRun }) => {
    const { ok, message, patched } = applyCore(filePath, diff, dryRun);
    const text = [
      `${message} ${BuildStamp}`,
      ...(patched !== undefined ? ['', '--- patched output ---', patched] : []),
    ].join('\n');
    return {
      content: [{ type: 'text' as const, text }],
      ...(ok ? {} : { isError: true as const }),
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
