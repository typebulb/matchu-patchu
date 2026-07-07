/**
 * Markdown Hyphen Edge Cases
 *
 * Minimal test cases to identify patcher failures when handling
 * markdown content with hyphens (list items, YAML frontmatter, etc.)
 */

import { describe, it, expect } from 'vitest'
import { UnifiedDiffParser } from '../../dist/parser/unifiedDiffParser.js'
import { DiffSanitizer } from '../../dist/parser/diffSanitizer.js'
import { Patcher } from '../../dist/index.js'
import { LineType } from '../../dist/models.js'

describe('Markdown Hyphen Edge Cases', () => {

  it('handles YAML frontmatter delimiter (---) as context', () => {
    const fileContent = `---
title: Old Title
---
# Content`

    const diff = `--- doc.md
+++ doc.md
@@ -1,4 +1,4 @@
 ---
-title: Old Title
+title: New Title
 ---`

    const result = Patcher.Apply(diff, [{ Key: 'doc.md', InputFullText: fileContent, InputSelectedText: '' }])

    expect(result.Files[0].Errors.length).toBe(0)
    expect(result.Files[0].OutputFullText).toContain('title: New Title')
    expect(result.Files[0].OutputFullText).toContain('---')
  })

  it('handles multiple consecutive list deletions', () => {
    const fileContent = `- first item
- second item
- third item`

    const diff = `--- doc.md
+++ doc.md
@@
-- first item
-- second item
-- third item
+- replacement item`

    const sanitized = DiffSanitizer.Process(diff)
    const groups = UnifiedDiffParser.Parse(sanitized, new Map([['doc.md', fileContent]]))

    expect(groups.length).toBe(1)
    const hunk = groups[0].Hunks[0]

    const deletions = hunk.Lines.filter(l => l.Type === LineType.Delete)
    const insertions = hunk.Lines.filter(l => l.Type === LineType.Insert)

    expect(deletions.length).toBe(3)
    expect(insertions.length).toBe(1)
    expect(hunk.OldText).toContain('- first item')
    expect(hunk.OldText).toContain('- second item')
    expect(hunk.OldText).toContain('- third item')
  })

  it('recovers when LLM omits context prefix on markdown list', () => {
    // When LLM forgets the space prefix on a markdown list line,
    // the parser should use file content to disambiguate:
    // - File has "- list item" (markdown bullet)
    // - File does NOT have " list item" (space-prefixed content)
    // Therefore "- list item" should be treated as context, not deletion.
    const fileContent = `header
- list item
old line`

    const diff = `--- doc.md
+++ doc.md
@@ -1,3 +1,3 @@
 header
- list item
-old line
+new line`

    const result = Patcher.Apply(diff, [{ Key: 'doc.md', InputFullText: fileContent, InputSelectedText: '' }])

    // DESIRED behavior: patcher recognizes "- list item" as context and succeeds
    expect(result.Files[0].Errors.length).toBe(0)
    expect(result.Files[0].OutputFullText).toBe(`header
- list item
new line`)
  })

  it('works correctly when LLM includes proper context prefix on list', () => {
    const fileContent = `header
- list item
old line`

    const diff = `--- doc.md
+++ doc.md
@@ -1,3 +1,3 @@
 header
 - list item
-old line
+new line`

    const result = Patcher.Apply(diff, [{ Key: 'doc.md', InputFullText: fileContent, InputSelectedText: '' }])

    expect(result.Files[0].Errors.length).toBe(0)
    expect(result.Files[0].OutputFullText).toBe(`header
- list item
new line`)
  })

  it('handles nested list deletion', () => {
    const fileContent = `- Outer item
  - Inner item to delete
  - Another inner item`

    const diff = `--- doc.md
+++ doc.md
@@
 - Outer item
-  - Inner item to delete
+  - Inner item replacement
   - Another inner item`

    const result = Patcher.Apply(diff, [{ Key: 'doc.md', InputFullText: fileContent, InputSelectedText: '' }])

    expect(result.Files[0].Errors.length).toBe(0)
    expect(result.Files[0].OutputFullText).toContain('- Outer item')
    expect(result.Files[0].OutputFullText).toContain('  - Inner item replacement')
    expect(result.Files[0].OutputFullText).not.toContain('Inner item to delete')
  })

  it('handles empty bullet point', () => {
    const fileContent = `-
content after`

    const diff = `--- doc.md
+++ doc.md
@@
 -
-content after
+new content`

    const sanitized = DiffSanitizer.Process(diff)
    const groups = UnifiedDiffParser.Parse(sanitized, new Map([['doc.md', fileContent]]))

    expect(groups.length).toBe(1)
    const hunk = groups[0].Hunks[0]

    expect(hunk.Lines.filter(l => l.Type === LineType.Context).length).toBe(1)
    expect(hunk.Lines.filter(l => l.Type === LineType.Delete).length).toBe(1)
  })

  it('handles list item containing CSS-like content (-webkit-)', () => {
    const fileContent = `- Use -webkit- for Safari
- Old instruction`

    const diff = `--- doc.md
+++ doc.md
@@
 - Use -webkit- for Safari
-- Old instruction
+- New instruction`

    const sanitized = DiffSanitizer.Process(diff)
    const groups = UnifiedDiffParser.Parse(sanitized, new Map([['doc.md', fileContent]]))

    expect(groups.length).toBe(1)
    const hunk = groups[0].Hunks[0]

    expect(hunk.Lines.filter(l => l.Type === LineType.Context).length).toBe(1)
    expect(hunk.Lines.filter(l => l.Type === LineType.Delete).length).toBe(1)
    expect(hunk.Lines.filter(l => l.Type === LineType.Insert).length).toBe(1)
    expect(hunk.OldText).toContain('- Use -webkit- for Safari')
    expect(hunk.NewText).toContain('- Use -webkit- for Safari')
  })

  it('handles task list modification', () => {
    const fileContent = `- [ ] Unchecked task
- [x] Checked task
- [ ] Another task`

    const diff = `--- todo.md
+++ todo.md
@@
-- [ ] Unchecked task
+- [x] Now checked
 - [x] Checked task
 - [ ] Another task`

    const result = Patcher.Apply(diff, [{ Key: 'todo.md', InputFullText: fileContent, InputSelectedText: '' }])

    expect(result.Files[0].Errors.length).toBe(0)
    expect(result.Files[0].OutputFullText).toContain('- [x] Now checked')
    expect(result.Files[0].OutputFullText).not.toContain('Unchecked task')
  })

  it('handles incorrect hunk line counts with list operations', () => {
    // When LLM provides wrong line counts, verify parsing still works
    const fileContent = `- item one
- item two
- item three`

    // Wrong counts: says 3,3 but really 3 deletions, 1 insertion
    const diff = `--- doc.md
+++ doc.md
@@ -1,3 +1,3 @@
-- item one
-- item two
-- item three
+- single replacement`

    const sanitized = DiffSanitizer.Process(diff)
    const groups = UnifiedDiffParser.Parse(sanitized, new Map([['doc.md', fileContent]]))

    const hunk = groups[0].Hunks[0]
    expect(hunk.Lines.filter(l => l.Type === LineType.Delete).length).toBe(3)
    expect(hunk.Lines.filter(l => l.Type === LineType.Insert).length).toBe(1)
  })

  it('recovers when LLM omits context prefix on line starting with +', () => {
    // Similar to the "- list item" case, but for lines starting with "+"
    // e.g., changelog entries like "+ Add new feature"
    // This is potentially WORSE because it causes silent insertion rather than an error
    const fileContent = `Changelog
+ Add new feature
old line`

    const diff = `--- changelog.md
+++ changelog.md
@@ -1,3 +1,3 @@
 Changelog
+ Add new feature
-old line
+new line`

    const result = Patcher.Apply(diff, [{ Key: 'changelog.md', InputFullText: fileContent, InputSelectedText: '' }])

    // DESIRED: patcher recognizes "+ Add new feature" as context and succeeds
    expect(result.Files[0].Errors.length).toBe(0)
    expect(result.Files[0].OutputFullText).toBe(`Changelog
+ Add new feature
new line`)
  })

  it('recovers when LLM omits prefix on multiple consecutive list items', () => {
    // LLM forgets space prefix on ALL context list items
    const fileContent = `- item one
- item two
- item three
old content`

    const diff = `--- doc.md
+++ doc.md
@@
- item one
- item two
- item three
-old content
+new content`

    const result = Patcher.Apply(diff, [{ Key: 'doc.md', InputFullText: fileContent, InputSelectedText: '' }])

    expect(result.Files[0].Errors.length).toBe(0)
    expect(result.Files[0].OutputFullText).toBe(`- item one
- item two
- item three
new content`)
  })

  it('handles ambiguous case: file has both "- item" and " item"', () => {
    // Edge case: file legitimately has both patterns
    // Should default to treating as deletion (conservative)
    const fileContent = `- item
 item
other`

    const diff = `--- doc.md
+++ doc.md
@@
- item
-other
+new`

    // Since file has BOTH "- item" AND " item", it's ambiguous
    // Conservative behavior: treat as deletion of " item"
    const result = Patcher.Apply(diff, [{ Key: 'doc.md', InputFullText: fileContent, InputSelectedText: '' }])

    // This should try to delete " item" which exists, so it should work
    // But the result will be missing " item" from the file
    expect(result.Files[0].Errors.length).toBe(0)
    expect(result.Files[0].OutputFullText).toBe(`- item
new`)
  })

  it('handles embedded diff example in documentation', () => {
    // Documentation file showing diff syntax - LLM forgets context prefix
    const fileContent = `# How to write diffs

\`\`\`diff
- old line
+ new line
\`\`\`

More text here`

    const diff = `--- readme.md
+++ readme.md
@@
 # How to write diffs

 \`\`\`diff
- old line
+ new line
 \`\`\`

-More text here
+Updated text here`

    const result = Patcher.Apply(diff, [{ Key: 'readme.md', InputFullText: fileContent, InputSelectedText: '' }])

    expect(result.Files[0].Errors.length).toBe(0)
    expect(result.Files[0].OutputFullText).toContain('- old line')
    expect(result.Files[0].OutputFullText).toContain('+ new line')
    expect(result.Files[0].OutputFullText).toContain('Updated text here')
  })

  it('handles file with both CSS variables and markdown lists', () => {
    const fileContent = `# Styling Guide

- Use --primary-color for main elements
- Use --secondary-color for accents`

    const diff = `--- doc.md
+++ doc.md
@@ -1,4 +1,4 @@
 # Styling Guide

-- Use --primary-color for main elements
+- Use --brand-color for main elements
 - Use --secondary-color for accents`

    const result = Patcher.Apply(diff, [{ Key: 'doc.md', InputFullText: fileContent, InputSelectedText: '' }])

    expect(result.Files[0].Errors.length).toBe(0)
    expect(result.Files[0].OutputFullText).toContain('--brand-color')
    expect(result.Files[0].OutputFullText).toContain('--secondary-color')
  })
})

describe('Insertion swallowing guard', () => {
  it('does not swallow an insertion whose literal +line already exists as file content', () => {
    // The file documents a diff (contains the literal line "+new line").
    // Inserting the line "new line" must still insert — a content match on the
    // "+"-prefixed form must not flip a real insertion into context.
    const fileContent = `# doc

\`\`\`diff
+new line
\`\`\`
after`

    const diff = `--- readme.md
+++ readme.md
@@ -1,2 +1,3 @@
 # doc
+new line
 
`

    const result = Patcher.Apply(diff, [{ Key: 'readme.md', InputFullText: fileContent, InputSelectedText: '' }])

    expect(result.Files[0].Errors.length).toBe(0)
    const lines = result.Files[0].OutputFullText.split('\n')
    expect(lines[1]).toBe('new line') // inserted after "# doc"
  })
})
