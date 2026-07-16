/**
 * DecorativeMarkerSanitizer Tests
 * 
 * Tests removal of decorative markers while preserving legitimate content.
 */

import { describe, it, expect } from 'vitest'
import { DiffSanitizer } from '../../dist/parser/diffSanitizer.js'
import { TestHelpers } from '../helpers'
import { Patcher } from '../../dist/index.js'

describe('DecorativeMarkerSanitizer', () => {
  // External review 2026-07: this sanitizer was the one pipeline stage that
  // normalized CRLF→LF (its regex split dropped the '\r'), so byte-exact test
  // assertions failed on autocrlf checkouts. The pipeline must round-trip CRLF
  // input it doesn't otherwise touch byte-identically.
  it('pipeline preserves CRLF on untouched input', () => {
    const diff = '--- a/f.txt\r\n+++ b/f.txt\r\n@@ -1 +1 @@\r\n-old\r\n+new\r\n'
    expect(DiffSanitizer.Process(diff)).toBe(diff)
  })

  // Bare-@@ hunks (no counts) got none of the
  // counted-body protection, so deleting a markdown setext underline ("------" =
  // delete "-----") matched the decoration rule and the edit silently no-opped.
  // A bare body is the run of +/-/space-prefixed lines after the bare @@.
  it('preserves setext underline deletion in bare hunk', () => {
    const original = 'Title\n-----\nbody\n'
    const patch = '@@\n Title\n------\n body\n'

    const result = Patcher.Apply(patch, TestHelpers.singleFile(original))
    expect(result.Files[0].OutputFullText).toBe('Title\nbody\n')
    expect(result.Files[0].Errors.length).toBe(0)
  })

  // Flip side of the case above — the sanitizer's ORIGINAL intent stays intact: a bare
  // body ends at a blank line or any non-diff-shaped line, so decoration around a
  // bare-@@ hunk (before it, or blank-separated after it) is still stripped.
  it('strips decoration around bare hunks', () => {
    const diff = '*** BEGIN PATCH ***\n@@\n-old\n+new\n\n=======\n'

    const sanitized = DiffSanitizer.Process(diff)
    expect(sanitized).not.toContain('BEGIN PATCH')
    expect(sanitized).not.toContain('=======')
    expect(sanitized).toContain('-old')
    expect(sanitized).toContain('+new')
  })

  describe('Should remove decorative markers', () => {
    it('removes long repeated characters (5+)', () => {
      const diff = `\`\`\`diff
--- file.txt
+++ file.txt
=======
@@ -1 +1 @@
-old
+new
\`\`\``
      
      const sanitized = DiffSanitizer.Process(diff)
      expect(sanitized).not.toContain('=======')
      expect(sanitized).toContain('--- file.txt')
    })

    it('removes repeated asterisks', () => {
      const diff = `\`\`\`diff
***
--- file.txt
+++ file.txt
@@ -1 +1 @@
-old
+new
\`\`\``
      
      const sanitized = DiffSanitizer.Process(diff)
      expect(sanitized).not.toContain('***')
      expect(sanitized).toContain('--- file.txt')
    })

    it('removes explicit BEGIN PATCH markers', () => {
      const diff = `\`\`\`diff
*** BEGIN PATCH ***
--- file.txt
+++ file.txt
@@ -1 +1 @@
-old
+new
*** END PATCH ***
\`\`\``
      
      const sanitized = DiffSanitizer.Process(diff)
      expect(sanitized).not.toContain('BEGIN PATCH')
      expect(sanitized).not.toContain('END PATCH')
      expect(sanitized).toContain('--- file.txt')
    })

    it('removes START DIFF markers', () => {
      const diff = `\`\`\`diff
=== START DIFF ===
--- file.txt
+++ file.txt
@@ -1 +1 @@
-old
+new
\`\`\``
      
      const sanitized = DiffSanitizer.Process(diff)
      expect(sanitized).not.toContain('START DIFF')
    })

    // Whole-line anchoring (2026-07-05): a line that merely MENTIONS a marker
    // mid-line (prose or a string literal) is content and must survive; only lines
    // that ARE the decoration are stripped. The old containment rule ate these.
    it('preserves mid-line keyword mentions', () => {
      const diff = `\`\`\`diff
--- file.txt
+++ file.txt
@@ -1 +1 @@
-old
new

print("wrap output in *** BEGIN PATCH *** markers")
\`\`\``

      const sanitized = DiffSanitizer.Process(diff)
      expect(sanitized).toContain('*** BEGIN PATCH ***')
    })
  })

  describe('Should preserve legitimate content', () => {
    it('preserves markdown horizontal rules (---)', () => {
      const diff = `\`\`\`diff
--- docs.md
+++ docs.md
@@ -1,3 +1,5 @@
 # Title
+
+---
+
 Content
\`\`\``
      
      const sanitized = DiffSanitizer.Process(diff)
      expect(sanitized).toContain('+---')
    })

    it('preserves markdown horizontal rules (===)', () => {
      const diff = `\`\`\`diff
--- docs.md
+++ docs.md
@@ -1,3 +1,5 @@
 # Title
+===
+
 Content
\`\`\``
      
      const sanitized = DiffSanitizer.Process(diff)
      expect(sanitized).toContain('+===')
    })

    it('preserves YAML front matter separators', () => {
      const diff = `\`\`\`diff
--- blog.md
+++ blog.md
@@ -0,0 +1,4 @@
+---
+title: My Post
+date: 2024-01-01
+---
\`\`\``
      
      const sanitized = DiffSanitizer.Process(diff)
      const lines = sanitized.split('\n').filter(l => l.includes('+---'))
      expect(lines.length).toBeGreaterThanOrEqual(2) // Both --- separators preserved
    })

    it('preserves comment separators in code', () => {
      const diff = `\`\`\`diff
--- code.js
+++ code.js
@@ -1,3 +1,5 @@
 // Old section
+
+// ===
+
 function test() {}
\`\`\``
      
      const sanitized = DiffSanitizer.Process(diff)
      expect(sanitized).toContain('// ===')
    })

    it('preserves diff headers', () => {
      const diff = `\`\`\`diff
diff --git a/file.txt b/file.txt
--- file.txt
+++ file.txt
@@ -1 +1 @@
-old
+new
\`\`\``
      
      const sanitized = DiffSanitizer.Process(diff)
      expect(sanitized).toContain('diff --git')
    })

    it('preserves short separators (----, ====) in content', () => {
      const diff = `\`\`\`diff
--- table.md
+++ table.md
@@ -1,3 +1,5 @@
 | Col 1 | Col 2 |
+|-------|-------|
+| val 1 | val 2 |
\`\`\``
      
      const sanitized = DiffSanitizer.Process(diff)
      expect(sanitized).toContain('|-------|')
    })
  })

  describe('Edge cases', () => {
    it('handles mixed decorative and content markers', () => {
      const diff = `\`\`\`diff
==========
--- file.md
+++ file.md
@@ -1,3 +1,5 @@
 # Title
+---
 Content
\`\`\``
      
      const sanitized = DiffSanitizer.Process(diff)
      expect(sanitized).not.toContain('==========') // 10 chars removed
      expect(sanitized).toContain('+---')           // 3 chars preserved
    })

    it('handles empty lines', () => {
      const diff = `\`\`\`diff
--- file.txt
+++ file.txt

@@ -1 +1 @@
-old
+new
\`\`\``
      
      const sanitized = DiffSanitizer.Process(diff)
      expect(sanitized).toContain('--- file.txt')
    })
  })
})

