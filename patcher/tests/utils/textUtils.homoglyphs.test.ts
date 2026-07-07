/**
 * TextUtils.NormalizeHomoglyphs unit tests.
 */

import { describe, it, expect } from 'vitest'
import { TextUtils } from '../../dist/utils/textUtils.js'

describe('TextUtils.NormalizeHomoglyphs', () => {
  it.each([
    ['‘a’', "'a'"], // smart single quotes
    ['‚a‛', "'a'"], // low-9 / reversed-9 single quotes
    ['“a”', '"a"'], // smart double quotes
    ['„a‟', '"a"'], // low-9 / reversed-9 double quotes
  ])('smart quotes to ASCII: %s', (input, expected) => {
    expect(TextUtils.NormalizeHomoglyphs(input)).toBe(expected)
  })

  it.each([
    ['a‐b', 'a-b'], // hyphen
    ['a–b', 'a-b'], // en dash
    ['a—b', 'a-b'], // em dash
    ['a―b', 'a-b'], // horizontal bar
    ['a−b', 'a-b'], // minus sign
  ])('dashes to hyphen: %s', (input, expected) => {
    expect(TextUtils.NormalizeHomoglyphs(input)).toBe(expected)
  })

  // Invisible characters are built from code points: literals would be unreadable
  // here and unmatchable by byte-exact edit tools.
  it.each([
    [0x00A0, 'NBSP'],
    [0x2009, 'thin space'],
    [0x202F, 'narrow NBSP'],
    [0x3000, 'ideographic space'],
  ])('special space 0x%s to space', (cp, _name) => {
    expect(TextUtils.NormalizeHomoglyphs('a' + String.fromCharCode(cp) + 'b')).toBe('a b')
  })

  it('pure ASCII unchanged', () => {
    const ascii = 'int x = "a-b" + \'c\';  // ok'
    expect(TextUtils.NormalizeHomoglyphs(ascii)).toBe(ascii)
  })

  it('unmapped Unicode unchanged', () => {
    // Accented letters, ellipsis, CJK: real content, not chat-layer typography
    expect(TextUtils.NormalizeHomoglyphs('café … 你')).toBe('café … 你')
  })
})
