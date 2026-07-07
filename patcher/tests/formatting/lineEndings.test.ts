/**
 * Line ending tests
 * Tests CRLF, LF, BOM, and files without trailing newlines
 */

import { describe, it } from 'vitest'
import { TestHelpers } from '../helpers'

describe('Line Endings', () => {
  it('should preserve mixed line endings', () => {
    const original = 'Line1\r\nLine2\nLine3\r\nLine4\n'
    const patch = `@@ -1,4 +1,5 @@
 Line1
 Line2
+Line2.5
 Line3
 Line4
`
    const expected = 'Line1\r\nLine2\nLine2.5\nLine3\r\nLine4\n'
    TestHelpers.assertApply(original, patch, expected, null, false)
  })

  it('should preserve CRLF line endings', () => {
    const original = 'Line1\r\nLine2\r\n'
    const patch = `@@ -1,2 +1,2 @@
 Line1
-Line2
+Line2-Modified
`
    const expected = 'Line1\r\nLine2-Modified\r\n'
    TestHelpers.assertApply(original, patch, expected, null, false)
  })

  it('should handle file without trailing newline', () => {
    const original = 'Line1'
    const patch = `@@ -1 +1,2 @@
-Line1
+Line1
+Line2
`
    const expected = `Line1
Line2
`
    TestHelpers.assertApply(original, patch, expected, null, false)
  })

  it('should preserve BOM during patch', () => {
    const original = '\uFEFFLine1\nLine2\n'
    const patch = `@@ -2 +2 @@
-Line2
+Line2Modified
`
    const expected = '\uFEFFLine1\nLine2Modified\n'
    TestHelpers.assertApply(original, patch, expected, null, false)
  })
})

