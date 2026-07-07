/**
 * CustomFormatSanitizer Tests
 * 
 * Tests conversion of custom LLM formats to standard unified diff.
 */

import { describe, it, expect } from 'vitest'
import { DiffSanitizer } from '../../dist/parser/diffSanitizer.js'
import { UnifiedDiffParser } from '../../dist/parser/unifiedDiffParser.js'
import { Patcher } from '../../dist/index.js'
import { TestHelpers } from '../helpers'

describe('CustomFormatSanitizer', () => {
  describe('Update format', () => {
    it('converts *** Update File: path', () => {
      const diff = `\`\`\`diff
*** Update File: code.tsx
@@ -1 +1 @@
-old
+new
\`\`\``

      const sanitized = DiffSanitizer.Process(diff)
      
      expect(sanitized).toContain('--- a/code.tsx')
      expect(sanitized).toContain('+++ b/code.tsx')
      expect(sanitized).not.toContain('*** Update File')
    })

    it('handles case-insensitive update', () => {
      const diff = `\`\`\`diff
*** update file: styles.css
@@ -1 +1 @@
-old
+new
\`\`\``

      const sanitized = DiffSanitizer.Process(diff)
      
      expect(sanitized).toContain('--- a/styles.css')
      expect(sanitized).toContain('+++ b/styles.css')
    })
  })

  describe('Add format', () => {
    it('converts *** Add File: path', () => {
      const diff = `\`\`\`diff
*** Add File: newfile.txt
@@ -0,0 +1,2 @@
+Line 1
+Line 2
\`\`\``

      const sanitized = DiffSanitizer.Process(diff)
      
      expect(sanitized).toContain('--- /dev/null')
      expect(sanitized).toContain('+++ b/newfile.txt')
      expect(sanitized).not.toContain('*** Add File')
    })
  })

  describe('Delete format', () => {
    it('converts *** Delete File: path', () => {
      const diff = `\`\`\`diff
*** Delete File: oldfile.txt
@@ -1,2 +0,0 @@
-Line 1
-Line 2
\`\`\``

      const sanitized = DiffSanitizer.Process(diff)
      
      expect(sanitized).toContain('--- a/oldfile.txt')
      expect(sanitized).toContain('+++ /dev/null')
      expect(sanitized).not.toContain('*** Delete File')
    })
  })

  describe('Multi-file with custom format', () => {
    it('handles mixed custom and standard formats', () => {
      const diff = `\`\`\`diff
*** Update File: file1.ts
@@ -1 +1 @@
-old1
+new1

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
  })

  describe('Preserves standard format', () => {
    it('leaves normal headers unchanged', () => {
      const diff = `\`\`\`diff
--- code.tsx
+++ code.tsx
@@ -1 +1 @@
-old
+new
\`\`\``

      const sanitized = DiffSanitizer.Process(diff)
      
      expect(sanitized).toContain('--- code.tsx')
      expect(sanitized).toContain('+++ code.tsx')
    })
  })

  describe('Hunk-body protection (review 2026-07-06, silent corruption)', () => {
    // The conversion used to run over hunk-body lines too, so inserting a line that
    // itself reads "*** Update File: x" wrote "--- a/x" into the target file with
    // zero errors. Body lines are content.
    it('leaves a custom-header-shaped insert line as content', () => {
      const diff = `@@ -1,2 +1,3 @@
 alpha
+*** Update File: hijacked.cs
 omega
`

      const file = Patcher.Apply(diff, TestHelpers.singleFile('alpha\nomega\n')).Files[0]

      expect(file.Errors.length).toBe(0)
      expect(file.OutputFullText).toBe('alpha\n*** Update File: hijacked.cs\nomega\n')
    })

    // The header regex had no line-start anchor, so a prose mention of the marker
    // mid-line was rewritten into file headers.
    it('does not convert a mid-line mention of the marker', () => {
      const diff = `see *** Update File: notes.md for details
--- a/code.tsx
+++ b/code.tsx
@@ -1 +1 @@
-old
+new
`

      const sanitized = DiffSanitizer.Process(diff)

      expect(sanitized).toContain('see *** Update File: notes.md for details')
      expect(sanitized).not.toContain('+++ b/notes.md')
    })
  })
})

