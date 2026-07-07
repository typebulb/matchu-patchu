/**
 * Homoglyph (chat-layer typography) end-to-end tests.
 */

import { describe, it, expect } from 'vitest'
import { TestHelpers } from '../helpers'
import { Patcher } from '../../dist/index.js'

describe('Homoglyph tolerance', () => {
  // Chat-layer typography corruption: the diff carries curly quotes the file
  // doesn't have. The edited line is written with the diff's bytes.
  it('curly quotes in delete line: anchors', () => {
    const original = 'alpha\nsay("hi");\nomega\n'
    const patch = `@@ -1,3 +1,3 @@
 alpha
-say(“hi”);
+shout("hi");
 omega
`
    const expected = 'alpha\nshout("hi");\nomega\n'

    TestHelpers.assertApply(original, patch, expected, null, false)
  })

  // Opposite direction: file has the typography, diff was re-typed as ASCII.
  // The corrupted context line is required for disambiguation (bare @@ so the
  // line-number tiebreak can't rescue the match), and the untouched file lines
  // must keep their original bytes.
  it('ASCII diff context against a curly-quote file: preserves untouched file bytes', () => {
    const original = 'if (x) {\n  log(“a”);\n  n++;\n}\nif (y) {\n  log(“b”);\n  n++;\n}\n'
    const patch = `@@
 if (y) {
   log("b");
-  n++;
+  n--;
 }
`
    const expected = 'if (x) {\n  log(“a”);\n  n++;\n}\nif (y) {\n  log(“b”);\n  n--;\n}\n'

    TestHelpers.assertApply(original, patch, expected, null, false)
  })

  it('NBSP in delete line: matches regular spaces', () => {
    const original = 'const a = 1;\nconst b = a + 2;\nconst c = 3;\n'
    // NBSP from a code point: an invisible literal here would be unreadable and
    // unmatchable by byte-exact edit tools.
    const nbsp = String.fromCharCode(0x00A0)
    const patch = '@@ -1,3 +1,3 @@\n const a = 1;\n-const b = a' + nbsp + '+ 2;\n+const b = a + 20;\n const c = 3;\n'
    const expected = 'const a = 1;\nconst b = a + 20;\nconst c = 3;\n'

    TestHelpers.assertApply(original, patch, expected, null, false)
  })

  // Normalization is match-only: inserted lines are written byte-verbatim,
  // Unicode and all.
  it('insert lines keep Unicode verbatim', () => {
    const original = 'start\nend\n'
    const patch = `@@ -1,2 +1,3 @@
 start
+note = "café — “fancy” quote";
 end
`
    const expected = 'start\nnote = "café — “fancy” quote";\nend\n'

    TestHelpers.assertApply(original, patch, expected, null, false)
  })

  // Re-applying a quote-fix diff whose effect is already in the file: no-op, no
  // error. (assertApply alone can't pin this: a failed patch also leaves the
  // output unchanged, so the absence of errors is the actual assertion.)
  it('homoglyph fix already applied: no-ops', () => {
    const original = 'alpha\nmsg = "done";\nomega\n'
    const patch = `@@ -1,3 +1,3 @@
 alpha
-msg = “done”;
+msg = "done";
 omega
`
    const outcome = Patcher.Apply(patch, TestHelpers.singleFile(original))
    const file = TestHelpers.assertSingle(outcome.Files)

    expect(file.Errors.length).toBe(0)
    expect(file.OutputFullText).toBe(original)
  })

  // The insert exists in the file only as a homoglyph variant and the delete is
  // wrong: must stay a loud MatchNotFound, never a silent "already applied" no-op.
  // Pins already-applied detection to whitespace-level passes (the cap).
  it('insert matches only via homoglyphs, wrong delete: errors loudly', () => {
    const original = 'alpha\nsay(“hello”);\nomega\n'
    const patch = `@@ -1,3 +1,3 @@
 alpha
-say('hello');
+say("hello");
 omega
`
    const outcome = Patcher.Apply(patch, TestHelpers.singleFile(original))
    const file = TestHelpers.assertSingle(outcome.Files)

    expect(file.Errors.length).toBeGreaterThan(0)
    expect(file.OutputFullText).toBe(original)
  })
})
