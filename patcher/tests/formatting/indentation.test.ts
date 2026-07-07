/**
 * Indentation tests
 * Tests tabs, spaces, mixed indentation, and Python-style code
 * 
 * Whitespace markers:
 * · (U+00B7) = space
 * → (U+2192) = tab
 */

import { describe, it } from 'vitest'
import { TestHelpers } from '../helpers'

describe('Indentation', () => {
  it('should handle tab-indented code modification', () => {
    const original = `function·test()·{
→return·42;
}
`
    const patch = `@@ -1,2 +1,2 @@
·function·test()·{
-→return·42;
+→return·43;
·}
`
    const expected = `function·test()·{
→return·43;
}
`
    TestHelpers.assertApply(original, patch, expected)
  })

  it('should handle mixed tabs and spaces', () => {
    const original = `class·Example
{
→void·Method()
→{
→→var·x·=·1;
→}
}
`
    const patch = `@@ -1,6 +1,7 @@
·class·Example
·{
·→void·Method()
·→{
·→→var·x·=·1;
+→→var·y·=·2;
·→}
·}
`
    const expected = `class·Example
{
→void·Method()
→{
→→var·x·=·1;
→→var·y·=·2;
→}
}
`
    TestHelpers.assertApply(original, patch, expected)
  })

  it('should handle tab-indented C# code', () => {
    const original = `public·class·Test
{
→void·Method()
→{
→→var·x·=·1;
→}
}
`
    const patch = `@@ -1,7 +1,7 @@
·public·class·Test
·{
-→void·Method()
-→{
-→→var·x·=·1;
-→}
+→void·Method()
+→{
+→→var·x·=·1;
+→→var·y·=·2;
+→}
·}
`
    const expected = `public·class·Test
{
→void·Method()
→{
→→var·x·=·1;
→→var·y·=·2;
→}
}
`
    TestHelpers.assertApply(original, patch, expected)
  })

  it('should handle nested code blocks', () => {
    const original = `function·test()·{
····if·(true)·{
········console.log('nested');
····}
}
`
    const patch = `@@ -1,5 +1,6 @@
·function·test()·{
·····if·(true)·{
-········console.log('nested');
+········console.log('nested');
+········console.log('more');
·····}
·}
`
    const expected = `function·test()·{
····if·(true)·{
········console.log('nested');
········console.log('more');
····}
}
`
    TestHelpers.assertApply(original, patch, expected)
  })

  it('should honor a deliberate tab-to-spaces reindent at equal visual width', () => {
    const original = `→root();
→if·(x)·{
→→nested();
`
    const patch = `@@ -1,3 +1,3 @@
·→root();
-→if·(x)·{
+····if·(x)·{
·→→nested();
`
    const expected = `→root();
····if·(x)·{
→→nested();
`
    TestHelpers.assertApply(original, patch, expected)
  })

  it('should normalize a tab-styled new line to spaces in a spaces file', () => {
    const original = `if·(a)·{
····one();
}
`
    const patch = `@@ -1,3 +1,4 @@
·if·(a)·{
·····one();
+→two();
·}
`
    const expected = `if·(a)·{
····one();
····two();
}
`
    TestHelpers.assertApply(original, patch, expected)
  })

  it('should handle Python-style no-brace indenting', () => {
    const original = `def·calculate():
····x·=·1
····y·=·2
····return·x·+·y
`
    const patch = `@@ -1,4 +1,5 @@
·def·calculate():
·····x·=·1
·····y·=·2
+····z·=·3
·····return·x·+·y
`
    const expected = `def·calculate():
····x·=·1
····y·=·2
····z·=·3
····return·x·+·y
`
    TestHelpers.assertApply(original, patch, expected)
  })
})

