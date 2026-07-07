/**
 * BacktickSanitizer Tests
 * 
 * Tests normalization of malformed code fence syntax.
 */

import { describe, it, expect } from 'vitest'
import { DiffSanitizer } from '../../dist/parser/diffSanitizer.js'

describe('BacktickSanitizer', () => {
  it('normalizes quadruple backticks to triple', () => {
    const diff = `\`\`\`\`diff
--- file.txt
+++ file.txt
@@ -1 +1 @@
-old
+new
\`\`\`\``

    const sanitized = DiffSanitizer.Process(diff)
    
    expect(sanitized).toContain('```diff')
    expect(sanitized).not.toContain('````diff')
    expect(sanitized.match(/```$/gm)?.length).toBe(1) // Only one closing fence
  })

  it('normalizes space before diff keyword', () => {
    const diff = `\`\`\` diff
--- file.txt
+++ file.txt
@@ -1 +1 @@
-old
+new
\`\`\``

    const sanitized = DiffSanitizer.Process(diff)
    
    expect(sanitized).toContain('```diff')
    expect(sanitized).not.toContain('``` diff')
  })

  it('normalizes case-insensitive DIFF keyword', () => {
    const diff = `\`\`\`DIFF
--- file.txt
+++ file.txt
@@ -1 +1 @@
-old
+new
\`\`\``

    const sanitized = DiffSanitizer.Process(diff)
    
    expect(sanitized).toContain('```diff')
    expect(sanitized).not.toContain('```DIFF')
  })

  it('normalizes multiple backticks at closing fence', () => {
    const diff = `\`\`\`diff
--- file.txt
+++ file.txt
@@ -1 +1 @@
-old
+new
\`\`\`\`\``

    const sanitized = DiffSanitizer.Process(diff)
    
    const closingFences = sanitized.match(/```$/gm)
    expect(closingFences?.length).toBe(1)
    expect(closingFences?.[0]).toBe('```')
  })

  it('handles mixed malformations', () => {
    const diff = `\`\`\`\` DIFF
--- file.txt
+++ file.txt
@@ -1 +1 @@
-old
+new
\`\`\`\`\`\``

    const sanitized = DiffSanitizer.Process(diff)
    
    expect(sanitized).toContain('```diff')
    expect(sanitized.match(/```$/gm)?.length).toBe(1)
  })

  it('preserves normal fences', () => {
    const diff = `\`\`\`diff
--- file.txt
+++ file.txt
@@ -1 +1 @@
-old
+new
\`\`\``

    const original = diff
    const sanitized = DiffSanitizer.Process(diff)
    
    expect(sanitized).toBe(original)
  })
})

