/**
 * Duplicate hunk tests
 *
 * Applier-level duplicates (the same edit expressed differently) are deduped and
 * applied once, silently — no ChunkDuplicated error. The all-or-nothing handling of
 * genuine failures (MatchNotFound etc.) is unaffected.
 */

import { describe, it, expect } from 'vitest'
import { TestHelpers } from '../helpers'
import { Patcher } from '../../dist/index.js'

describe('Duplicate Hunks', () => {
  it('identical hunks are filtered by the parser with no error', () => {
    const original = 'X\nY\nZ\n'
    const patch = `@@ -2,1 +2,1 @@
-Y
+YY
@@ -2,1 +2,1 @@
-Y
+YY
`
    const result = Patcher.Apply(patch, TestHelpers.singleFile(original))
    expect(result.Files[0].OutputFullText).toBe('X\nYY\nZ\n')
    expect(result.Files[0].Errors.length).toBe(0)
  })

  it('identical hunks at distinct line numbers both apply', () => {
    // A file that repeats a pattern gets byte-identical hunks from git,
    // distinguished only by their @@ line numbers (Diff-XYZ corpus case 326).
    const original = 'one\nfoo\ntwo\nthree\nfoo\nfour\n'
    const patch = `@@ -2,1 +2,1 @@
-foo
bar
@@ -5,1 +5,1 @@
-foo
bar
`
    const result = Patcher.Apply(patch, TestHelpers.singleFile(original))
    expect(result.Files[0].OutputFullText).toBe('one\nbar\ntwo\nthree\nbar\nfour\n')
    expect(result.Files[0].Errors.length).toBe(0)
  })

  it('distinct hunks sharing a header line number both apply', () => {
    const original = 'alpha\nbeta\ngamma\ndelta\nepsilon\n'
    const patch = `@@ -1,1 +1,1 @@
-beta
+BETA
@@ -1,1 +1,1 @@
-delta
+DELTA
`
    const result = Patcher.Apply(patch, TestHelpers.singleFile(original))
    expect(result.Files[0].OutputFullText).toBe('alpha\nBETA\ngamma\nDELTA\nepsilon\n')
    expect(result.Files[0].Errors.length).toBe(0)
  })

  it('same edit expressed differently is deduped and applied once', () => {
    const original = 'A\nB\nC\n'
    const patch = `@@ -2,1 +2,1 @@
-B
+BB
@@ -1,3 +1,3 @@
 A
-B
+BB
 C
`
    const result = Patcher.Apply(patch, TestHelpers.singleFile(original))
    // Both chunks resolve to one anchor+delete+insert key; the applier drops the
    // duplicate and applies the edit once, silently — no error.
    expect(result.Files[0].OutputFullText).toBe('A\nBB\nC\n')
    expect(result.Files[0].Errors.length).toBe(0)
  })
})
