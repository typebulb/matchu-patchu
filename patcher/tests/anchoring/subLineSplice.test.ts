/**
 * Sub-line splice fallback tests.
 * A delete line matching no file line but occurring as a substring of exactly one
 * line is an author-quoted fragment: the splice replaces the fragment within the
 * line and preserves the rest. Every guard failure (short fragment, non-unique
 * substring, insert echoing text from outside the fragment, insert dwarfing the
 * fragment) must stay a loud MatchNotFound.
 */

import { describe, it, expect } from 'vitest'
import { TestHelpers } from '../helpers'
import { Patcher } from '../../dist/index.js'

const longLine = '| 9 | tolerance | canonical equivalents match, fails loudly | = (one difference) |'
const file = `alpha\n${longLine}\nomega\n`

describe('Sub-line splice fallback', () => {
  it('fragment tail edit applies, preserving the rest of the line', () => {
    const patch = `@@ -2,1 +2,1 @@
-fails loudly | = (one difference) |
+fails loudly | = (scope differs) |
`

    const out = Patcher.Apply(patch, TestHelpers.singleFile(file)).Files[0]

    expect(out.Errors.length).toBe(0)
    expect(out.OutputFullText).toBe(
      'alpha\n| 9 | tolerance | canonical equivalents match, fails loudly | = (scope differs) |\nomega\n')
    expect(out.Fuzz).toBe(500)
  })

  it('fragment delete removes the substring only', () => {
    const patch = `@@ -2,1 +2,0 @@
-, fails loudly
`

    const out = Patcher.Apply(patch, TestHelpers.singleFile(file)).Files[0]

    expect(out.Errors.length).toBe(0)
    expect(out.OutputFullText).toContain('| canonical equivalents match | =')
  })

  it('fragment present in two lines stays loud', () => {
    const original = 'foo(alpha, beta, gamma);\nbar(alpha, beta, gamma);\n'
    const patch = `@@ -1,1 +1,1 @@
-alpha, beta
+alpha, BETA
`

    const out = Patcher.Apply(patch, TestHelpers.singleFile(original)).Files[0]

    expect(out.Errors.length).toBe(1)
    expect(out.Errors[0].Type).toBe('MatchNotFound')
    expect(out.OutputFullText).toBe(original)
  })

  it('fragment present twice in one line stays loud', () => {
    const original = 'call(value1, value1x, other);\n'
    const patch = `@@ -1,1 +1,1 @@
-value1
+value2
`

    const out = Patcher.Apply(patch, TestHelpers.singleFile(original)).Files[0]

    expect(out.Errors.length).toBe(1)
    expect(out.Errors[0].Type).toBe('MatchNotFound')
  })

  it('short fragment stays loud', () => {
    const patch = `@@ -2,1 +2,1 @@
-| 9 |
+| 10 |
`

    const out = Patcher.Apply(patch, TestHelpers.singleFile(file)).Files[0]

    expect(out.Errors.length).toBe(1)
    expect(out.Errors[0].Type).toBe('MatchNotFound')
  })

  // An interior fragment whose insert echoes the line's tail was authored by
  // someone who saw past the fragment: splicing would duplicate the echoed
  // remainder — must stay loud.
  it('insert echoing the remainder stays loud', () => {
    const original = 'prefixPart(middleOldValue)suffixPart;\nother line\n'
    const patch = `@@ -1,1 +1,1 @@
-(middleOldValue)
+(middleNewValue)suffixPart;
`

    const out = Patcher.Apply(patch, TestHelpers.singleFile(original)).Files[0]

    expect(out.Errors.length).toBe(1)
    expect(out.Errors[0].Type).toBe('MatchNotFound')
    expect(out.OutputFullText).toBe(original)
  })

  // The tail-truncated-whole-line shape (corpus wave-4 fragmentDamage): a
  // fragment opening the line with a non-empty tail remnant is undecidable
  // even when the insert doesn't echo the remnant — must stay loud.
  it('line-start fragment stays loud', () => {
    const original = 'callFunctionOldName(argument, second);\nother line\n'
    const patch = `@@ -1,1 +1,1 @@
-callFunctionOldName(argument
+renamedFn(argument
`

    const out = Patcher.Apply(patch, TestHelpers.singleFile(original)).Files[0]

    expect(out.Errors.length).toBe(1)
    expect(out.Errors[0].Type).toBe('MatchNotFound')
    expect(out.OutputFullText).toBe(original)
  })

  it('insert dwarfing the fragment stays loud', () => {
    const patch = `@@ -2,1 +2,1 @@
-= (one difference) |
+(a wholly rewritten cell that is far longer than the fragment it claims to replace, twice over)
`

    const out = Patcher.Apply(patch, TestHelpers.singleFile(file)).Files[0]

    expect(out.Errors.length).toBe(1)
    expect(out.Errors[0].Type).toBe('MatchNotFound')
  })

  it('a full-line match elsewhere wins over the splice', () => {
    const original = `fails loudly | = (one difference) |\n${longLine}\n`
    const patch = `@@ -1,1 +1,1 @@
-fails loudly | = (one difference) |
+REPLACED
`

    const out = Patcher.Apply(patch, TestHelpers.singleFile(original)).Files[0]

    expect(out.Errors.length).toBe(0)
    expect(out.OutputFullText).toBe(`REPLACED\n${longLine}\n`)
    expect(out.Fuzz).toBe(0)
  })

  // The corpus-wave-1 shape (case 177): a comment-out edit already applied. The
  // delete line survives as a substring of the applied line ("#" + line); the
  // already-applied filter must drop the chunk before the splice can see it,
  // else the wrapper stacks ("##...").
  it('applied wrap edit no-ops instead of stacking the wrapper', () => {
    const applied = 'alpha\n#from webhelpers import text\nomega\n'
    const patch = `@@ -2,1 +2,1 @@
-from webhelpers import text
+#from webhelpers import text
`

    const out = Patcher.Apply(patch, TestHelpers.singleFile(applied)).Files[0]

    expect(out.Errors.length).toBe(0)
    expect(out.Edits.length).toBe(0)
    expect(out.OutputFullText).toBe(applied)
    expect(out.AlreadyAppliedCount).toBe(1)
  })

  // A tiny remnant (here a lone ";") means the fragment is nearly the whole
  // line, where fragment-vs-differing-whole-line is undecidable.
  it('tiny remnant stays loud', () => {
    const original = 'callFunction(value);\nother line here\n'
    const patch = `@@ -1,1 +1,1 @@
-callFunction(value)
+callFunction(newValue)
`

    const out = Patcher.Apply(patch, TestHelpers.singleFile(original)).Files[0]

    expect(out.Errors.length).toBe(1)
    expect(out.Errors[0].Type).toBe('MatchNotFound')
    expect(out.OutputFullText).toBe(original)
  })

  // Documented limitation: re-sending a spliced fragment patch errors loudly
  // (the fragment is gone from the file) instead of detecting already-applied.
  // Loud retry over risky silent skip, consistent with the evidence rules.
  it('re-applying a spliced patch stays loud', () => {
    const patch = `@@ -2,1 +2,1 @@
-fails loudly | = (one difference) |
+fails loudly | = (scope differs) |
`

    const once = Patcher.Apply(patch, TestHelpers.singleFile(file)).Files[0]
    const twice = Patcher.Apply(patch, TestHelpers.singleFile(once.OutputFullText)).Files[0]

    expect(twice.Errors.length).toBe(1)
    expect(twice.Errors[0].Type).toBe('MatchNotFound')
    expect(twice.OutputFullText).toBe(once.OutputFullText)
  })

  // A pure-fragment delete whose excision fuses two whitespace runs (a token removed
  // from between spaces: "const foobarbaz = 5;" minus "foobarbaz") leaves a gap where
  // the token stood -- indistinguishable from a whole-line delete that missed, so it
  // must stay loud, not silently produce "const  = 5;". Contrast the clean-join
  // fragment-delete test above.
  it('pure fragment delete fusing whitespace stays loud', () => {
    const original = 'const foobarbaz = 5;\n'
    const patch = `@@ -1,1 +0,0 @@
-foobarbaz
`

    const out = Patcher.Apply(patch, TestHelpers.singleFile(original)).Files[0]

    expect(out.Errors.length).toBe(1)
    expect(out.Errors[0].Type).toBe('MatchNotFound')
    expect(out.OutputFullText).toBe(original)
  })

  // Real-world capture: an end-anchored fragment whose insert
  // exceeds the 2x+8 dwarf cap but OPENS WITH THE FRAGMENT'S OWN STEM. A damaged
  // whole-line replacement reproduces the remnants (the echo guard catches that);
  // reproducing the fragment's opening verbatim is fragment-edit evidence — the
  // author is editing within what they quoted. Prose tail-edits (long soft-wrapped
  // lines) routinely carry inserts far longer than what they replace. Must splice.
  it('dwarfing insert sharing the fragment stem splices', () => {
    const head = 'Status: restructured; both packages build, all tests pass. '
    const original = head + '`git init` done; first commit awaits the ask.\nother line\n'
    const patch = `@@ -1,1 +1,1 @@
-\`git init\` done; first commit awaits the ask.
\`git init\` done; first commit landed with the skill infrastructure in place; no further commits without an explicit ask.
`

    const out = Patcher.Apply(patch, TestHelpers.singleFile(original)).Files[0]

    expect(out.Errors.length).toBe(0)
    expect(out.OutputFullText).toBe(
      head + '`git init` done; first commit landed with the skill infrastructure in place; no further commits without an explicit ask.\nother line\n')
    expect(out.Fuzz).toBe(500)
  })
})
