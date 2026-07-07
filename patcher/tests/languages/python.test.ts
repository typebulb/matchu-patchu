/**
 * Python torture suite
 *
 * Python's hazards for a fuzzy patcher: `#` comments colliding with LLM
 * annotations, semantically-meaningful indentation (zero slack for indent
 * mistakes), and decorator lines that superficially resemble hunk headers.
 */

import { describe, it, expect } from 'vitest'
import { TestHelpers } from '../helpers'
import { Patcher } from '../../dist/index.js'

const pyFile = (content: string) => [{ Key: '', InputFullText: content, InputSelectedText: '' }]

describe('Python torture', () => {
  it('modifies code with # comments as context and in the change', () => {
    const original = `# setup
total = 0
for x in items:
    total += x  # accumulate
`
    const patch = `@@ -1,4 +1,4 @@
 # setup
 total = 0
 for x in items:
-    total += x  # accumulate
+    total += x * 2  # accumulate doubled
`
    const expected = `# setup
total = 0
for x in items:
    total += x * 2  # accumulate doubled
`
    TestHelpers.assertApply(original, patch, expected)
  })

  it('raw deletion line carrying an LLM # annotation is verified against the file', () => {
    const original = `x = 1
y = 2
`
    const patch = `@@ -1,2 +1,2 @@
x = 1  # old value
+x = 10
 y = 2
`
    const expected = `x = 10
y = 2
`
    TestHelpers.assertApply(original, patch, expected)
  })

  it('does not strip # when the annotated line is real file content', () => {
    const original = `x = 1  # old value
y = 2
`
    const patch = `@@ -1,2 +1,2 @@
-x = 1  # old value
+x = 10  # new value
 y = 2
`
    const expected = `x = 10  # new value
y = 2
`
    TestHelpers.assertApply(original, patch, expected)
  })

  it('headerless: rescues missing context prefix on a # comment line', () => {
    const original = `# configuration
DEBUG = False
`
    const patch = `@@ -1,2 +1,2 @@
 # configuration
-DEBUG = False
+DEBUG = True
`
    const expected = `# configuration
DEBUG = True
`
    TestHelpers.assertApply(original, patch, expected)
  })

  it('indent-only change survives exactly (semantic indentation)', () => {
    const original = `def f():
    if cond:
        do_a()
    do_b()
`
    const patch = `@@ -1,4 +1,4 @@
 def f():
     if cond:
         do_a()
-    do_b()
+        do_b()
`
    const expected = `def f():
    if cond:
        do_a()
        do_b()
`
    TestHelpers.assertApply(original, patch, expected)
  })

  it('decorator lines are not mistaken for hunk headers', () => {
    const original = `class C:
    @property
    def value(self):
        return self._v
`
    const patch = `@@ -1,4 +1,4 @@
 class C:
     @property
     def value(self):
-        return self._v
+        return self._v or 0
`
    const expected = `class C:
    @property
    def value(self):
        return self._v or 0
`
    TestHelpers.assertApply(original, patch, expected)
  })

  it('uniformly indented diff body against Python (indent must round-trip)', () => {
    const original = `def g():
    return 1
`
    const patch = `@@ -1,2 +1,2 @@
     def g():
    -    return 1
    +    return 2
`
    const expected = `def g():
    return 2
`
    TestHelpers.assertApply(original, patch, expected)
  })

  it('insert into empty .py file at OldStart=1', () => {
    const original = ``
    const patch = `@@ -1,0 +1,2 @@
+import sys
+print(sys.argv)
`
    const expected = `import sys
print(sys.argv)
`
    TestHelpers.assertApply(original, patch, expected)
  })

  it('markdown bullets inside a docstring are preserved as context', () => {
    const original = `def h():
    """Steps:
    - first
    - second
    """
    return None
`
    const patch = `@@ -1,6 +1,6 @@
 def h():
     """Steps:
     - first
     - second
     """
-    return None
+    return 42
`
    const expected = `def h():
    """Steps:
    - first
    - second
    """
    return 42
`
    TestHelpers.assertApply(original, patch, expected)
  })
})
