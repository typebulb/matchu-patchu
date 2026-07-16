/**
 * Distilled regressions from the 2026-07 Diff-XYZ corpus run (real commits from
 * CommitPackFT run through a differential+metamorphic test harness).
 * One test per finding.
 */

import { describe, it, expect } from 'vitest'
import { TestHelpers } from '../helpers'
import { Patcher, PatchInputFile, PatchOptions, PatchException } from '../../dist/index.js'

describe('Corpus regressions (Diff-XYZ 2026-07)', () => {
  // Corpus case 92: a hunk that moves a line upward (insert above, delete below
  // within one hunk). The pure-insert chunk must not be skipped as already
  // applied merely because the not-yet-moved original still matches the file.
  it('intra-hunk move: the inserted copy survives', () => {
    const original =
      'interface Repo {\n' +
      '\n\n' +
      '    MappingEntity findByKey(String key);\n' +
      '\n\n' +
      '    List<MappingEntity> findByLabel(String label);\n' +
      '}\n'

    const patch = `@@ -5,4 +5,7 @@

+    List<MappingEntity> findByLabel(String label);

-    List<MappingEntity> findByLabel(String label);
+
+    Page<MappingEntity> findByFilters(Pageable pageable);
+
 }
`
    const expected =
      'interface Repo {\n' +
      '\n\n' +
      '    MappingEntity findByKey(String key);\n' +
      '\n' +
      '    List<MappingEntity> findByLabel(String label);\n' +
      '\n\n' +
      '    Page<MappingEntity> findByFilters(Pageable pageable);\n' +
      '\n' +
      '}\n'

    TestHelpers.assertApply(original, patch, expected, null, false)
  })

  // Corpus case 427: deleting an RST title underline — the deletion line is
  // nothing but dashes and must not be eaten as a decorative separator when it
  // sits inside a counted hunk body.
  it('deletes an RST underline inside a counted hunk', () => {
    const original = '"""\nFlask-Babel\n-----------\n"""\nfrom setuptools import setup\n'
    const patch = `@@ -1,5 +1,1 @@
-"""
-Flask-Babel
------------
-"""
 from setuptools import setup
`
    const result = Patcher.Apply(patch, TestHelpers.singleFile(original))
    expect(result.Files[0].OutputFullText).toBe('from setuptools import setup\n')
    expect(result.Files[0].Errors.length).toBe(0)
  })

  // Corpus cases 33/60: a whitespace-only inserted line keeps its indentation
  // when it matches the surrounding inserted block's indent (real commits carry
  // such lines); arbitrary stray whitespace still flattens to empty.
  it('blank insert line keeps the block indent', () => {
    const original = 'def a():\n    x = 1\n    y = 2\n'
    const patch = '@@ -2,2 +2,4 @@\n     x = 1\n+    \n+    z = 3\n     y = 2\n'

    const result = Patcher.Apply(patch, TestHelpers.singleFile(original))
    expect(result.Files[0].OutputFullText).toBe('def a():\n    x = 1\n    \n    z = 3\n    y = 2\n')
    expect(result.Files[0].Errors.length).toBe(0)
  })

  // Corpus case 14: a trailing insert block anchored after the file's final
  // brace keeps its own indentation — the coalesced search window's context
  // (the inner `    }`) must not leak into the chunk and fabricate a shift.
  it('trailing insert after the final brace keeps its indent', () => {
    const original =
      'impl Paginated {\n' +
      '    fn new() {\n' +
      '        x();\n' +
      '    }\n' +
      '}\n'

    const patch = `@@ -4,2 +4,10 @@
     }
+
+    fn next() {
+        y();
+    }
 }
+
+mod tests {
+    use super::Paginated;
+}
`
    const expected =
      'impl Paginated {\n' +
      '    fn new() {\n' +
      '        x();\n' +
      '    }\n' +
      '\n' +
      '    fn next() {\n' +
      '        y();\n' +
      '    }\n' +
      '}\n' +
      '\n' +
      'mod tests {\n' +
      '    use super::Paginated;\n' +
      '}\n'

    TestHelpers.assertApply(original, patch, expected, null, false)
  })

  // LLMism run, alreadyApplied perturbation (corpus case 0 distilled): a pure-insert
  // diff re-sent against a file that already contains the edit must be a no-op —
  // the old-image (a lone blank context line) exists everywhere, so only the
  // post-image sitting at the resolved slot proves the chunk is already applied.
  it('already-applied pure insert is a no-op', () => {
    const applied = 'package x\n\nimport A\nimport B\nclass C {\n    fun f() {}\n}\n'
    const patch = '@@ -2 +2,3 @@\n \n+import A\n+import B\n'

    const result = Patcher.Apply(patch, TestHelpers.singleFile(applied))
    expect(result.Files[0].OutputFullText).toBe(applied)
    expect(result.Files[0].Errors.length).toBe(0)
  })

  // LLMism run, staleCtx perturbation (corpus case 222 distilled): a pure-insert
  // block whose context is ambiguous (`    }`) falls back to the header line number;
  // when the header is stale the slot's neighbours contradict the context lines, and
  // the patcher must error loudly instead of silently inserting at the wrong brace.
  it('header fallback rejects mismatched context', () => {
    const original =
      'fun a() {\n    if (x) {\n        p()\n    }\n}\n\nfun b() {\n    if (y) {\n        q()\n    }\n}\n'
    // header says line 2, but the context lines only fit lines 4-5 / 10-11
    const patch = '@@ -2,2 +2,3 @@\n     }\n+    r()\n }\n'

    const result = Patcher.Apply(patch, TestHelpers.singleFile(original))
    expect(result.Files[0].Errors.length).toBeGreaterThan(0)
    expect(result.Files[0].OutputFullText).toBe(original)
  })

  // LLMism run, truncated perturbation: a diff cut off mid-hunk (token-limit) ends on
  // a change line while the header declares more than the body delivers — applying it
  // would silently install a partial edit. Under the opt-in 'error' policy (for
  // raw-text channels where token cutoffs are real) this is rejected at parse time,
  // all-or-nothing, like any other malformed diff. The default policy is 'warn'.
  it('truncated final hunk errors instead of half-applying under error policy', () => {
    const original = 'alpha\nbeta\ngamma\ndelta\n'
    // header promises 3 old / 6 new lines; the body was torn after the second insert
    const patch = '@@ -2,3 +2,6 @@\n beta\n gamma\n+one\n+two\n'

    const options = new PatchOptions()
    options.Truncation = 'error'
    expect(() => Patcher.Apply(patch, TestHelpers.singleFile(original), options)).toThrow(/truncated/)
  })

  // LLMism run, zeroContext+shiftHeader stack: a context-free pure insert whose header
  // points past EOF used to be given a fabricated in-range "success" whose edit was
  // then silently discarded by the applier — the whole insert vanished with no error.
  it('pure insert with header beyond EOF errors instead of vanishing', () => {
    const original = 'alpha\nbeta\ngamma\n'
    const patch = '@@ -9 +9,2 @@\n+one\n+two\n'

    const result = Patcher.Apply(patch, TestHelpers.singleFile(original))
    expect(result.Files[0].Errors.length).toBeGreaterThan(0)
    expect(result.Files[0].OutputFullText).toBe(original)
  })

  // External review 2026-07: a complete pure-insert append whose header merely
  // over-counts the new side is miscount slop, not truncation — the old side is
  // fully delivered, so the hunk is complete by its own header and must apply.
  // Only a hunk whose old side is ALSO short (promised trailing context never
  // arrived) is treated as torn.
  it('complete append with overcounted header applies instead of rejecting', () => {
    const original = 'line1\nline2\nlastline\n'
    // header claims 5 new lines but the complete edit only has 3 (1 ctx + 2 inserts)
    const patch = '@@ -3,1 +3,5 @@\n lastline\n+added1\n+added2\n'

    const result = Patcher.Apply(patch, TestHelpers.singleFile(original))
    expect(result.Files[0].OutputFullText).toBe('line1\nline2\nlastline\nadded1\nadded2\n')
    expect(result.Files[0].Errors.length).toBe(0)
  })

  // The moved-lines carve-out counted a chunk's
  // OWN deletes, so any block rewrite re-inserting its own first/last lines
  // (-if (x) { … +if (x) {) bypassed AlreadyApplied and re-applying an already-applied
  // patch — the normal agent-retry scenario — errored MatchNotFound instead of
  // no-opping. Only lines deleted in a DIFFERENT chunk mark a move.
  it('re-applying a block rewrite is a no-op', () => {
    const applied = 'if (x) {\n    b()\n}\n'
    const patch = '@@ -1,3 +1,3 @@\n-if (x) {\n-    a()\n-}\n+if (x) {\n+    b()\n+}\n'

    const result = Patcher.Apply(patch, TestHelpers.singleFile(applied))
    expect(result.Files[0].OutputFullText).toBe(applied)
    expect(result.Files[0].Errors.length).toBe(0)
  })

  // A closing ``` fence is completion evidence
  // a token cutoff cannot emit, so the tear signature on a fence-closed final hunk is
  // miscount slop and must apply. (The unfenced variant of this diff rejects only
  // under the opt-in 'error' policy — see the truncated-final-hunk test above.)
  it('fence-closed overcounted hunk applies instead of rejecting', () => {
    const original = 'alpha\nbeta\ngamma\ndelta\n'
    const patch = '```diff\n@@ -2,3 +2,6 @@\n beta\n gamma\n+one\n+two\n```\n'

    const result = Patcher.Apply(patch, TestHelpers.singleFile(original))
    expect(result.Files[0].OutputFullText).toBe('alpha\nbeta\ngamma\none\ntwo\ndelta\n')
    expect(result.Files[0].Errors.length).toBe(0)
  })

  // TruncationPolicy (2026-07-05): the tear signature's verdict is caller policy.
  // 'warn' (default) applies AND surfaces PatchOutputFile.TruncationSuspected for a caller
  // that discloses it — the leniency stance, since the signature is a header-vs-body count
  // mismatch and counts are at most tie-breakers. 'ignore' applies identically but sets no
  // flag. 'error' rejects at parse time — opt in for raw-text channels where token cutoffs
  // are real (see the test above).
  it('truncated final hunk under warn policy applies and discloses', () => {
    const original = 'alpha\nbeta\ngamma\ndelta\n'
    const patch = '@@ -2,3 +2,6 @@\n beta\n gamma\n+one\n+two\n'

    const options = new PatchOptions()
    options.Truncation = 'warn'
    const result = Patcher.Apply(patch, TestHelpers.singleFile(original), options)
    expect(result.Files[0].OutputFullText).toBe('alpha\nbeta\ngamma\none\ntwo\ndelta\n')
    expect(result.Files[0].TruncationSuspected).toBe(true)
    expect(result.Files[0].Errors.length).toBe(0)
  })

  it('truncated final hunk under ignore policy applies without the flag', () => {
    const original = 'alpha\nbeta\ngamma\ndelta\n'
    const patch = '@@ -2,3 +2,6 @@\n beta\n gamma\n+one\n+two\n'

    const options = new PatchOptions()
    options.Truncation = 'ignore'
    const result = Patcher.Apply(patch, TestHelpers.singleFile(original), options)
    expect(result.Files[0].OutputFullText).toBe('alpha\nbeta\ngamma\none\ntwo\ndelta\n')
    expect(result.Files[0].TruncationSuspected).toBe(false)
  })

  // A change-ending hunk whose counts are consistent must not be flagged under
  // 'warn' — the disclosure is for the tear signature only, not for ending on '+'.
  it('complete change-ending hunk under warn policy is not flagged', () => {
    const original = 'alpha\nbeta\ngamma\ndelta\n'
    const patch = '@@ -2,2 +2,3 @@\n beta\n gamma\n+one\n'

    const options = new PatchOptions()
    options.Truncation = 'warn'
    const result = Patcher.Apply(patch, TestHelpers.singleFile(original), options)
    expect(result.Files[0].OutputFullText).toBe('alpha\nbeta\ngamma\none\ndelta\n')
    expect(result.Files[0].TruncationSuspected).toBe(false)
  })

  // Delete-branch tear symmetry: a COMPLETE delete hunk whose old header merely
  // over-counts (newDeficit == 0) is miscount slop, not a tear -- it must apply even under
  // the strict 'error' policy, mirroring the over-counted-append treatment.
  it('complete delete hunk with over-counted header applies under error policy', () => {
    const original = 'alpha\nbeta\ngamma\ndelta\n'
    const patch = '@@ -3,3 +3,1 @@\n gamma\n-delta\n'

    const options = new PatchOptions()
    options.Truncation = 'error'
    const result = Patcher.Apply(patch, TestHelpers.singleFile(original), options)
    expect(result.Files[0].Errors.length).toBe(0)
    expect(result.Files[0].OutputFullText).toBe('alpha\nbeta\ngamma\n')
  })

  // The mirror still fires: a delete-ending body cut mid-delete-run (new side ALSO short,
  // old side shorter still) is a genuine tear, rejected under 'error'.
  it('truncated delete-ending final hunk errors under error policy', () => {
    const original = 'a\nb\nc\nd\ne\nf\n'
    const patch = '@@ -2,5 +2,2 @@\n b\n-c\n-d\n'

    const options = new PatchOptions()
    options.Truncation = 'error'
    expect(() => Patcher.Apply(patch, TestHelpers.singleFile(original), options)).toThrow(/truncated/)
  })

  // Real-world capture: patching a file that CONTAINS diff literals (this repo's
  // own tests). Context lines like "     @@ -1 +1 @@" and "     --- file1.ts ---"
  // were unmasked by the indent-stripping heuristics into real hunk/file headers,
  // shredding the patch into phantom-file groups that routed nowhere — reported as
  // success with 0 edits. Content evidence must win: a line reading as ' ' + an
  // exact file line is context, and no structure detection may reinterpret it.
  it('context containing diff literals applies instead of silent no-op', () => {
    const original =
      'var d = """\n' +
      '    --- file1.ts ---\n' +
      '    @@ -1 +1 @@\n' +
      '    -old1\n' +
      '    +new1\n' +
      '    --- file2.ts ---\n' +
      '    @@ -1 +1 @@\n' +
      '    -old2\n' +
      '    +new2\n' +
      '    """;\n'
    const patch =
      '--- a/t.cs\n+++ b/t.cs\n@@ -1,10 +1,11 @@\n' +
      ' var d = """\n' +
      '     --- file1.ts ---\n' +
      '     @@ -1 +1 @@\n' +
      '     -old1\n' +
      '     +new1\n' +
      '     --- file2.ts ---\n' +
      '     @@ -1 +1 @@\n' +
      '     -old2\n' +
      '     +new2\n' +
      '     """;\n' +
      '+var x = 1;\n'

    const result = Patcher.Apply(patch, TestHelpers.singleFile(original))
    expect(result.Files[0].OutputFullText).toBe(original + 'var x = 1;\n')
    expect(result.Files[0].Errors.length).toBe(0)
  })

  // A diff addressing files we don't hold is a defect of the REQUEST — provable
  // from the diff and the input keys alone, before reading any file content — so
  // it throws in BOTH modes, like a parse failure. ContinueOnError governs only
  // per-file content mismatches. (These hunks were once dropped without a trace,
  // reporting misdirected patches as clean zero-edit successes.)
  it('foreign hunks throw in single-file mode', () => {
    const original = 'alpha\nbeta\n'
    const patch =
      '--- a/one.ts\n+++ b/one.ts\n@@ -1,1 +1,1 @@\n-alpha\n+ALPHA\n' +
      '--- a/two.ts\n+++ b/two.ts\n@@ -1,1 +1,1 @@\n-zzz\n+ZZZ\n'

    const ex = TestHelpers.assertThrows(() => Patcher.Apply(patch, TestHelpers.singleFile(original)))
    expect(ex.Error.Type).toBe('FileMismatch')
    expect(ex.Errors.length).toBe(2) // every foreign group reported, not just the first
  })

  // Multi-file mode: a hunk group keyed outside the input set fails the whole
  // patch atomically — no partial apply of the matching files. The error names
  // the foreign key and the files actually being patched, so the caller can fix
  // the header and resend.
  it('foreign hunks throw even in continue mode (multi-file)', () => {
    const patch =
      '--- a/one.ts\n+++ b/one.ts\n@@ -1,1 +1,1 @@\n-alpha\n+ALPHA\n' +
      '--- a/three.ts\n+++ b/three.ts\n@@ -1,1 +1,1 @@\n-zzz\n+ZZZ\n'

    const ex = TestHelpers.assertThrows(() => Patcher.Apply(patch, [
      new PatchInputFile('one.ts', 'alpha\n'),
      new PatchInputFile('two.ts', 'beta\n')]))

    expect(ex.Error.Type).toBe('FileMismatch')
    expect(ex.Error.FileKey).toBe('three.ts')  // names the foreign file
    expect(ex.Error.Hint).toContain('one.ts')  // and the valid roster
    expect(ex.Error.Hint).toContain('two.ts')
  })

  // Throw-mode (ContinueOnError = false) naturally agrees: request errors throw
  // in every mode.
  it('foreign hunks throw in throw mode', () => {
    const patch =
      '--- a/one.ts\n+++ b/one.ts\n@@ -1,1 +1,1 @@\n-alpha\n+ALPHA\n' +
      '--- a/three.ts\n+++ b/three.ts\n@@ -1,1 +1,1 @@\n-zzz\n+ZZZ\n'

    const options = new PatchOptions()
    options.ContinueOnError = false
    expect(() => Patcher.Apply(patch, [new PatchInputFile('one.ts', 'alpha\n')], options))
      .toThrow(PatchException)
  })

  // Real-world capture: deleting a line that starts "-- " must be authored
  // "--- <content>", and
  // path-like content (a dot or slash) made the in-body header check read it
  // as a foreign file header — the hunk died loud as FileMismatch. Content
  // evidence now outranks the structure heuristic: the file contains the
  // "-- X" line verbatim, so it is a deletion.
  it('body triple-dash with path-like content is a deletion when the file has it', () => {
    const original = 'intro\n-- verified live: the a/b.txt repros\ntail\n'
    const patch = `@@ -1,3 +1,2 @@
 intro
--- verified live: the a/b.txt repros
 tail
`

    const result = Patcher.Apply(patch, TestHelpers.singleFile(original))

    expect(result.Files[0].Errors.length).toBe(0)
    expect(result.Files[0].OutputFullText).toBe('intro\ntail\n')
  })

  // Evidence-ladder rule 1 pinned: a transition to a file we HOLD is a real header
  // even when the current file also contains the "-- X" content reading.
  it('real header transition wins when the target file is held', () => {
    const patch = `--- a.ts
+++ a.ts
@@ -1,2 +1,1 @@
 keep
-drop
--- b.ts
+++ b.ts
@@ -1,1 +1,1 @@
-old
+new
`

    const result = Patcher.Apply(patch, [
      new PatchInputFile('a.ts', 'keep\ndrop\n-- b.ts\n'),
      new PatchInputFile('b.ts', 'old\n')])

    for (const f of result.Files) expect(f.Errors.length).toBe(0)
    expect(result.Files[0].OutputFullText).toBe('keep\n-- b.ts\n')
    expect(result.Files[1].OutputFullText).toBe('new\n')
  })

  // Evidence-ladder insert side: "+++ X" with path-like X inside a verified diff-shaped
  // region is an insertion of "++ X", not a header. Real header pairs never
  // reach this rule — their "+++" follows a header-read "---", outside a body.
  it('body triple-plus with path-like content is an insert in a diff-shaped region', () => {
    const original = 'docs\n context\n-old\n+new\n end\ntail\n'
    const patch = `@@ -2,3 +2,4 @@
  context
 -old
+++ x/y.md
 +new
`

    const result = Patcher.Apply(patch, TestHelpers.singleFile(original))

    expect(result.Files[0].Errors.length).toBe(0)
    expect(result.Files[0].OutputFullText).toBe('docs\n context\n-old\n++ x/y.md\n+new\n end\ntail\n')
  })

  // escapeDamage corpus cases 388/667: a no-context
  // replacement whose delete block was damaged in transit (one bad char defeats
  // every search pass) used to read as already applied whenever the insert image
  // coincidentally existed elsewhere — the whole replacement dropped silently.
  // A near-complete copy of the old image disjoint from the insert image proves
  // the edit is still pending, so the chunk now errors loudly instead.
  it('damaged no-context delete errors instead of silently dropping', () => {
    const original =
      'function calc(a, b) {\n' +
      '    let sum = a + b;\n' +
      '    let diff = a - b;\n' +
      '    let prod = a * b;\n' +
      '    let quot = a / b;\n' +
      '    return sum;\n' +
      '}\n' +
      'helper();\n' +
      'done();\n'

    // "diff" damaged to "dfif" in the delete block; the insert lines happen
    // to exist verbatim at the end of the file.
    const patch =
      '@@ -1,7 +1,2 @@\n' +
      '-function calc(a, b) {\n' +
      '-    let sum = a + b;\n' +
      '-    let dfif = a - b;\n' +
      '-    let prod = a * b;\n' +
      '-    let quot = a / b;\n' +
      '-    return sum;\n' +
      '-}\n' +
      '+helper();\n' +
      '+done();\n'

    const result = Patcher.Apply(patch, TestHelpers.singleFile(original))
    expect(result.Files[0].OutputFullText).toBe(original)
    expect(result.Files[0].Errors.filter(e => e.Type == 'MatchNotFound').length).toBe(1)
    expect(result.Files[0].AlreadyAppliedCount).toBe(0)
  })

  // The veto's overlap exclusion: re-sending an applied no-context block rewrite
  // must stay an already-applied no-op. The applied region shares most lines with
  // the old image (a rewrite re-states its unchanged lines as -/+), so a
  // near-old-image window that overlaps the insert image is the applied edit
  // itself, not evidence of a pending one.
  it('no-context rewrite re-apply stays a no-op', () => {
    const applied =
      'function calc(a, b) {\n' +
      '    let sum = a + b;\n' +
      '    let diff = a - b;\n' +
      '    let total = sum + diff;\n' +
      '    return total;\n' +
      '}\n'

    const patch =
      '@@ -1,6 +1,6 @@\n' +
      '-function calc(a, b) {\n' +
      '-    let sum = a + b;\n' +
      '-    let diff = a - b;\n' +
      '-    let old = sum - diff;\n' +
      '-    return old;\n' +
      '-}\n' +
      '+function calc(a, b) {\n' +
      '+    let sum = a + b;\n' +
      '+    let diff = a - b;\n' +
      '+    let total = sum + diff;\n' +
      '+    return total;\n' +
      '+}\n'

    const result = Patcher.Apply(patch, TestHelpers.singleFile(applied))
    expect(result.Files[0].OutputFullText).toBe(applied)
    expect(result.Files[0].Errors.length).toBe(0)
    expect(result.Files[0].AlreadyAppliedCount).toBe(1)
  })

  // Corpus cases 388/667/909 (escapeDamage), the shape the veto exists for: a
  // pure-delete hunk with thin context, one delete line damaged in transit
  // (there, a tab degraded to literal backslash-t text). The post-image of a
  // pure delete is just its context — brace and blank lines, present all over
  // the file INCLUDING inside the pending block itself — so the chunk read as
  // already applied and the whole delete silently dropped. Pins two rules: the
  // window is the delete block without context, and pure deletes get no
  // insert-occurrence exclusion (context-only images prove nothing).
  it('damaged pure delete with trivia context errors instead of silently dropping', () => {
    const original =
      'public class Sample {\n' +
      '\n' +
      '    public static void main(String[] args) {\n' +
      '        System.getProperties().forEach(this::dump);\n' +
      '        Class.forName("org.example.Factory");\n' +
      '    }\n' +
      '\n' +
      '}\n'

    // "forEach" damaged to "forEech" in the delete block; the context is a
    // blank line and a lone brace, both of which also occur inside the block
    const patch =
      '@@ -2,7 +2,2 @@\n' +
      '\n' +
      '-    public static void main(String[] args) {\n' +
      '-        System.getProperties().forEech(this::dump);\n' +
      '-        Class.forName("org.example.Factory");\n' +
      '-    }\n' +
      '-\n' +
      ' }\n'

    const result = Patcher.Apply(patch, TestHelpers.singleFile(original))
    expect(result.Files[0].OutputFullText).toBe(original)
    expect(result.Files[0].Errors.filter(e => e.Type == 'MatchNotFound').length).toBe(1)
    expect(result.Files[0].AlreadyAppliedCount).toBe(0)
  })

  // Production capture 2026-07: a raw NUL byte in a replacement string was applied
  // verbatim, turning the target file "binary" for grep and friends — silent
  // corruption, the exact failure class the philosophy forbids. A raw control
  // character in an INSERT line is provable damage from the diff alone (no target
  // needed), so the 'error' policy — the DEFAULT — rejects at parse time,
  // all-or-nothing, naming the offending code points.
  it('NUL in insert line rejects at parse time under the default policy', () => {
    const original = 'alpha\nbeta\n'
    const patch = '@@ -1,2 +1,2 @@\n alpha\n-beta\n+be\0ta\n'

    expect(() => Patcher.Apply(patch, TestHelpers.singleFile(original))).toThrow(/control.*U\+0000/s)
  })

  // 'warn' applies and surfaces PatchOutputFile.ControlCharsSuspected — the
  // TruncationSuspected channel shape — for callers that would rather disclose
  // than block (e.g. a pipeline that post-audits its writes).
  it('NUL in insert line applies and discloses under warn policy', () => {
    const original = 'alpha\nbeta\n'
    const patch = '@@ -1,2 +1,2 @@\n alpha\n-beta\n+be\0ta\n'

    const options = new PatchOptions()
    options.ControlChars = 'warn'
    const result = Patcher.Apply(patch, TestHelpers.singleFile(original), options)
    expect(result.Files[0].OutputFullText).toBe('alpha\nbe\0ta\n')
    expect(result.Files[0].ControlCharsSuspected).toBe(true)
    expect(result.Files[0].Errors.length).toBe(0)
  })

  // Pins the suspect-set boundary: tab is content and form feed is a real (if
  // archaic) page-break character — both apply untouched under the DEFAULT policy.
  it('tab and form-feed inserts apply under the default policy', () => {
    const original = 'alpha\nbeta\n'
    const patch = '@@ -1,2 +1,3 @@\n alpha\n beta\n+col1\tcol2\n+\f\n'

    const result = Patcher.Apply(patch, TestHelpers.singleFile(original))
    expect(result.Files[0].OutputFullText).toBe('alpha\nbeta\ncol1\tcol2\n\f\n')
    expect(result.Files[0].ControlCharsSuspected).toBe(false)
    expect(result.Files[0].Errors.length).toBe(0)
  })

  // Pins insert-only scope: delete lines are the caller's assertions about EXISTING
  // file content, resolved by matching — policing them would prevent deleting an
  // already-damaged line, which is precisely the repair a NUL incident needs.
  it('NUL in delete line is not policed and the deletion applies', () => {
    const original = 'alpha\nbe\0ta\ngamma\n'
    const patch = '@@ -1,3 +1,2 @@\n alpha\n-be\0ta\n gamma\n'

    const result = Patcher.Apply(patch, TestHelpers.singleFile(original))
    expect(result.Files[0].OutputFullText).toBe('alpha\ngamma\n')
    expect(result.Files[0].Errors.length).toBe(0)
  })
})
