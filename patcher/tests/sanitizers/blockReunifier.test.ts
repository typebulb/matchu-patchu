/**
 * DiffBlockReunifier Tests
 * 
 * Tests removal of intermediate fences that LLMs insert between files.
 */

import { describe, it, expect } from 'vitest'
import { DiffSanitizer } from '../../dist/parser/diffSanitizer.js'
import { UnifiedDiffParser } from '../../dist/parser/unifiedDiffParser.js'
import { TestHelpers } from '../helpers'
import { Patcher } from '../../dist/index.js'

describe('DiffBlockReunifier', () => {
  it('handles multiple separate diff blocks (parser tolerates them)', () => {
    // Note: DiffBlockReunifier removes intermediate fences if diff markers follow immediately
    // In this case, the blocks are separate and the parser handles them correctly
    const diff = `\`\`\`diff
--- file1.ts
+++ file1.ts
@@ -1 +1 @@
-old1
+new1
\`\`\`

\`\`\`diff
--- file2.ts
+++ file2.ts
@@ -1 +1 @@
-old2
+new2
\`\`\``

    const sanitized = DiffSanitizer.Process(diff)
    const groups = UnifiedDiffParser.Parse(sanitized, new Map([['file1.ts', ''], ['file2.ts', '']]))
    
    // Parser should handle both files correctly
    expect(groups.length).toBe(2)
    expect(groups[0].Key).toBe('file1.ts')
    expect(groups[1].Key).toBe('file2.ts')
  })

  it('handles three separate blocks', () => {
    const diff = `\`\`\`diff
--- file1.ts
+++ file1.ts
@@ -1 +1 @@
-old1
+new1
\`\`\`

\`\`\`diff
--- file2.ts
+++ file2.ts
@@ -1 +1 @@
-old2
+new2
\`\`\`

\`\`\`diff
--- file3.ts
+++ file3.ts
@@ -1 +1 @@
-old3
+new3
\`\`\``

    const sanitized = DiffSanitizer.Process(diff)
    const groups = UnifiedDiffParser.Parse(sanitized, new Map([['file1.ts', ''], ['file2.ts', ''], ['file3.ts', '']]))
    
    expect(groups.length).toBe(3)
  })

  it('handles normal single-block diff', () => {
    const diff = `\`\`\`diff
--- file.ts
+++ file.ts
@@ -1 +1 @@
-old
+new
\`\`\`

Some explanatory text after.
`

    const sanitized = DiffSanitizer.Process(diff)
    const groups = UnifiedDiffParser.Parse(sanitized, new Map([['file.ts', '']]))
    
    expect(groups.length).toBe(1)
  })

  it('handles embedded code fences in diff content', () => {
    const diff = `\`\`\`diff
--- docs.md
+++ docs.md
@@ -1,3 +1,5 @@
 # Documentation
+
+\`\`\`typescript
+code example
+\`\`\`
\`\`\``

    const sanitized = DiffSanitizer.Process(diff)
    
    // Embedded fences should be preserved as content
    expect(sanitized).toContain('+```typescript')
    expect(sanitized).toContain('+```')
  })

  it('handles blocks with blank lines between', () => {
    const diff = `\`\`\`diff
--- file1.ts
+++ file1.ts
@@ -1 +1 @@
-old1
+new1
\`\`\`


\`\`\`diff
--- file2.ts
+++ file2.ts
@@ -1 +1 @@
-old2
+new2
\`\`\``

    const sanitized = DiffSanitizer.Process(diff)
    const groups = UnifiedDiffParser.Parse(sanitized, new Map([['file1.ts', ''], ['file2.ts', '']]))
    
    expect(groups.length).toBe(2)
  })

  it('handles single file with no intermediate fences', () => {
    const diff = `\`\`\`diff
--- file.ts
+++ file.ts
@@ -1 +1 @@
-old
+new
\`\`\``

    const original = diff
    const sanitized = DiffSanitizer.Process(diff)
    
    expect(sanitized).toBe(original)
  })

  // A whitespace-prefixed " ```" is a hunk
  // CONTEXT line (a diff patching markdown that contains code blocks), not a stray
  // fence. Deleting it stripped the hunk's anchor and the insert landed at the top
  // of the file with zero errors. Only column-0 fences are fences.
  it('preserves fence context lines inside hunks', () => {
    const original = 'alpha\n```\nomega\nzed\n'
    const patch =
      '```diff\n@@ -2,2 +2,3 @@\n ```\n+NEW\n omega\n@@ -4,1 +4,1 @@\n-zed\n+ZED\n```\n'

    const result = Patcher.Apply(patch, TestHelpers.singleFile(original))
    expect(result.Files[0].OutputFullText).toBe('alpha\n```\nNEW\nomega\nZED\n')
    expect(result.Files[0].Errors.length).toBe(0)
  })
})

