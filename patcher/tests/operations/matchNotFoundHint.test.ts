/**
 * MatchNotFound sub-line hint tests: a quoted line found inside exactly one
 * longer file line stays refused (fragment vs elided whole-line delete is
 * undecidable) but the error names the containing line. Weak evidence — a short
 * fragment, several containing lines, no confident candidate — stays hint-free.
 */

import { describe, it, expect } from 'vitest'
import { TestHelpers } from '../helpers'
import { Patcher } from '../../dist/index.js'

const paragraph =
  'The mirror forwards each outcome to the log verbatim, so when one breaks, pull the error ' +
  'from the log instead of asking; for anything worth verifying, arm the wait in the background ' +
  'before ending your turn: the render happens after the turn flushes, and the line the wake ' +
  'prints is the verdict.'
const prefix =
  'The mirror forwards each outcome to the log verbatim, so when one breaks, pull the error ' +
  'from the log instead of asking; for anything worth verifying, arm the wait in the background ' +
  'before ending your turn:'
const file = `# Title\n\n${paragraph}\n\nLast line here.\n`

describe('MatchNotFound sub-line hint', () => {
  it('delete line quoting a prefix of a long line stays loud and hints the containing line', () => {
    const patch = `@@
-${prefix}
+${prefix.slice(0, -1)} (with a parenthetical added):
`

    const out = Patcher.Apply(patch, TestHelpers.singleFile(file)).Files[0]

    expect(out.Errors.length).toBe(1)
    expect(out.Errors[0].Type).toBe('MatchNotFound')
    expect(out.OutputFullText).toBe(file)
    expect(out.Errors[0].Hint).toBeTruthy()
    expect(out.Errors[0].SuggestedFixYaml).toContain('Hint')
    expect(out.Errors[0].Hint).toContain('line 3')
  })

  it('context line quoting a prefix of a long line hints too', () => {
    const patch = `@@
 ${prefix}
+A new paragraph inserted after.
`

    const out = Patcher.Apply(patch, TestHelpers.singleFile(file)).Files[0]

    expect(out.Errors.length).toBe(1)
    expect(out.Errors[0].Type).toBe('MatchNotFound')
    expect(out.Errors[0].Hint).toBeTruthy()
    expect(out.Errors[0].Hint).toContain('line 3')
  })

  it('a line found nowhere gives no hint', () => {
    const patch = `@@
-This sentence appears nowhere at all in the file, honest.
+replacement text
`

    const out = Patcher.Apply(patch, TestHelpers.singleFile(file)).Files[0]

    expect(out.Errors.length).toBe(1)
    expect(out.Errors[0].Type).toBe('MatchNotFound')
    expect(out.Errors[0].Hint).toBeNull()
    expect(out.Errors[0].SuggestedFixYaml).not.toContain('Hint')
  })

  it('a fragment contained in two different lines gives no hint', () => {
    const frag = 'a fragment shared by two lines'
    const twoLineFile = `alpha ${frag} tail one\nbeta ${frag} tail two\n`
    const patch = `@@
-${frag}
+a replacement for the fragment
`

    const out = Patcher.Apply(patch, TestHelpers.singleFile(twoLineFile)).Files[0]

    expect(out.Errors.length).toBe(1)
    expect(out.Errors[0].Type).toBe('MatchNotFound')
    expect(out.Errors[0].Hint).toBeNull()
  })

  it('a short contained fragment gives no hint', () => {
    const patch = `@@
-Last line
+Final line
`

    const out = Patcher.Apply(patch, TestHelpers.singleFile(file)).Files[0]

    expect(out.Errors.length).toBe(1)
    expect(out.Errors[0].Type).toBe('MatchNotFound')
    expect(out.Errors[0].Hint).toBeNull()
  })
})
