/**
 * Edge case tests
 * Tests unusual scenarios and error handling
 */

import { describe, it, expect } from 'vitest'
import { TestHelpers } from '../helpers'
import { Patcher } from '../../dist/index.js'

describe('Edge Cases', () => {
  it('should handle single line modification', () => {
    const original = 'OldLine'
    const patch = `@@ -1 +1 @@
-OldLine
+NewLine
`
    const expected = `NewLine
`
    TestHelpers.assertApply(original, patch, expected, null, false)
  })

  it('should ignore duplicate hunks', () => {
    const original = `A
B
C
`
    const patch = `@@ -2,1 +2,1 @@
-B
+X

@@ -2,1 +2,1 @@
-B
+X
`
    const expected = `A
X
C
`
    TestHelpers.assertApply(original, patch, expected)
  })

  it('should handle no-op patch already applied', () => {
    const original = `Line1
NewLine2
Line3
`
    const patch = `@@ -1,3 +1,3 @@
 Line1
-Line2
+NewLine2
 Line3
`
    const expected = `Line1
NewLine2
Line3
`
    TestHelpers.assertApply(original, patch, expected)
  })

  it('should report error on multi-hunk partial match', () => {
    const original = `A
B
C
`
    const patch = `@@ -2,1 +2,1 @@
 B
-B
+X

@@ -4,1 +4,1 @@
 C
-Z
+Y
`
    const files = TestHelpers.singleFile(original)
    const outcome = Patcher.Apply(patch, files)
    
    expect(outcome.Files[0].Errors.length).toBeGreaterThan(0)
    expect(outcome.Files[0].Errors[0].Type).toBe('MatchNotFound')
  })

  it('should handle file ending with empty line', () => {
    const original = `Line1
Line2

`
    const patch = `@@ -2 +2 @@
-Line2
+Line2Modified
`
    const expected = `Line1
Line2Modified

`
    TestHelpers.assertApply(original, patch, expected)
  })

  it('should preserve trailing empty line', () => {
    const original = `Content

`
    const patch = `@@ -1 +1 @@
-Content
+NewContent
`
    const expected = `NewContent

`
    TestHelpers.assertApply(original, patch, expected)
  })

  it('should handle duplicate hunks with identical changes', () => {
    const original = `A
B
C
`
    const patch = `@@ -2 +2 @@
-B
+B_NEW

@@ -2 +2 @@
-B
+B_NEW
`
    const expected = `A
B_NEW
C
`
    TestHelpers.assertApply(original, patch, expected)
  })

  it('should handle non-overlapping sequential edits', () => {
    const original = `Line1
Line2
Line3
Line4
`
    const patch = `@@ -1 +1 @@
-Line1
+MOD1

@@ -3 +3 @@
-Line3
+MOD3
`
    const expected = `MOD1
Line2
MOD3
Line4
`
    TestHelpers.assertApply(original, patch, expected)
  })

  // Targeted test: bare @@ with pure inserts should produce valid LineIndex
  it('should apply pure inserts with bare @@ (no line numbers)', () => {
    const original = 'existing line\n'
    const patch = `@@
+inserted line
`
    const expected = `inserted line
existing line
`
    // Pure inserts with bare @@ should insert at line 0 (beginning of file)
    TestHelpers.assertApply(original, patch, expected)
  })
})