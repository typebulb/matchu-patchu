/**
 * Edit-reporting fidelity tests
 *
 * The Edits array must faithfully describe every change, including indent-only
 * ones — indentation is semantic in Python/YAML, and diff formatters that
 * consume Edits rely on exact round-tripping.
 */

import { describe, it, expect } from 'vitest'
import { TestHelpers } from '../helpers'
import { Patcher } from '../../dist/index.js'

describe('Edit Reporting', () => {
  it('reports an indent-only change in Edits', () => {
    const original = 'A\n  B\nC\n'
    const patch = `@@ -1,3 +1,3 @@
 A
-  B
+    B
 C
`
    const result = Patcher.Apply(patch, TestHelpers.singleFile(original))
    expect(result.Files[0].Errors.length).toBe(0)
    expect(result.Files[0].OutputFullText).toBe('A\n    B\nC\n')

    const edits = result.Files[0].Edits
    expect(edits.length).toBe(1)
    expect(edits[0].DeleteLines).toEqual(['  B'])
    expect(edits[0].InsertLines).toEqual(['    B'])
  })

  // The two zero-edit shapes are distinguishable via AlreadyAppliedCount: a chunk
  // dropped because the file already reflects it reports the count; a patch whose
  // hunks change nothing reports zero. The MCP-layer message split relies on this.
  it('already-applied patch reports AlreadyAppliedCount', () => {
    const original = 'alpha\ncount = 2;\nomega\n'
    const patch = `@@ -1,3 +1,3 @@
 alpha
-count = 1;
count = 2;
 omega
`
    const result = Patcher.Apply(patch, TestHelpers.singleFile(original))
    const file = result.Files[0]

    expect(file.Errors.length).toBe(0)
    expect(file.Edits.length).toBe(0)
    expect(file.AlreadyAppliedCount).toBe(1)
    expect(file.OutputFullText).toBe(original)
  })

  it('no-op patch reports zero AlreadyAppliedCount', () => {
    const original = 'alpha\ncount = 2;\nomega\n'
    const patch = `@@ -2,1 +2,1 @@
-count = 2;
count = 2;
`
    const result = Patcher.Apply(patch, TestHelpers.singleFile(original))
    const file = result.Files[0]

    expect(file.Errors.length).toBe(0)
    expect(file.Edits.length).toBe(0)
    expect(file.AlreadyAppliedCount).toBe(0)
  })
})
