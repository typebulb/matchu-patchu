/**
 * Search.Find homoglyph-pass unit tests.
 */

import { describe, it, expect } from 'vitest'
import { Search } from '../../dist/anchorer/search.js'

describe('Search homoglyph pass', () => {
  it('smart-quote haystack, ASCII needle: matches with fuzz 200', () => {
    const hay = ['A', 'say(“hi”);', 'C']
    const needle = ['say("hi");']

    const result = Search.Find(hay, needle)

    expect(result.LineIndex).toBe(1)
    expect(result.Fuzz).toBe(200)
  })

  it('exact match preferred over homoglyph match', () => {
    const hay = ['say(“hi”);', 'B', 'say("hi");']
    const needle = ['say("hi");']

    const result = Search.Find(hay, needle)

    expect(result.LineIndex).toBe(2)
    expect(result.Fuzz).toBe(0)
  })

  it('homoglyph with indent drift matches', () => {
    const hay = ['A', '    a — b', 'C']
    const needle = ['a - b']

    const result = Search.Find(hay, needle)

    expect(result.LineIndex).toBe(1)
    expect(result.Fuzz).toBe(200)
  })

  it('capped at strip: does not use the homoglyph pass', () => {
    const hay = ['A', 'say(“hi”);', 'C']
    const needle = ['say("hi");']

    const result = Search.Find(hay, needle, 0, 100)

    expect(result.LineIndex).toBe(-1)
  })

  it('capped at strip: still matches whitespace fuzz', () => {
    const hay = ['A', '  B', 'C']
    const needle = ['B']

    const result = Search.Find(hay, needle, 0, 100)

    expect(result.LineIndex).toBe(1)
    expect(result.Fuzz).toBe(100)
  })
})
