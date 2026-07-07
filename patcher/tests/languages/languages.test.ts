/**
 * Language-neutral coverage
 * F# syntax and Unicode-content torture cases.
 */

import { describe, it } from 'vitest'
import { TestHelpers } from '../helpers'

describe('Languages', () => {
  it('F# syntax is language-neutral', () => {
    const original = `let x = 1
printfn "%d" x
`
    const patch = `@@ -1 +1 @@
-let x = 1
+let x = 2
`
    const expected = `let x = 2
printfn "%d" x
`
    TestHelpers.assertApply(original, patch, expected)
  })

  it('Unicode content works', () => {
    const original = `µ
λ
`
    const patch = `@@ -2,1 +2,1 @@
 λ
-λ
+Λ
`
    const expected = `µ
Λ
`
    TestHelpers.assertApply(original, patch, expected)
  })
})
