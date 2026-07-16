/**
 * Consumer contract — THE GUARDRAIL.
 *
 * This file mirrors the canonical downstream consumer: an agent-chat feedback
 * handler that applies a diff, gates success on the per-file error channel, and
 * composes ONE message over the failed entries. It is deliberately written at the
 * consumer's level of sophistication and must stay this small.
 *
 * If a library change makes this consumer WRONG (a failure it can't see) or makes
 * it GROW (a new branch, a new type to import, a try/catch, a second channel to
 * consult), the library change is wrong. Fix the library, not this file.
 */

import { describe, it, expect } from 'vitest'
import { Patcher, PatchInputFile, PatchOutput } from '../dist/index.js'

// The consumer, verbatim shape: one gate, one template. Nothing else is allowed.
function applyOrFeedback(diff: string, files: PatchInputFile[]): { output?: PatchOutput; feedback?: string } {
  const output = Patcher.Apply(diff, files)
  if (output.Files.some(f => f.Errors?.length > 0)) return { feedback: composeErrorMessage(output) }
  return { output }
}

function composeErrorMessage(output: PatchOutput): string {
  const fileDetails = output.Files
    .filter(f => f.Errors?.length > 0)
    .map(f => `File: ${f.Key}\n\nCurrent content:\n\`\`\`\n${f.InputFullText}\n\`\`\`\n\nErrors:\n${f.Errors.map(e => e.SuggestedFixYaml).join('\n\n')}`)
    .join('\n\n---\n\n')
  return `Diff could not be applied:\n\n${fileDetails}\n\nProvide corrected diff ensuring context lines match current file content above.`
}

const project = () => [
  new PatchInputFile('code.tsx', 'const a = 1\nconst b = 2\n'),
  new PatchInputFile('styles.css', 'body { color: red }\n'),
]

describe('Consumer contract: the year-old gate and template handle every failure kind', () => {
  it('clean multi-file apply → output, no feedback', () => {
    const diff =
      '--- code.tsx\n+++ code.tsx\n@@ -1,2 +1,2 @@\n-const a = 1\n+const a = 10\n const b = 2\n'
    const { output, feedback } = applyOrFeedback(diff, project())

    expect(feedback).toBeUndefined()
    expect(output!.Files[0].OutputFullText).toBe('const a = 10\nconst b = 2\n')
  })

  it('content mismatch → feedback names the file and carries the YAML', () => {
    const diff =
      '--- styles.css\n+++ styles.css\n@@ -1,1 +1,1 @@\n-body { color: green }\n+body { color: blue }\n'
    const { feedback } = applyOrFeedback(diff, project())

    expect(feedback).toContain('File: styles.css')
    expect(feedback).toContain('MatchNotFound')
    expect(feedback).toContain('body { color: red }') // current content echoed for the model
  })

  it('foreign file header → feedback, with the valid file set, and no new consumer code', () => {
    const diff =
      '--- code.tsx\n+++ code.tsx\n@@ -1,2 +1,2 @@\n-const a = 1\n+const a = 10\n const b = 2\n' +
      '--- three.ts\n+++ three.ts\n@@ -1,1 +1,1 @@\n-zzz\n+ZZZ\n'
    const { feedback } = applyOrFeedback(diff, project())

    expect(feedback).toContain('File: three.ts')
    expect(feedback).toContain('FileMismatch')
    expect(feedback).toContain('code.tsx')   // roster hint reaches the model
    expect(feedback).toContain('styles.css')
  })

  it('unroutable headerless hunk → feedback with the add-headers hint', () => {
    const diff = '@@ -1,1 +1,1 @@\n-nothing like this exists\n+replacement\n'
    const { feedback } = applyOrFeedback(diff, project())

    expect(feedback).toContain('MatchNotFound')
    expect(feedback).toContain('file headers')
  })

  it('misdirected all-foreign diff is NEVER a clean success', () => {
    const diff =
      '--- one.ts\n+++ one.ts\n@@ -1,1 +1,1 @@\n-x\n+y\n' +
      '--- two.ts\n+++ two.ts\n@@ -1,1 +1,1 @@\n-x\n+y\n'
    const { output, feedback } = applyOrFeedback(diff, project())

    expect(output).toBeUndefined()
    expect(feedback).toContain('FileMismatch')
  })
})
