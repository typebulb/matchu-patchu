/**
 * Multi-file operation tests
 * Tests delete, new file, and rename operations
 * 
 * Whitespace markers:
 * · (U+00B7) = space
 * → (U+2192) = tab
 */

import { describe, it, expect } from 'vitest'
import { TestHelpers } from '../helpers'
import { Patcher } from '../../dist/index.js'

describe('Multi-file Operations', () => {
  it('should handle multi-file delete', () => {
    const original = `using·System;

namespace·Samples
{
····public·static·class·HelloWorld
····{
········public·static·void·SayHello()·=>·Console.WriteLine("Hello·World!");
····}
}
`
    const patch = `diff·--git·a/HelloWorld.cs·b/HelloWorld.cs
@@ -1,8 +0,0 @@
-using·System;
-
-namespace·Samples
-{
-····public·static·class·HelloWorld
-····{
-········public·static·void·SayHello()·=>·Console.WriteLine("Hello·World!");
-····}
-}
`
    const expected = ''
    TestHelpers.assertApply(original, patch, expected)
  })

  it('should handle multi-file new file', () => {
    const original = ''
    const patch = `diff·--git·a/New.txt·b/New.txt
new·file·mode·100644
index·0000000..e69de29
---·/dev/null
+++·b/New.txt
@@ -0,0 +1,2 @@
+Line1
+Line2
`
    const expected = `Line1
Line2
`
    TestHelpers.assertApply(original, patch, expected)
  })

  it('should handle multi-file rename', () => {
    const original = `class·C·{}
`
    const patch = `diff·--git·a/Old.cs·b/New.cs
rename·from·Old.cs
rename·to·New.cs
---·a/Old.cs
+++·b/New.cs
@@ -1 +1 @@
-class·C·{}
+class·C_Renamed·{}
`
    const expected = `class·C_Renamed·{}
`
    TestHelpers.assertApply(original, patch, expected)
  })

  it('should handle file deletion via unified diff', () => {
    const original = `using·System;

namespace·Samples
{
····public·static·class·HelloWorld
····{
········public·static·void·SayHello()·=>·Console.WriteLine("Hello·World!");
····}
}
`
    const patch = `diff·--git·a/HelloWorld.cs·b/HelloWorld.cs
@@ -1,8 +0,0 @@
-using·System;
-
-namespace·Samples
-{
-····public·static·class·HelloWorld
-····{
-········public·static·void·SayHello()·=>·Console.WriteLine("Hello·World!");
-····}
-}
`
    const result = Patcher.Apply(patch, TestHelpers.singleFile(original))
    expect(result.Files[0].OutputFullText).toBe('')
  })
})

