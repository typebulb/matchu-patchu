/**
 * DecoratedHeaderSanitizer Tests
 * 
 * Tests removal of decorative markers from file headers.
 */

import { describe, it, expect } from 'vitest'
import { DiffSanitizer } from '../../dist/parser/diffSanitizer.js'
import { UnifiedDiffParser } from '../../dist/parser/unifiedDiffParser.js'
import { TestHelpers } from '../helpers'
import { Patcher } from '../../dist/index.js'

describe('DecoratedHeaderSanitizer', () => {
  it('sanitizes decorated headers with trailing markers', () => {
    const diff = `\`\`\`diff
--- code.tsx ---
+++ code.tsx ---
@@ -1,2 +1,2 @@
-old
+new
\`\`\``

    const sanitized = DiffSanitizer.Process(diff)
    
    expect(sanitized).not.toContain('--- code.tsx ---')
    expect(sanitized).toContain('--- code.tsx')
    expect(sanitized).not.toContain('+++ code.tsx ---')
    
    const groups = UnifiedDiffParser.Parse(sanitized, new Map([['code.tsx', '']]))
    expect(groups.length).toBe(1)
    expect(groups[0].Key).toBe('code.tsx')
  })

  it('handles multiple trailing markers', () => {
    const diff = `\`\`\`diff
--- file.txt ------
+++ file.txt ++++++
@@ -1 +1 @@
-old
+new
\`\`\``

    const sanitized = DiffSanitizer.Process(diff)
    
    expect(sanitized).toContain('--- file.txt')
    expect(sanitized).not.toContain('------')
    expect(sanitized).toContain('+++ file.txt')
    expect(sanitized).not.toContain('++++++')
  })

  it('handles matched marker types only', () => {
    // Regex only removes if marker types match (--- ... --- or +++ ... +++)
    const diff = `\`\`\`diff
--- code.js ------
+++ code.js ++++++
@@ -1 +1 @@
-old
+new
\`\`\``

    const sanitized = DiffSanitizer.Process(diff)
    
    expect(sanitized).toContain('--- code.js')
    expect(sanitized).not.toContain('------') // Matching --- removed
    expect(sanitized).toContain('+++ code.js')
    expect(sanitized).not.toContain('++++++') // Matching +++ removed
  })

  it('preserves paths without decoration', () => {
    const diff = `\`\`\`diff
--- src/components/Button.tsx
+++ src/components/Button.tsx
@@ -1 +1 @@
-old
+new
\`\`\``

    const sanitized = DiffSanitizer.Process(diff)
    
    expect(sanitized).toContain('--- src/components/Button.tsx')
    expect(sanitized).toContain('+++ src/components/Button.tsx')
  })

  it('handles multi-file diffs with decorated headers', () => {
    const diff = `\`\`\`diff
--- file1.ts ---
+++ file1.ts +++
@@ -1 +1 @@
-old1
+new1

--- file2.ts ---
+++ file2.ts ---
@@ -1 +1 @@
-old2
+new2
\`\`\``

    const sanitized = DiffSanitizer.Process(diff)
    const groups = UnifiedDiffParser.Parse(sanitized, new Map([['file1.ts', ''], ['file2.ts', '']]))
    
    expect(groups.length).toBe(2)
    expect(groups[0].Key).toBe('file1.ts')
    expect(groups[1].Key).toBe('file2.ts')
  })

  // External review 2026-07: a counted hunk-body line shaped like a decorated
  // header is content — "+++ NOTE +++" is an insert of "++ NOTE +++", and
  // rewriting it silently corrupted the inserted text (trailing " +++" dropped).
  it('preserves hunk-body lines shaped like decorated headers', () => {
    const original = 'alpha\nomega\n'
    const patch = '--- a/f.txt ---\n+++ b/f.txt ---\n@@ -1,2 +1,3 @@\n alpha\n+++ NOTE +++\n omega\n'

    const result = Patcher.Apply(patch, TestHelpers.singleFile(original))
    expect(result.Files[0].OutputFullText).toBe('alpha\n++ NOTE +++\nomega\n')
    expect(result.Files[0].Errors.length).toBe(0)
  })

  // Companion deletion case: a file line "-- Section ---" is deleted via the diff
  // line "--- Section ---"; the body-blind rewrite turned it into "--- Section",
  // which no longer matched the file and failed the deletion loudly.
  it('preserves hunk-body deletion of dash-decorated content', () => {
    const original = 'alpha\n-- Section ---\nomega\n'
    const patch = '--- a/f.txt ---\n+++ b/f.txt ---\n@@ -1,3 +1,2 @@\n alpha\n--- Section ---\n omega\n'

    const result = Patcher.Apply(patch, TestHelpers.singleFile(original))
    expect(result.Files[0].OutputFullText).toBe('alpha\nomega\n')
    expect(result.Files[0].Errors.length).toBe(0)
  })
})

