/**
 * Invisibles-tolerant match tier (fuzz 300) unit + end-to-end tests.
 * Suspect chars are built from numeric code points so this file survives
 * tool-call boundaries.
 */

import { describe, it, expect } from 'vitest'
import { Search } from '../../dist/anchorer/search.js'
import { TestHelpers } from '../helpers'
import { TextUtils } from '../../dist/utils/textUtils.js'
import { Patcher } from '../../dist/index.js'

const zwsp = String.fromCharCode(0x200b)
const rlo = String.fromCharCode(0x202e)

describe('Invisibles-tolerant matching', () => {
  it('StripInvisibles removes zero-width and bidi, keeps tab', () => {
    expect(TextUtils.StripInvisibles(`a${zwsp}b\tc${rlo}`)).toBe('ab\tc')
    expect(TextUtils.StripInvisibles('plain')).toBe('plain')
  })

  it('invisible in haystack, clean needle: matches with fuzz 300', () => {
    const hay = ['A', `foo(${zwsp}bar);`, 'C']
    const needle = ['foo(bar);']

    const result = Search.Find(hay, needle)

    expect(result.LineIndex).toBe(1)
    expect(result.Fuzz).toBe(300)
  })

  it('invisible in needle, clean haystack: matches with fuzz 300', () => {
    const hay = ['A', 'foo(bar);', 'C']
    const needle = [`foo(${zwsp}bar);`]

    const result = Search.Find(hay, needle)

    expect(result.LineIndex).toBe(1)
    expect(result.Fuzz).toBe(300)
  })

  it('exact match preferred over invisibles match', () => {
    const hay = [`foo(${zwsp}bar);`, 'B', 'foo(bar);']
    const needle = ['foo(bar);']

    const result = Search.Find(hay, needle)

    expect(result.LineIndex).toBe(2)
    expect(result.Fuzz).toBe(0)
  })

  it('capped at 100: excludes the invisibles pass', () => {
    const hay = ['A', `foo(${zwsp}bar);`, 'C']
    const needle = ['foo(bar);']

    const result = Search.Find(hay, needle, 0, 100)

    expect(result.LineIndex).toBe(-1)
  })

  // The motivating end-to-end case: the file contains an invisible the patch
  // author cannot see (or transmit) — the delete line still anchors and the
  // replacement applies instead of MatchNotFound.
  it('file line has invisible, clean delete line: applies', () => {
    const original = `alpha\nfoo(${zwsp}bar);\nomega\n`
    const patch = `@@ -1,3 +1,3 @@
 alpha
-foo(bar);
+foo(baz);
 omega
`

    const file = Patcher.Apply(patch, TestHelpers.singleFile(original)).Files[0]

    expect(file.Errors.length).toBe(0)
    expect(file.OutputFullText).toBe('alpha\nfoo(baz);\nomega\n')
    expect(file.Fuzz).toBeGreaterThan(0)
  })
})
