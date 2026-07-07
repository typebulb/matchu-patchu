/**
 * DiffContentHeuristics Tests
 * 
 * Tests heuristics for distinguishing between diff syntax and content that
 * happens to start with diff markers (e.g., CSS variables, markdown lists).
 */

import { describe, it, expect } from 'vitest'
import { UnifiedDiffParser } from '../../dist/parser/unifiedDiffParser.js'
import { DiffSanitizer } from '../../dist/parser/diffSanitizer.js'
import { Patcher } from '../../dist/index.js'

describe('DiffContentHeuristics', () => {
  describe('Double-marker content detection', () => {
    it('handles markdown list deletion without context lines (synthetic diff)', () => {
      // Bug: When generating synthetic "delete all, insert all" diffs,
      // lines like `-- 🗑️ - Reset` (deletion of `- 🗑️ - Reset`) are
      // misinterpreted as CSS variable content because there are no
      // context lines to set seenExplicitContext.
      // 
      // CSS vars look like `--var-name` (no space after --).
      // `-- ` (double dash + space) should be treated as deletion of `- ` (markdown list).
      const diff = `--- notes.md
+++ notes.md
@@ -1,1 +1,1 @@
-- list item
+- new list item`

      const groups = UnifiedDiffParser.Parse(diff, new Map([['notes.md', '']]))
      
      expect(groups.length).toBe(1)
      expect(groups[0].Key).toBe('notes.md')
      expect(groups[0].Hunks.length).toBe(1)
      
      const hunk = groups[0].Hunks[0]
      
      // '-- list item' should be parsed as DELETION of '- list item'
      expect(hunk.OldText).toContain('- list item')
      expect(hunk.NewText).toContain('- new list item')
      expect(hunk.NewText).not.toContain('- list item\n')
      
      // Verify: 1 deletion, 1 insertion, 0 context
      let context = 0, deletions = 0, insertions = 0
      for (const line of hunk.Lines) {
        if (line.Type === 0) context++
        else if (line.Type === 1) deletions++
        else if (line.Type === 2) insertions++
      }
      
      expect(deletions).toBe(1)
      expect(insertions).toBe(1)
      expect(context).toBe(0)
    })

    it('correctly handles markdown list item deletion (-- text)', () => {
      // Bug: diffExamples6.txt - StripIndent was removing single-space context markers
      // and CSS heuristic was treating '-- text' as content instead of deletion
      const diff = `\`\`\`diff
--- notes.md
+++ notes.md
@@ -2,7 +2,7 @@
 Converted to domeleon
 - Replaced React and react-dom with domeleon Component structure.
 - Canvas rendering and pointer interactions are managed via onMounted hooks and direct DOM refs for smooth updates.
-- Theme toggle updates html[data-theme] and its own label without re-rendering.
+- Theme toggle updates html[data-theme] via this.update().
 - CSS remains theme-aware with variables; selectors adjusted to be tag-agnostic (.header .title, .values .code).
 
 Files of note
\`\`\``

      const sanitized = DiffSanitizer.Process(diff)
      const groups = UnifiedDiffParser.Parse(sanitized, new Map([['notes.md', '']]))
      
      expect(groups.length).toBe(1)
      
      const notesGroup = groups[0]
      expect(notesGroup.Key).toBe('notes.md')
      expect(notesGroup.Hunks.length).toBe(1)
      
      const hunk = notesGroup.Hunks[0]
      
      // Check that old text contains the deleted line with markdown marker
      expect(hunk.OldText).toContain('- Theme toggle updates html[data-theme] and its own label without re-rendering.')
      
      // Check that new text contains the new line with markdown marker
      expect(hunk.NewText).toContain('- Theme toggle updates html[data-theme] via this.update().')
      
      // Verify line type counts (LineType enum: Context=0, Delete=1, Insert=2)
      let context = 0, deletions = 0, insertions = 0
      for (const line of hunk.Lines) {
        if (line.Type === 0) context++
        else if (line.Type === 1) deletions++
        else if (line.Type === 2) insertions++
      }
      
      expect(context).toBe(6)
      expect(deletions).toBe(1)
      expect(insertions).toBe(1)
    })
  })

  describe('Hyphenated identifier handling', () => {
    it('preserves -webkit- prefixes in context lines', () => {
      // Bug: StripIndent strips "   -webkit-..." to "-webkit-..." 
      // which IsValidDiffLineStart was treating as a deletion marker
      // Pattern: -[a-z]+- is a hyphenated identifier, not a diff marker
      const diff = `\`\`\`diff
--- styles.css
+++ styles.css
@@ -1,8 +1,12 @@
 h1 {
   text-align: center;
   margin-bottom: 20px;
+}
+
+h1 .gradient-text {
   background: linear-gradient(90deg, gold, orange);
   -webkit-background-clip: text;
   -webkit-text-fill-color: transparent;
 }
\`\`\``

      const sanitized = DiffSanitizer.Process(diff)
      const groups = UnifiedDiffParser.Parse(sanitized, new Map([['styles.css', '']]))
      
      expect(groups.length).toBe(1)
      
      const hunk = groups[0].Hunks[0]
      
      // -webkit-* lines should be context, not deletions
      // Verify line type counts (LineType enum: Context=0, Delete=1, Insert=2)
      let context = 0, deletions = 0, insertions = 0
      for (const line of hunk.Lines) {
        if (line.Type === 0) context++
        else if (line.Type === 1) deletions++
        else if (line.Type === 2) insertions++
      }
      
      // Should be: 7 context (h1, text-align, margin-bottom, background, -webkit-x2, closing brace)
      // and 3 insertions (}, blank, h1 .gradient-text {)
      // NO deletions
      expect(deletions).toBe(0)
      expect(insertions).toBe(3)
      expect(context).toBe(7)
      
      // The -webkit lines must appear in BOTH old and new text (they're context)
      expect(hunk.OldText).toContain('-webkit-background-clip: text;')
      expect(hunk.OldText).toContain('-webkit-text-fill-color: transparent;')
      expect(hunk.NewText).toContain('-webkit-background-clip: text;')
      expect(hunk.NewText).toContain('-webkit-text-fill-color: transparent;')
    })
  })

  describe('CSS variable handling', () => {
    it('preserves CSS variables in context lines (--variable)', () => {
      // Ensure CSS variables in proper context lines still work
      const diff = `\`\`\`diff
--- styles.css
+++ styles.css
@@ -1,4 +1,4 @@
 :root {
  --bg-color: #fff;
-  --text-color: #000;
+  --text-color: #333;
 }
\`\`\``

      const sanitized = DiffSanitizer.Process(diff)
      const groups = UnifiedDiffParser.Parse(sanitized, new Map([['styles.css', '']]))
      
      expect(groups.length).toBe(1)
      
      const hunk = groups[0].Hunks[0]
      
      // Context lines should preserve CSS variables
      expect(hunk.OldText).toContain('--bg-color: #fff;')
      
      // Deletion and insertion should work correctly
      expect(hunk.OldText).toContain('--text-color: #000;')
      expect(hunk.NewText).toContain('--text-color: #333;')
    })

    it('handles CSS variables with multiple properties', () => {
      const diff = `\`\`\`diff
--- styles.css
+++ styles.css
@@ -1,4 +1,4 @@
 :root {
-  --primary-color: #007bff;
+  --primary-color: #0056b3;
   --secondary-color: #6c757d;
 }
\`\`\``

      const sanitized = DiffSanitizer.Process(diff)
      const groups = UnifiedDiffParser.Parse(sanitized, new Map([['styles.css', '']]))
      
      expect(groups.length).toBe(1)
      
      const hunk = groups[0].Hunks[0]
      expect(hunk.OldText).toContain('--primary-color: #007bff;')
      expect(hunk.NewText).toContain('--primary-color: #0056b3;')
    })
  })

  describe('SQL comment handling', () => {
    it('treats deletion of SQL comment (--- comment) as content, not file header', () => {
      // Bug: `--- Old comment` (deletion of `-- Old comment`) was being parsed
      // as a file header for file "Old comment" instead of a deletion line.
      // This happens when `---` appears inside a hunk body.
      const diff = `\`\`\`diff
--- schema.sql
+++ schema.sql
@@ -1,5 +1,4 @@
 CREATE TABLE users (
--- This is the old comment
+-- This is the new comment
   id INT PRIMARY KEY,
   name VARCHAR(100)
 );
\`\`\``

      const sanitized = DiffSanitizer.Process(diff)
      const groups = UnifiedDiffParser.Parse(sanitized, new Map([['schema.sql', '']]))
      
      expect(groups.length).toBe(1)
      expect(groups[0].Key).toBe('schema.sql')
      expect(groups[0].Hunks.length).toBe(1)
      
      const hunk = groups[0].Hunks[0]
      
      // The `--- This is the old comment` should be a DELETION, not parsed as a file header
      expect(hunk.OldText).toContain('-- This is the old comment')
      expect(hunk.NewText).toContain('-- This is the new comment')
      expect(hunk.NewText).not.toContain('-- This is the old comment')
      
      // Verify line type counts (LineType enum: Context=0, Delete=1, Insert=2)
      let context = 0, deletions = 0, insertions = 0
      for (const line of hunk.Lines) {
        if (line.Type === 0) context++
        else if (line.Type === 1) deletions++
        else if (line.Type === 2) insertions++
      }
      
      expect(deletions).toBe(1)  // `-- This is the old comment`
      expect(insertions).toBe(1) // `-- This is the new comment`
      expect(context).toBe(4)    // CREATE TABLE, id, name, );
    })

    it('handles multiple SQL comments being modified', () => {
      const diff = `\`\`\`diff
--- query.sql
+++ query.sql
@@ -1,6 +1,6 @@
--- TODO: optimize this query
+-- DONE: query optimized
 SELECT * FROM users
--- WHERE clause needs index
+-- WHERE clause now uses index
 WHERE active = true;
\`\`\``

      const sanitized = DiffSanitizer.Process(diff)
      const groups = UnifiedDiffParser.Parse(sanitized, new Map([['query.sql', '']]))
      
      expect(groups.length).toBe(1)
      expect(groups[0].Key).toBe('query.sql')
      
      const hunk = groups[0].Hunks[0]
      
      // Both SQL comments should be properly handled as deletions/insertions
      expect(hunk.OldText).toContain('-- TODO: optimize this query')
      expect(hunk.OldText).toContain('-- WHERE clause needs index')
      expect(hunk.NewText).toContain('-- DONE: query optimized')
      expect(hunk.NewText).toContain('-- WHERE clause now uses index')
    })

    it('real-world: modifies first SQL comment in file', () => {
      // Real-world regression test
      // Source file starts with SQL comments, diff modifies the first one
      const source = `-- comment1
-- comment2
select *
from customer
`
      const diff = `--- Original
+++ Modified
@@ -1,4 +1,4 @@
--- comment1
+-- comment1a
 -- comment2
 select *
 from customer
`
      const result = Patcher.Apply(diff, [{ Key: '', InputFullText: source, InputSelectedText: '' }])
      
      expect(result.Files[0].Errors.length).toBe(0)
      expect(result.Files[0].OutputFullText).toContain('-- comment1a')
      expect(result.Files[0].OutputFullText).toContain('-- comment2')
      expect(result.Files[0].OutputFullText).not.toContain('-- comment1\n')
    })
  })

  describe('Sloppy doubled marker handling', () => {
    it('treats sloppy doubled insertion (++code) as insertion of code', () => {
      // When someone writes `++L2_MOD` they meant to insert `L2_MOD`, not `+L2_MOD`
      const diff = `\`\`\`diff
--- file.txt
+++ file.txt
@@ -1,2 +1,3 @@
 L1
++L2_MOD
 L3
\`\`\``

      const sanitized = DiffSanitizer.Process(diff)
      const groups = UnifiedDiffParser.Parse(sanitized, new Map([['file.txt', '']]))
      
      expect(groups.length).toBe(1)
      
      const hunk = groups[0].Hunks[0]
      
      // The `++L2_MOD` should be treated as insertion of `L2_MOD`, not `+L2_MOD`
      expect(hunk.NewText).toContain('L2_MOD')
      expect(hunk.NewText).not.toContain('+L2_MOD')
    })
  })

  describe('C++ operator handling', () => {
    it('correctly handles C++ increment operator (++)', () => {
      // ++ should not be confused with insertion marker
      const diff = `\`\`\`diff
--- code.cpp
+++ code.cpp
@@ -1,3 +1,3 @@
 int main() {
-  count++;
+  count += 2;
 }
\`\`\``

      const sanitized = DiffSanitizer.Process(diff)
      const groups = UnifiedDiffParser.Parse(sanitized, new Map([['code.cpp', '']]))
      
      expect(groups.length).toBe(1)
      
      const hunk = groups[0].Hunks[0]
      expect(hunk.OldText).toContain('count++;')
      expect(hunk.NewText).toContain('count += 2;')
    })

    it('handles C++ increment operator in context', () => {
      const diff = `\`\`\`diff
--- code.cpp
+++ code.cpp
@@ -1,4 +1,4 @@
 int main() {
-  count++;
+  count += 2;
   return 0;
 }
\`\`\``

      const sanitized = DiffSanitizer.Process(diff)
      const groups = UnifiedDiffParser.Parse(sanitized, new Map([['code.cpp', '']]))
      
      expect(groups.length).toBe(1)
      
      const hunk = groups[0].Hunks[0]
      expect(hunk.OldText).toContain('count++;')
      expect(hunk.NewText).toContain('count += 2;')
    })
  })

  describe('Markdown bullet disambiguation', () => {
    it('treats indented "- " as context when file contains markdown bullets', () => {
      // Bug: Lines like "   - Label them..." (indented markdown bullet) were getting
      // stripped to "- Label them..." which was then misparsed as DELETE instead of CONTEXT.
      // The fix checks file content to disambiguate.

      // File content with markdown bullets
      const fileContent = `For each dialogue turn:
1. Identify the speaker.
2. Provide the text exactly as it appears in the data.
3. Identify argument techniques, fallacies, or rhetorical devices used.
   - Label them as "fallacy", "tactic", or "rhetoric".
   - Provide a short description.
   - Provide the EXACT 'snippet' from the text.
`

      // Diff that modifies a line but keeps bullets as context
      const diff = `\`\`\`diff
--- inference.md
+++ inference.md
@@ -2,6 +2,6 @@
 1. Identify the speaker.
 2. Provide the text exactly as it appears in the data.
-3. Identify argument techniques, fallacies, or rhetorical devices used.
+3. Identify argument techniques and rhetorical devices used.
   - Label them as "fallacy", "tactic", or "rhetoric".
   - Provide a short description.
   - Provide the EXACT 'snippet' from the text.
\`\`\``

      const sanitized = DiffSanitizer.Process(diff)
      const groups = UnifiedDiffParser.Parse(sanitized, new Map([['inference.md', fileContent]]))

      expect(groups.length).toBe(1)
      expect(groups[0].Key).toBe('inference.md')

      const hunk = groups[0].Hunks[0]

      // The "   - Label them..." lines should be parsed as CONTEXT, not DELETE
      // Verify line type counts (LineType enum: Context=0, Delete=1, Insert=2)
      let context = 0, deletions = 0, insertions = 0
      for (const line of hunk.Lines) {
        if (line.Type === 0) context++
        else if (line.Type === 1) deletions++
        else if (line.Type === 2) insertions++
      }

      // Should have: 5 context lines (1. Identify, 2. Provide, - Label, - Provide short, - Provide EXACT)
      // 1 deletion (3. Identify argument techniques, fallacies...)
      // 1 insertion (3. Identify argument techniques and...)
      expect(deletions).toBe(1)
      expect(insertions).toBe(1)
      expect(context).toBe(5)

      // The markdown bullets must appear in BOTH old and new text (they're context)
      expect(hunk.OldText).toContain('- Label them as "fallacy"')
      expect(hunk.NewText).toContain('- Label them as "fallacy"')
    })

    it('applies patch correctly when markdown bullets are in context', () => {
      // End-to-end test using the Patcher
      const fileContent = `Instructions:
1. First step
   - Bullet point one
   - Bullet point two
2. Second step
`

      const diff = `\`\`\`diff
--- file.md
+++ file.md
@@ -1,5 +1,5 @@
 Instructions:
-1. First step
+1. Updated first step
   - Bullet point one
   - Bullet point two
 2. Second step
\`\`\``

      const result = Patcher.Apply(diff, [{ Key: 'file.md', InputFullText: fileContent, InputSelectedText: '' }])

      expect(result.Files[0].Errors.length).toBe(0)
      expect(result.Files[0].OutputFullText).toContain('1. Updated first step')
      expect(result.Files[0].OutputFullText).toContain('   - Bullet point one')
      expect(result.Files[0].OutputFullText).toContain('   - Bullet point two')
    })
  })
})

