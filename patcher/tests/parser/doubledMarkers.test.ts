/**
 * Doubled-marker disambiguation tests.
 * '--X' and '++X' body lines are ambiguous between strict
 * diff syntax (marker + payload that starts with the marker char) and
 * content/sloppy doubling. File content decides where it can:
 * '--X' flips to a deletion of '-X' when the file has '-X' and not '--X';
 * '++X' keeps its payload '+' when the hunk sits in a verified diff-shaped
 * region. Where content cannot decide, the sloppy '++' collapse stays (it
 * rescues real LLM slop) but is disclosed via CollapsedMarkerLines.
 */

import { describe, it, expect } from 'vitest'
import { TestHelpers } from '../helpers'
import { Patcher } from '../../dist/index.js'

// A file that itself contains a unified-diff example.
const diffShapedFile = 'docs\n context\n-old\n+new\n end\ntail\n'

describe('Doubled-marker disambiguation', () => {
  it('doubled minus deletes the payload line when the file has it', () => {
    const patch = `@@ -2,4 +2,3 @@
  context
--old
 +new
`

    const out = Patcher.Apply(patch, TestHelpers.singleFile(diffShapedFile)).Files[0]

    expect(out.Errors.length).toBe(0)
    expect(out.OutputFullText).toBe('docs\n context\n+new\n end\ntail\n')
  })

  it('doubled plus keeps its payload plus in a verified diff-shaped region', () => {
    const patch = `@@ -2,4 +2,4 @@
  context
 -old
-+new
++newer
  end
`

    const out = Patcher.Apply(patch, TestHelpers.singleFile(diffShapedFile)).Files[0]

    expect(out.Errors.length).toBe(0)
    expect(out.OutputFullText).toBe('docs\n context\n-old\n+newer\n end\ntail\n')
    expect(out.CollapsedMarkerLines).toEqual([])
  })

  it('doubled plus pure insert keeps its payload plus with context evidence', () => {
    const patch = `@@ -3,2 +3,3 @@
 -old
++inserted
 +new
`

    const out = Patcher.Apply(patch, TestHelpers.singleFile(diffShapedFile)).Files[0]

    expect(out.Errors.length).toBe(0)
    expect(out.OutputFullText).toBe('docs\n context\n-old\n+inserted\n+new\n end\ntail\n')
    expect(out.CollapsedMarkerLines).toEqual([])
  })

  it('doubled plus still collapses without evidence, and disclosure names it', () => {
    const patch = `@@ -1,2 +1,3 @@
 L1
++L2
 L3
`

    const out = Patcher.Apply(patch, TestHelpers.singleFile('L1\nL3\n')).Files[0]

    expect(out.Errors.length).toBe(0)
    expect(out.OutputFullText).toBe('L1\nL2\nL3\n')
    expect(out.CollapsedMarkerLines).toEqual(['++L2'])
  })

  it('doubled minus stays content when the file has both readings', () => {
    // Both '--width: 10px' and '-width: 10px' exist: content cannot decide,
    // so the established content reading (CSS custom property) wins.
    const original = ':root {\n--width: 10px\n-width: 10px\n}\n'
    const patch = `@@ -1,3 +1,3 @@
 :root {
--width: 10px
+--width: 20px
`

    const out = Patcher.Apply(patch, TestHelpers.singleFile(original)).Files[0]

    expect(out.Errors.length).toBe(0)
    expect(out.OutputFullText).toBe(':root {\n--width: 20px\n-width: 10px\n}\n')
  })

  // Review 2026-07-06 (silent corruption): an over-indented CONTEXT line whose
  // content starts with '++' ("   ++i;" for file content "    ++i;") was
  // indent-stripped into marker territory and then collapsed into an insert of its
  // tail — fabricating "i;" with zero errors. File evidence now keeps the line.
  it('over-indented context with doubled-plus content is not fabricated into an insert', () => {
    const original = 'void f() {\n    ++i;\n    done();\n}\n'
    const patch = `@@ -1,4 +1,5 @@
 void f() {
   ++i;
+    step();
     done();
 }
`

    const out = Patcher.Apply(patch, TestHelpers.singleFile(original)).Files[0]

    expect(out.Errors.length).toBe(0)
    // step()'s two extra spaces are pre-existing indent adaptation (the insert
    // follows its slopped neighbour's indent delta) — cosmetic, not corruption.
    expect(out.OutputFullText).toBe('void f() {\n    ++i;\n      step();\n    done();\n}\n')
    expect(out.CollapsedMarkerLines.length).toBe(0)
  })
})
