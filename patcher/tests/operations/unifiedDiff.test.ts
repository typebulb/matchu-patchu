/**
 * Unified Diff Format (UDF) tests
 * Tests various UDF format variations and edge cases
 * 
 * Whitespace markers:
 * · (U+00B7) = space
 * → (U+2192) = tab
 */

import { describe, it } from 'vitest'
import { TestHelpers } from '../helpers'

describe('Unified Diff Format', () => {
  it('should handle calculator add multiply', () => {
    const original = `using·System;

namespace·Samples
{
····public·static·class·Calculator
····{
········public·static·int·Add(int·a,·int·b)·=>·a·+·b;

········public·static·int·Subtract(int·a,·int·b)·=>·a·-·b;
····}
}
`
    const patch = `diff·--git·a/Calculator.cs·b/Calculator.cs
@@ -7,3 +7,7 @@
-········public·static·int·Add(int·a,·int·b)·=>·a·+·b;
-
-········public·static·int·Subtract(int·a,·int·b)·=>·a·-·b;
+········public·static·int·Add(int·a,·int·b)
+········{
+············return·a·+·b;
+········}
+
+········public·static·int·Subtract(int·a,·int·b)·=>·a·-·b;
+········public·static·int·Multiply(int·a,·int·b)·=>·a·*·b;
`
    const expected = `using·System;

namespace·Samples
{
····public·static·class·Calculator
····{
········public·static·int·Add(int·a,·int·b)
········{
············return·a·+·b;
········}

········public·static·int·Subtract(int·a,·int·b)·=>·a·-·b;
········public·static·int·Multiply(int·a,·int·b)·=>·a·*·b;
····}
}
`
    TestHelpers.assertApply(original, patch, expected)
  })

  it('should handle header without counts', () => {
    const original = `using·System;

namespace·Samples
{
····internal·class·Program
····{
········static·void·Main()
········{
············Console.WriteLine("Hello·World!");
········}
····}
}
`
    const patch = `diff·--git·a/Program.cs·b/Program.cs
@@ -9 +9 @@
-············Console.WriteLine("Hello·World!");
+············Console.WriteLine("Hi·World!");
`
    const expected = `using·System;

namespace·Samples
{
····internal·class·Program
····{
········static·void·Main()
········{
············Console.WriteLine("Hi·World!");
········}
····}
}
`
    TestHelpers.assertApply(original, patch, expected)
  })

  it('should ignore diff file headers', () => {
    const original = `A
B
C
`
    const patch = `diff·--git·a/Test.txt·b/Test.txt
index·1234567..89abcd·100644
---·a/Test.txt
+++·b/Test.txt
@@ -2,1 +2,1 @@
·B
-B
+BB
`
    const expected = `A
BB
C
`
    TestHelpers.assertApply(original, patch, expected)
  })

  it('should handle header with counts', () => {
    const original = `A
B
C
D
`
    const patch = `@@ -2,2 +2,3 @@
·B
-C
+C1
+C2
·D
`
    const expected = `A
B
C1
C2
D
`
    TestHelpers.assertApply(original, patch, expected)
  })

  it('should handle old count only', () => {
    const original = `A
B
C
D
`
    const patch = `@@ -2,2 +2 @@
·B
-C
+CC
·D
`
    const expected = `A
B
CC
D
`
    TestHelpers.assertApply(original, patch, expected)
  })

  it('should ignore git metadata', () => {
    const original = `X
`
    const patch = `diff·--git·a/X.cs·b/X.cs
index·1234abc..5678def·100644
---·a/X.cs
+++·b/X.cs
@@ -1 +1 @@
-X
+Y
`
    const expected = `Y
`
    TestHelpers.assertApply(original, patch, expected)
  })

  it('should handle Slack-style unified diff', () => {
    const original = `X
Y
Z
`
    const patch = `@@ -2,1 +2,1 @@
-Y
+Y1
`
    const expected = `X
Y1
Z
`
    TestHelpers.assertApply(original, patch, expected)
  })

  it('should ignore mode change', () => {
    const original = `class·C·{}
`
    const patch = `diff·--git·a/C.cs·b/C.cs
old·mode·100644
new·mode·100755
---·a/C.cs
+++·b/C.cs
@@ -1 +1 @@
-class·C·{}
+class·C·{}
`
    const expected = `class·C·{}
`
    TestHelpers.assertApply(original, patch, expected)
  })
})

