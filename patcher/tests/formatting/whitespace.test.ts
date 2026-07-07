/**
 * Whitespace handling tests
 * Tests trailing whitespace, tabs, and fuzzy matching
 * 
 * Whitespace markers:
 * · (U+00B7) = space
 * → (U+2192) = tab
 */

import { describe, it } from 'vitest'
import { TestHelpers } from '../helpers'

describe('Whitespace Handling', () => {
  it('should tolerate trailing whitespace', () => {
    const original = `A
B···
C
`
    const patch = `@@ -1,3 +1,3 @@
·A
-B···
+B!!!
·C
`
    const expected = `A
B!!!
C
`
    TestHelpers.assertApply(original, patch, expected)
  })

  it('should handle enhanced whitespace', () => {
    const original = `class·Test
{
····void·Method()
····{
········var·x·=·1;
····}
}
`
    const patch = `@@ -1,7 +1,7 @@
·class·Test
·{
-····void·Method()
-····{
-········var·x·=·1;
-····}
+····void·Method()
+····{
+········var·x·=·1;
+········var·y·=·2;
+····}
·}
`
    const expected = `class·Test
{
····void·Method()
····{
········var·x·=·1;
········var·y·=·2;
····}
}
`
    TestHelpers.assertApply(original, patch, expected)
  })

  it('should handle fuzzy matching with whitespace differences', () => {
    // Indent shape: Line1 (0 spaces), Line2 (2 spaces + trailing), Line3 (0 spaces)
    const original = `Line1
··Line2··
Line3
`
    const patch = `@@ -1,3 +1,3 @@
·Line1
-Line2
+Line2Modified
·Line3
`
    // Fuzzy matching: patch says Line2Modified with 0 spaces, so that's what's used
    const expected = `Line1
Line2Modified
Line3
`
    TestHelpers.assertApply(original, patch, expected)
  })
})

