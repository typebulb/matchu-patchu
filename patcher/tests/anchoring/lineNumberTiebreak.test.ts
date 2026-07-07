/**
 * Line-number tiebreak tests
 *
 * When context growth and coalescing fail to produce a unique anchor, the @@ header's
 * line number resolves the ambiguity — but only when exact or 10x closer than the runner-up.
 */

import { describe, it, expect } from 'vitest'
import { TestHelpers } from '../helpers'
import { Patcher } from '../../dist/index.js'

function repeatLines(line: string, count: number): string {
  let s = ''
  for (let i = 0; i < count; i++) s += line + '\n'
  return s
}

describe('Line Number Tiebreak', () => {
  it('resolves pure insert into identical lines', () => {
    // 1000 identical lines; insert a distinct line at position 500.
    const original = repeatLines('X', 1000)
    const patch = `@@ -500,2 +500,3 @@
 X
+Y
 X
`
    const result = Patcher.Apply(patch, TestHelpers.singleFile(original))
    expect(result.Files[0].Errors.length).toBe(0)

    const outputLines = result.Files[0].OutputFullText.split('\n')
    expect(outputLines[500]).toBe('Y')
    expect(outputLines.length - 1).toBe(1001) // -1 for trailing empty
  })

  it('resolves replace in identical lines via exact match', () => {
    // 1000 identical lines; replace one of them at the line indicated by the header.
    // With every line a candidate, the gap between candidates is 1, so the
    // tiebreaker should succeed ONLY via exact match.
    const original = repeatLines('X', 1000)
    const patch = `@@ -500,1 +500,1 @@
-X
+Y
`
    const result = Patcher.Apply(patch, TestHelpers.singleFile(original))
    expect(result.Files[0].Errors.length).toBe(0)

    const outputLines = result.Files[0].OutputFullText.split('\n')
    expect(outputLines[499]).toBe('Y') // 1-based 500 -> 0-based 499
    expect(outputLines[498]).toBe('X')
    expect(outputLines[500]).toBe('X')
  })

  it('resolves with inaccurate line number when the gap is large', () => {
    // Two identical "TARGET" lines far apart (line 5 and line 800). Header says
    // line 10 — not exact, but the nearest candidate (5) is 5 lines away while
    // the next-nearest (800) is 790 away. Gap is 10x+, so tiebreaker wins.
    const lines: string[] = []
    for (let i = 0; i < 1000; i++) lines.push('L' + i)
    lines[4] = 'TARGET'   // 1-based 5
    lines[799] = 'TARGET' // 1-based 800
    const original = lines.join('\n')

    const patch = `@@ -10,1 +10,1 @@
-TARGET
+CHANGED
`
    const result = Patcher.Apply(patch, TestHelpers.singleFile(original))
    expect(result.Files[0].Errors.length).toBe(0)

    const outputLines = result.Files[0].OutputFullText.split('\n')
    expect(outputLines[4]).toBe('CHANGED')
    expect(outputLines[799]).toBe('TARGET') // untouched
  })

  it('remains ambiguous when the gap is small', () => {
    // Two identical "TARGET" lines close together (lines 100 and 130). Header
    // says line 110 — distances 10 and 20, gap of only 10 — not 10x closer.
    // No exact match, no large gap => stay ambiguous.
    const lines: string[] = []
    for (let i = 0; i < 1000; i++) lines.push('L' + i)
    lines[99] = 'TARGET'  // 1-based 100
    lines[129] = 'TARGET' // 1-based 130
    const original = lines.join('\n')

    const patch = `@@ -110,1 +110,1 @@
-TARGET
+CHANGED
`
    const result = Patcher.Apply(patch, TestHelpers.singleFile(original))
    expect(result.Files[0].Errors.length).toBeGreaterThan(0)
    expect(result.Files[0].Errors[0].Type).toBe('MatchAmbiguous')
  })

  it('resolves via exact match among many close candidates', () => {
    // Three identical "T" lines at 200, 201, 202. Header says line 201 — exact
    // hit on the middle one. Even though gaps are tiny, exact-match path wins.
    const lines: string[] = []
    for (let i = 0; i < 500; i++) lines.push('L' + i)
    lines[199] = 'T'; lines[200] = 'T'; lines[201] = 'T'
    const original = lines.join('\n')

    const patch = `@@ -201,1 +201,1 @@
-T
+Z
`
    const result = Patcher.Apply(patch, TestHelpers.singleFile(original))
    expect(result.Files[0].Errors.length).toBe(0)

    const outputLines = result.Files[0].OutputFullText.split('\n')
    expect(outputLines[199]).toBe('T')
    expect(outputLines[200]).toBe('Z') // 1-based 201
    expect(outputLines[201]).toBe('T')
  })

  it('does not override a unique match', () => {
    // Sanity: when context already uniquely identifies the location, the
    // tiebreaker shouldn't engage and a bogus line number shouldn't matter.
    const original = `Alpha
Beta
Gamma
`
    const patch = `@@ -9999,1 +9999,1 @@
-Beta
+BetaPrime
`
    const expected = `Alpha
BetaPrime
Gamma
`
    TestHelpers.assertApply(original, patch, expected)
  })

  // The delete-path tiebreak candidate set is delete-content-only (context ignored), so a
  // header pointing exactly at an occurrence whose CONTEXT contradicts the hunk used to
  // silently mis-anchor there. Two intended occurrences share ctx/ctx context (mutually
  // ambiguous); a third bare "DELME" (context head1/pad) sits at the header line. The
  // tiebreak must revalidate context and stay loud, not edit the wrong spot.
  it('delete-path tiebreak with context-mismatched slot stays loud', () => {
    const original = 'head1\nDELME\npad\nblock\nctx\nDELME\nctx\nblock\nfiller\nblock\nctx\nDELME\nctx\nblock\n'
    const patch = '@@ -1,3 +1,2 @@\n ctx\n-DELME\n+CHANGED\n ctx\n'

    const result = Patcher.Apply(patch, TestHelpers.singleFile(original))
    expect(result.Files[0].Errors.length).toBeGreaterThan(0)
    expect(result.Files[0].Errors[0].Type).toBe('MatchAmbiguous')
    expect(result.Files[0].OutputFullText).toBe(original)
  })

  // The tiebreak's context revalidation once compared trimEnd-only while the
  // search that produced the candidates tolerates full trim (and homoglyphs),
  // so indent-slopped context the search matched at BOTH occurrences was
  // rejected at the tiebroken slot — a loud MatchAmbiguous where a plain
  // context match applies. Revalidation now uses the search's own strictness ladder.
  it('indent-slopped context still applies at the tiebroken slot', () => {
    const original = 'one()\nfoo\none()\nfoo\ntail\n'
    const patch = `@@ -1,2 +1,2 @@
    one()
-foo
+bar
`

    const result = Patcher.Apply(patch, TestHelpers.singleFile(original))

    expect(result.Files[0].Errors.length).toBe(0)
    expect(result.Files[0].OutputFullText).toBe('one()\nbar\none()\nfoo\ntail\n')
  })
})
