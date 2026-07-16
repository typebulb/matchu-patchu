#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { Patcher, PatchInputFile } from './index.js';

const args = process.argv.slice(2);

// --- skill emission ----------------------------------------------------------
// The README IS the skill body; description.md is the discovery blurb. `skill` composes
// frontmatter + freshness note + README to stdout and never writes anywhere — the agent
// persists it only if asked.

// The package root, where npm ships README.md and description.md alongside package.json.
// Found by walking up from this file: the shipped build runs at <root>/dist/cli.js.
function packageRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  while (!existsSync(path.join(dir, 'package.json'))) {
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return dir;
}

function packageVersion(): string {
  try {
    return JSON.parse(readFileSync(path.join(packageRoot(), 'package.json'), 'utf-8')).version ?? '?';
  } catch {
    return '?';
  }
}

function emitSkill(): void {
  const root = packageRoot();
  let readme: string, description: string;
  try {
    readme = readFileSync(path.join(root, 'README.md'), 'utf-8');
    description = readFileSync(path.join(root, 'description.md'), 'utf-8');
  } catch {
    console.error(`Could not read the bundled README.md / description.md (expected in ${root}).`);
    process.exit(1);
  }
  const version = packageVersion();
  const frontmatter = `---\nname: matchu-patchu\ndescription: ${description.trim().replace(/\s+/g, ' ')}\nversion: ${version}\n---`;
  const freshness = `> Generated from matchu-patchu v${version}. If \`npx matchu-patchu --version\` reports a newer version, re-run \`npx matchu-patchu skill\` to refresh this file.`;
  process.stdout.write(`${frontmatter}\n\n${freshness}\n\n${readme.trim()}\n`);
}

if (args[0] === 'skill') {
  emitSkill();
  process.exit(0);
}

if (args[0] === '--version') {
  console.log(packageVersion());
  process.exit(0);
}

if (args.includes('--help') || args.length === 0) {
  console.error('Usage: matchu-patchu <file> [--dry-run]   Read unified diff from stdin, apply to file.');
  console.error('       matchu-patchu skill                Print the agent skill (SKILL.md format) to stdout.');
  console.error('       matchu-patchu --version            Print the package version.');
  process.exit(0);
}

const filePath = args.find(a => !a.startsWith('--'))!;
const dryRun = args.includes('--dry-run');

// Read diff from stdin
const diff = readFileSync(0, 'utf-8');

// Read target file (empty string for new files)
let content = '';
try { content = readFileSync(filePath, 'utf-8'); } catch {}

// Apply patch (Key='' triggers single-file fallback in parser). Request errors —
// a malformed diff, or hunks naming files other than this one — throw: report
// them and exit nonzero.
const result = (() => {
  try { return Patcher.Apply(diff, [new PatchInputFile('', content)]); }
  catch (e) { console.error(e instanceof Error ? e.message : String(e)); process.exit(1); }
})();
const output = result.Files[0];

// Report errors to stderr
if (output.Errors.length > 0) {
  for (const err of output.Errors)
    console.error(err.SuggestedFixYaml);
}

// Summary to stderr
const n = output.Edits.length;
const fuzz = output.Fuzz;
console.error(
  `${n} edit(s)` +
  `${fuzz ? ` fuzz=${fuzz}` : ''}` +
  `${output.Errors.length ? ` errors=${output.Errors.length}` : ''}`
);

if (n === 0 && output.Errors.length > 0) process.exit(1);

// Write result
if (dryRun) {
  process.stdout.write(output.OutputFullText);
} else {
  writeFileSync(filePath, output.OutputFullText);
}
