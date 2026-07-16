/**
 * Multi-input (keyed changeset) tests.
 *
 * The primary consumer pattern: every apply passes ALL project files as keyed
 * PatchInputFiles and a single diff routes hunks across them — the agent gets one
 * shot to emit a whole changeset. These pin the routing, isolation, error-placement,
 * and atomicity semantics that pattern depends on.
 */

import { describe, it, expect } from 'vitest'
import { Patcher, PatchInputFile, PatchOptions, PatchException } from '../../dist/index.js'

const project = () => [
  new PatchInputFile('code.tsx', 'const a = 1\nconst b = 2\n'),
  new PatchInputFile('styles.css', 'body { color: red }\n'),
  new PatchInputFile('index.html', '<div id="root"></div>\n'),
]

describe('Multi-input changesets', () => {
  it('routes hunks to two files and leaves the third untouched', () => {
    const patch = `--- code.tsx
+++ code.tsx
@@ -1,2 +1,2 @@
-const a = 1
+const a = 10
 const b = 2
--- styles.css
+++ styles.css
@@ -1,1 +1,1 @@
-body { color: red }
+body { color: blue }
`
    const result = Patcher.Apply(patch, project())

    expect(result.Files.map(f => f.Key)).toEqual(['code.tsx', 'styles.css', 'index.html'])
    expect(result.Files[0].OutputFullText).toBe('const a = 10\nconst b = 2\n')
    expect(result.Files[1].OutputFullText).toBe('body { color: blue }\n')
    expect(result.Files[2].OutputFullText).toBe('<div id="root"></div>\n')
    for (const f of result.Files) expect(f.Errors.length).toBe(0)
  })

  it('routes git a/b-prefixed headers to bare keys', () => {
    const patch = `--- a/code.tsx
+++ b/code.tsx
@@ -1,2 +1,2 @@
-const a = 1
+const a = 10
 const b = 2
--- a/styles.css
+++ b/styles.css
@@ -1,1 +1,1 @@
-body { color: red }
+body { color: blue }
`
    const result = Patcher.Apply(patch, project())

    expect(result.Files[0].OutputFullText).toBe('const a = 10\nconst b = 2\n')
    expect(result.Files[1].OutputFullText).toBe('body { color: blue }\n')
  })

  // Pins current behavior: only git a/ b/ prefixes canonicalize; ./ fails loud.
  // If ./ tolerance is ever adopted, this is the test that flips.
  it('./-prefixed headers do not route — FileMismatch report entry', () => {
    const patch = `--- ./styles.css
+++ ./styles.css
@@ -1,1 +1,1 @@
-body { color: red }
+body { color: blue }
`
    const result = Patcher.Apply(patch, project())

    expect(result.Files[1].OutputFullText).toBe('body { color: red }\n') // untouched
    expect(result.Files[1].Errors.length).toBe(0)
    const report = result.Files.find(f => f.Key === './styles.css')!
    expect(report.Errors[0].Type).toBe('FileMismatch')
    expect(report.Errors[0].Hint).toContain('styles.css') // roster in the hint
  })

  it('keeps output order = input order even when the diff orders files differently', () => {
    const patch = `--- styles.css
+++ styles.css
@@ -1,1 +1,1 @@
-body { color: red }
+body { color: blue }
--- code.tsx
+++ code.tsx
@@ -1,2 +1,2 @@
-const a = 1
+const a = 10
 const b = 2
`
    const result = Patcher.Apply(patch, project())

    expect(result.Files.map(f => f.Key)).toEqual(['code.tsx', 'styles.css', 'index.html'])
    expect(result.Files[0].OutputFullText).toBe('const a = 10\nconst b = 2\n')
    expect(result.Files[1].OutputFullText).toBe('body { color: blue }\n')
  })

  it('applies two header groups for the same file', () => {
    const files = [
      new PatchInputFile('code.tsx', 'const a = 1\nconst b = 2\nconst c = 3\n'),
      new PatchInputFile('styles.css', 'body { color: red }\n'),
    ]
    const patch = `--- code.tsx
+++ code.tsx
@@ -1,1 +1,1 @@
-const a = 1
+const a = 10
--- styles.css
+++ styles.css
@@ -1,1 +1,1 @@
-body { color: red }
+body { color: blue }
--- code.tsx
+++ code.tsx
@@ -3,1 +3,1 @@
-const c = 3
+const c = 30
`
    const result = Patcher.Apply(patch, files)

    expect(result.Files[0].OutputFullText).toBe('const a = 10\nconst b = 2\nconst c = 30\n')
    expect(result.Files[1].OutputFullText).toBe('body { color: blue }\n')
  })

  it('fills an empty-content key with an insert-only hunk', () => {
    const files = [
      new PatchInputFile('code.tsx', 'const a = 1\n'),
      new PatchInputFile('server.ts', ''),
    ]
    const patch = `--- server.ts
+++ server.ts
@@ -0,0 +1,2 @@
+export function scan() {
+}
`
    const result = Patcher.Apply(patch, files)

    expect(result.Files[1].OutputFullText).toBe('export function scan() {\n}\n')
    expect(result.Files[0].OutputFullText).toBe('const a = 1\n')
  })

  it('routes a /dev/null new-file header to a held empty key', () => {
    const files = [
      new PatchInputFile('code.tsx', 'const a = 1\n'),
      new PatchInputFile('server.ts', ''),
    ]
    const patch = `--- /dev/null
+++ b/server.ts
@@ -0,0 +1,2 @@
+export function scan() {
+}
`
    const result = Patcher.Apply(patch, files)

    expect(result.Files[1].OutputFullText).toBe('export function scan() {\n}\n')
  })

  it('puts a match failure on the failing file and still applies siblings (default mode)', () => {
    const patch = `--- code.tsx
+++ code.tsx
@@ -1,2 +1,2 @@
-const a = 1
+const a = 10
 const b = 2
--- styles.css
+++ styles.css
@@ -1,1 +1,1 @@
-body { color: green }
+body { color: blue }
`
    const result = Patcher.Apply(patch, project())

    expect(result.Files[0].OutputFullText).toBe('const a = 10\nconst b = 2\n')
    expect(result.Files[0].Errors.length).toBe(0)
    expect(result.Files[1].Errors.length).toBeGreaterThan(0)
    expect(result.Files[1].Errors[0].Type).toBe('MatchNotFound')
  })

  it('throw mode aborts the whole changeset when any file fails', () => {
    const patch = `--- code.tsx
+++ code.tsx
@@ -1,2 +1,2 @@
-const a = 1
+const a = 10
 const b = 2
--- styles.css
+++ styles.css
@@ -1,1 +1,1 @@
-body { color: green }
+body { color: blue }
`
    const options = new PatchOptions()
    options.ContinueOnError = false
    expect(() => Patcher.Apply(patch, project(), options)).toThrow(PatchException)
  })

  it('applies a fenced multi-file diff with SanitizeDiff', () => {
    const patch = '```diff\n' +
      '--- code.tsx\n+++ code.tsx\n@@ -1,2 +1,2 @@\n-const a = 1\n+const a = 10\n const b = 2\n' +
      '--- styles.css\n+++ styles.css\n@@ -1,1 +1,1 @@\n-body { color: red }\n+body { color: blue }\n' +
      '```'
    const options = new PatchOptions()
    options.SanitizeDiff = true
    const result = Patcher.Apply(patch, project(), options)

    expect(result.Files[0].OutputFullText).toBe('const a = 10\nconst b = 2\n')
    expect(result.Files[1].OutputFullText).toBe('body { color: blue }\n')
  })

  it('routes custom-format headers (*** Update File:) to keys end-to-end', () => {
    const patch = '*** Update File: styles.css\n@@ -1,1 +1,1 @@\n-body { color: red }\n+body { color: blue }\n'
    const options = new PatchOptions()
    options.SanitizeDiff = true
    const result = Patcher.Apply(patch, project(), options)

    expect(result.Files[1].OutputFullText).toBe('body { color: blue }\n')
  })

  // Pins current behavior: keys are case-sensitive. A case-drifted header gets a
  // FileMismatch report entry naming the drifted path.
  it('case-mismatched headers do not route — FileMismatch report entry', () => {
    const patch = `--- Styles.css
+++ Styles.css
@@ -1,1 +1,1 @@
-body { color: red }
+body { color: blue }
`
    const result = Patcher.Apply(patch, project())

    expect(result.Files[1].OutputFullText).toBe('body { color: red }\n') // untouched
    const report = result.Files.find(f => f.Key === 'Styles.css')!
    expect(report.Errors[0].Type).toBe('FileMismatch')
  })
})

// Routing semantics and rationale live in src/headerlessRouter.ts; these tests pin them.
describe('Headerless routing in keyed mode', () => {
  it('routes a headerless hunk to the unique file whose content matches', () => {
    const patch = `@@ -1,1 +1,1 @@
-body { color: red }
+body { color: blue }
`
    const result = Patcher.Apply(patch, project())

    expect(result.Files[1].OutputFullText).toBe('body { color: blue }\n')
    expect(result.Files[0].OutputFullText).toBe('const a = 1\nconst b = 2\n')
    for (const f of result.Files) expect(f.Errors.length).toBe(0)
  })

  it('routes a headerless hunk when a single keyed file is held', () => {
    const patch = `@@ -1,2 +1,2 @@
-const a = 1
+const a = 10
 const b = 2
`
    const result = Patcher.Apply(patch, [new PatchInputFile('code.tsx', 'const a = 1\nconst b = 2\n')])

    expect(result.Files[0].OutputFullText).toBe('const a = 10\nconst b = 2\n')
  })

  // Only hunks BEFORE any file header are routable — a bare hunk after a header belongs
  // to that file per standard diff semantics (and fails loud per-file if it doesn't match).
  it('routes a leading headerless group alongside a headed group for another file', () => {
    const patch = `@@ -1,1 +1,1 @@
-body { color: red }
+body { color: blue }
--- code.tsx
+++ code.tsx
@@ -1,2 +1,2 @@
-const a = 1
+const a = 10
 const b = 2
`
    const result = Patcher.Apply(patch, project())

    expect(result.Files[0].OutputFullText).toBe('const a = 10\nconst b = 2\n')
    expect(result.Files[1].OutputFullText).toBe('body { color: blue }\n')
  })

  it('merges a routed headerless group into the headed group for the same file', () => {
    const files = [
      new PatchInputFile('code.tsx', 'const a = 1\nconst b = 2\nconst c = 3\n'),
      new PatchInputFile('styles.css', 'body { color: red }\n'),
    ]
    const patch = `@@ -3,1 +3,1 @@
-const c = 3
+const c = 30
--- code.tsx
+++ code.tsx
@@ -1,1 +1,1 @@
-const a = 1
+const a = 10
`
    const result = Patcher.Apply(patch, files)

    expect(result.Files[0].OutputFullText).toBe('const a = 10\nconst b = 2\nconst c = 30\n')
    expect(result.Files[1].OutputFullText).toBe('body { color: red }\n')
  })

  // Routing failures are reported as a ''-keyed entry — the key the diff itself
  // used for the headerless group.
  it('reports a MatchAmbiguous entry when headerless content matches multiple files', () => {
    const files = [
      new PatchInputFile('a.css', 'body { color: red }\n'),
      new PatchInputFile('b.css', 'body { color: red }\n'),
    ]
    const patch = `@@ -1,1 +1,1 @@
-body { color: red }
+body { color: blue }
`
    const result = Patcher.Apply(patch, files)

    for (const f of result.Files.slice(0, 2)) {
      expect(f.OutputFullText).toBe(f.InputFullText)
      expect(f.Errors.length).toBe(0)
    }
    const report = result.Files.find(f => f.Key === '')!
    expect(report.Errors[0].Type).toBe('MatchAmbiguous')
    expect(report.Errors[0].FileKey).toBe('a.css, b.css')
    expect(report.Errors[0].Hint).toContain('file headers')
  })

  it('reports a MatchNotFound entry when headerless content matches no file', () => {
    const patch = `@@ -1,1 +1,1 @@
-nothing like this exists
+replacement
`
    const result = Patcher.Apply(patch, project())

    for (const f of result.Files.slice(0, 3)) expect(f.OutputFullText).toBe(f.InputFullText)
    const report = result.Files.find(f => f.Key === '')!
    expect(report.Errors[0].Type).toBe('MatchNotFound')
    expect(report.Errors[0].Hint).toContain('file headers')
  })

  it('throw mode: unroutable headerless hunk throws', () => {
    const patch = `@@ -1,1 +1,1 @@
-nothing like this exists
+replacement
`
    const options = new PatchOptions()
    options.ContinueOnError = false
    expect(() => Patcher.Apply(patch, project(), options)).toThrow(PatchException)
  })

  it('routes an already-applied headerless hunk and reports it applied', () => {
    const files = [
      new PatchInputFile('code.tsx', 'const a = 1\n'),
      new PatchInputFile('styles.css', 'body { color: blue }\n'),
    ]
    const patch = `@@ -1,1 +1,1 @@
-body { color: red }
+body { color: blue }
`
    const result = Patcher.Apply(patch, files)

    expect(result.Files[1].OutputFullText).toBe('body { color: blue }\n')
    expect(result.Files[1].AlreadyAppliedCount).toBeGreaterThan(0)
  })
})
