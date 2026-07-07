/**
 * Canonical/fullwidth match tier (fuzz 400) unit + end-to-end tests.
 * When a needle and a file line differ only by NFC canonical equivalence or
 * fullwidth ASCII forms (U+FF01..U+FF5E), matching succeeds instead of erroring;
 * the NFKC compat remainder (ligatures, superscripts) stays unfolded.
 * Suspect chars are built from numeric code points so this file survives
 * tool-call boundaries.
 */

import { describe, it, expect } from 'vitest'
import { Search } from '../../dist/anchorer/search.js'
import { TestHelpers } from '../helpers'
import { TextUtils } from '../../dist/utils/textUtils.js'
import { Patcher } from '../../dist/index.js'

const fwB = String.fromCharCode(0xff42)        // fullwidth 'b'
const composedE = String.fromCharCode(0xe9)    // precomposed e-acute
const decomposedE = 'e' + String.fromCharCode(0x301) // e + combining acute

describe('Canonical/fullwidth-tolerant matching', () => {
  it('Fold maps fullwidth and composes NFC, leaves compat remainder', () => {
    expect(TextUtils.FoldCanonicalAndFullwidth(`foo(${fwB}ar);`)).toBe('foo(bar);')
    expect(TextUtils.FoldCanonicalAndFullwidth(`caf${decomposedE}`)).toBe(`caf${composedE}`)

    // Compat remainder: fi-ligature (>= U+0300, so the slow path runs) survives.
    const ligature = String.fromCharCode(0xfb01)
    expect(TextUtils.FoldCanonicalAndFullwidth(`${ligature}le`)).toBe(`${ligature}le`)
  })

  it('Fold returns line unchanged on unpaired surrogate, no throw', () => {
    const lone = String.fromCharCode(0xd800)
    const line = `caf${decomposedE}${lone}`
    expect(TextUtils.FoldCanonicalAndFullwidth(line)).toBe(line)
  })

  it('fullwidth in haystack, clean needle: matches with fuzz 400', () => {
    const hay = ['A', `foo(${fwB}ar);`, 'C']
    const needle = ['foo(bar);']

    const result = Search.Find(hay, needle)

    expect(result.LineIndex).toBe(1)
    expect(result.Fuzz).toBe(400)
  })

  it('decomposed in haystack, composed needle: matches with fuzz 400', () => {
    const hay = ['A', `var caf${decomposedE} = 1;`, 'C']
    const needle = [`var caf${composedE} = 1;`]

    const result = Search.Find(hay, needle)

    expect(result.LineIndex).toBe(1)
    expect(result.Fuzz).toBe(400)
  })

  it('exact match preferred over canonical match', () => {
    const hay = [`foo(${fwB}ar);`, 'B', 'foo(bar);']
    const needle = ['foo(bar);']

    const result = Search.Find(hay, needle)

    expect(result.LineIndex).toBe(2)
    expect(result.Fuzz).toBe(0)
  })

  it('capped below 400: excludes the canonical pass', () => {
    const hay = ['A', `foo(${fwB}ar);`, 'C']
    const needle = ['foo(bar);']

    const result = Search.Find(hay, needle, 0, 300)

    expect(result.LineIndex).toBe(-1)
  })

  it('ligature line does not match ASCII needle', () => {
    const hay = [`${String.fromCharCode(0xfb01)}le();`]
    const needle = ['file();']

    expect(Search.Find(hay, needle).LineIndex).toBe(-1)
  })

  // The motivating end-to-end case: a fullwidth lookalike in the file (IME slip,
  // CJK-adjacent source) — the clean delete line still anchors and the replacement
  // applies instead of MatchNotFound.
  it('file line has fullwidth, clean delete line: applies', () => {
    const original = `alpha\nfoo(${fwB}ar);\nomega\n`
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
