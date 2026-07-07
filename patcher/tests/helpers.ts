/**
 * Test helpers for patcher tests
 * Ported from test-helpers.mjs with TypeScript types
 */

import { expect } from 'vitest'
import { Patcher } from '../dist/index.js'

interface FileInput {
  Key: string
  InputFullText: string
  InputSelectedText: string
}

interface Edit {
  LineIndex: number
  DeleteLines: string[]
  InsertLines: string[]
}

interface FileResult {
  Key: string
  InputFullText: string
  OutputFullText: string
  Errors: any[]
  Edits: Edit[]
}

interface PatchOutcome {
  Files: FileResult[]
}

/**
 * Utility to shift hunk line numbers (for testing drift/reanchoring)
 */
export class DiffPerturber {
  static shift(diff: string, delta: number = 5): string {
    const hunkHdrRegex = /^@@ -(\d+)((?:,\d+)?) \+(\d+)((?:,\d+)?) @@/gm
    return diff.replace(hunkHdrRegex, (match, oldStart, oldRange, newStart, newRange) => {
      const oldShifted = parseInt(oldStart) + delta
      const newShifted = parseInt(newStart) + delta
      return `@@ -${oldShifted}${oldRange} +${newShifted}${newRange} @@`
    })
  }
}

/**
 * Core test helpers
 */
export class TestHelpers {
  /**
   * Decode whitespace markers:
   * · (middle dot U+00B7) → space
   * → (rightwards arrow U+2192) → tab
   * ␣ (open box U+2423) → trailing space marker
   */
  static decode(text: string, useMarkers: boolean = true): string {
    if (!useMarkers || !text) return text
    return text
      .replace(/·/g, ' ')
      .replace(/→/g, '\t')
      .replace(/␣/g, ' ')
  }

  /**
   * Normalize text for comparison (handles line endings and trailing newlines)
   */
  static normalize(txt: string): string {
    if (!txt) return ''
    let norm = txt.replace(/\r\n/g, '\n').replace(/\r/g, '')
    if (!norm.endsWith('\n')) {
      norm += '\n'
    }
    // Remove double trailing newlines
    while (norm.endsWith('\n\n')) {
      norm = norm.slice(0, -1)
    }
    return norm
  }

  /**
   * Main assertion: apply diff and check output matches expected
   */
  static assertApply(
    original: string,
    diff: string,
    expected: string,
    opts: any = null,
    useMarkers: boolean = true
  ): void {
    original = this.decode(original, useMarkers)
    diff = this.decode(diff, useMarkers)
    expected = this.decode(expected, useMarkers)

    const files: FileInput[] = [{ Key: '', InputFullText: original, InputSelectedText: '' }]
    const outcome = Patcher.Apply(diff, files, opts) as PatchOutcome

    const actualOutput = outcome.Files[0].OutputFullText
    const normalizedExpected = this.normalize(expected)
    const normalizedActual = this.normalize(actualOutput)

    if (normalizedExpected !== normalizedActual) {
      console.error('\n❌ Output mismatch!')
      this.visualizeDiff(normalizedExpected, normalizedActual)
    }
    
    expect(normalizedActual).toBe(normalizedExpected)
    this.ensureEditsReplay(outcome)
  }

  /**
   * Verify that edits can be replayed to reconstruct the output
   */
  static ensureEditsReplay(outcome: PatchOutcome): void {
    for (const file of outcome.Files) {
      if (file.Edits.every(e => e.DeleteLines.length === 0 && e.InsertLines.length === 0)) {
        continue
      }

      const origTxt = file.InputFullText
      const lines = this.toLines(origTxt)

      // Apply edits in reverse order (highest line number first)
      const sortedEdits = [...file.Edits].sort((a, b) => b.LineIndex - a.LineIndex)
      
      for (const e of sortedEdits) {
        lines.splice(e.LineIndex, e.DeleteLines.length, ...e.InsertLines)
      }

      // Reconstruct text: if we have lines, join with \n and add trailing \n
      // If no lines, result is empty string (not '\n')
      const predicted = lines.length > 0 ? lines.join('\n') + '\n' : ''
      
      if (this.normalize(file.OutputFullText) !== this.normalize(predicted)) {
        console.error('\n❌ Edit replay failed!')
        console.error('Expected from edits:', predicted)
        console.error('Actual output:', file.OutputFullText)
      }
      
      expect(this.normalize(file.OutputFullText)).toBe(this.normalize(predicted))
    }
  }

  /**
   * Convert text to array of lines (without line endings)
   * Matches patcher's behavior: trailing empty string from split represents final newline
   */
  static toLines(text: string): string[] {
    if (!text) return []
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '').split('\n')
    // Remove trailing empty string (represents final newline terminator, like patcher does)
    if (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop()
    }
    return lines
  }

  /**
   * Create a single-file input array
   */
  static singleFile(content: string): FileInput[] {
    return [{ Key: '', InputFullText: content, InputSelectedText: '' }]
  }

  /**
   * Visualize whitespace differences in failed tests
   */
  static visualizeDiff(expected: string, actual: string): void {
    const show = (s: string) => s
      .replace(/ /g, '·')
      .replace(/\t/g, '→')
      .replace(/\n/g, '⏎\n')

    console.error('\n📝 Expected (·=space →=tab ⏎=newline):')
    console.error(show(expected))
    console.error('\n📝 Actual:')
    console.error(show(actual))
  }

  /**
   * Assert a single item in array
   */
  static assertSingle<T>(array: T[], message: string = 'Expected single item'): T {
    expect(array.length).toBe(1)
    return array[0]
  }

  /**
   * Assert array is empty
   */
  static assertEmpty<T>(array: T[], message: string = 'Expected empty array'): void {
    expect(array.length).toBe(0)
  }

  /**
   * Assert equal with custom message
   */
  static assertEqual<T>(actual: T, expected: T, message: string = 'Values do not match'): void {
    expect(actual).toBe(expected)
  }

  /**
   * Assert arrays are equal
   */
  static assertArrayEqual<T>(actual: T[], expected: T[], message: string = 'Arrays do not match'): void {
    expect(actual).toEqual(expected)
  }
}

