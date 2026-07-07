/**
 * Reanchoring tests
 *
 * The second test also exercises StripCommonIndent: the whole diff body is
 * uniformly indented by a single space, which per-line stripping must not touch.
 */

import { describe, it, expect } from 'vitest'
import { TestHelpers, DiffPerturber } from '../helpers'
import { Patcher } from '../../dist/index.js'

describe('Reanchor', () => {
  it('reanchors when offsets are wrong', () => {
    const lines: string[] = []
    for (let i = 1; i <= 100; i++) lines.push('Line' + i)
    const original = lines.join('\n') + '\n'

    const goodPatch = `@@ -49,3 +49,3 @@
 Line49
-Line50
+LineXX
 Line51
`
    const badPatch = DiffPerturber.shift(goodPatch, 25)
    const expected = lines.map(l => l === 'Line50' ? 'LineXX' : l).join('\n') + '\n'

    TestHelpers.assertApply(original, badPatch, expected)
  })

  it('reanchors with unlimited search across a uniformly indented diff', () => {
    const lines: string[] = []
    for (let i = 1; i <= 1000; i++) lines.push('Line' + i)
    lines.push('class Calculator {')
    lines.push('    int Add(int a, int b) {')
    lines.push('        return a + b;')
    lines.push('    }')
    lines.push('}')
    const original = lines.join('\n') + '\n'

    const patch = `@@ -1002,3 +1002,3 @@
 class Calculator {
 -    int Add(int a, int b) {
 -        return a + b;
 -    }
 +    int Add(int a, int b) {
 +        return a + b + 1;
 +    }
 }
`
    const result = Patcher.Apply(patch, TestHelpers.singleFile(original))
    expect(result.Files[0].OutputFullText).toContain('return a + b + 1')
  })
})
