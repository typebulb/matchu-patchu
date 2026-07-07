/**
 * Context matching tests
 * Tests matching with drift and reanchoring
 */

import { describe, it } from 'vitest'
import { TestHelpers } from '../helpers'

describe('Context Matching', () => {
  it('should handle context matching with drift', () => {
    const original = `Start
Line2
Line3
Target
Line5
End
`
    const patch = `@@ -10,3 +10,3 @@
 Line2
 Line3
-Target
+Modified
 Line5
`
    const expected = `Start
Line2
Line3
Modified
Line5
End
`
    TestHelpers.assertApply(original, patch, expected)
  })

  it('should handle context drift with reanchoring', () => {
    const original = `// Some file header comments
// More comments
ActualCode1
ActualCode2
ActualCode3
`
    const patch = `@@ -100,3 +100,3 @@
·ActualCode1
-ActualCode2
+ActualCode2_Modified
·ActualCode3
`
    const expected = `// Some file header comments
// More comments
ActualCode1
ActualCode2_Modified
ActualCode3
`
    TestHelpers.assertApply(original, patch, expected)
  })

  it('should handle no context lines', () => {
    const original = `A
B
C
`
    const patch = `@@ -2 +2 @@
-B
+B2
`
    const expected = `A
B2
C
`
    TestHelpers.assertApply(original, patch, expected)
  })

  it('should handle split hunk behavior', () => {
    const original = `Line1
Line2
Line3
Line4
Line5
`
    const patch = `@@ -2 +2 @@
-Line2
+NewLine2

@@ -4 +4 @@
-Line4
+NewLine4
`
    const expected = `Line1
NewLine2
Line3
NewLine4
Line5
`
    TestHelpers.assertApply(original, patch, expected)
  })

  it('REGRESSION: pure insert into empty file should NOT add leading blank line', () => {
    // Bug: OldStart from diff header (1-based) was used as 0-based index
    // For empty file, ToLines('') returns [''] (array with one empty string)
    // Using OldStart=1 as index inserted content AFTER the empty string
    // Result: ['', 'content'] -> '\ncontent' (leading newline!)
    const original = ''
    const patch = `@@ -1,0 +1,1 @@
+<div id="root"></div>
`
    const expected = `<div id="root"></div>
`
    TestHelpers.assertApply(original, patch, expected)
  })

  it('REGRESSION: pure insert at line 1 of empty file - multi-line content', () => {
    // Same bug with multi-line insert
    const original = ''
    const patch = `@@ -1,0 +1,3 @@
+line1
+line2
+line3
`
    const expected = `line1
line2
line3
`
    TestHelpers.assertApply(original, patch, expected)
  })
})

