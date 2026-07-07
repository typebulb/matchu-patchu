import { TextUtils } from '../utils/textUtils.js';
import { Hunk } from '../models.js';
import { PatchOptions } from '../models.js';
import { HunkSlicer } from './hunkSlicer.js';
import { BlockAnchorer } from './blockAnchorer.js';
import { Chunk } from '../models.js';
import { UniqueMatch } from '../models.js';
import { MatchState } from '../models.js';
import { Search } from './search.js';

/// <summary>Anchored chunks plus the count of chunks dropped as already applied —
/// the only reason the anchor filter drops a chunk. Surfaced so a zero-edit outcome
/// can report "already applied" instead of a bare no-op (MCP message split).</summary>
export class AnchorOutcome { constructor(public Chunks: Chunk[], public AlreadyAppliedCount: number) {} }

/// <summary>
/// Anchors hunks to the text to be patched.
/// </summary>
export class HunkAnchorer {
    public static Anchor(originalText: string, hunks: Iterable<Hunk>, options: PatchOptions): AnchorOutcome
    {
        const lines = TextUtils.ToLines(originalText);
        const slicedHunks = HunkSlicer.Slice(hunks);
        const chunks: Chunk[] = [];
        for (const sliced of slicedHunks)
            for (const chunk of BlockAnchorer.AnchorBlocks(sliced.Hunk, sliced.Blocks, lines, options))
                chunks.push(HunkAnchorer.UseFallbackAnchorIfNecessary(sliced.Hunk, chunk as Chunk, lines.length));

        // Non-blank lines deleted elsewhere in this patch: an insert of such a line is a
        // move, and AlreadyApplied would misread the not-yet-moved original as "the file
        // already looks patched" — so move chunks always survive the filter. A chunk's
        // OWN deletes don't count as moves: block rewrites routinely re-insert their own
        // first/last lines (-if (x) { … +if (x) {), and self-triggering the carve-out
        // would turn idempotent re-apply of the commonest diff shape into MatchNotFound.
        const deleteCounts = new Map<string, number>();
        for (const l of chunks.flatMap(c => c.DeleteLines))
            if (l.trim().length > 0) deleteCounts.set(l, (deleteCounts.get(l) ?? 0) + 1);
        const movedFromElsewhere = (c: Chunk, line: string) =>
            (deleteCounts.get(line) ?? 0) > c.DeleteLines.filter(d => d === line).length;

        // AppliedAtAnchor is position- and context-exact evidence, so it overrides the
        // moved-lines carve-out: a genuine not-yet-applied move never has the full
        // post-image sitting at the destination slot.
        const kept = chunks.filter(c =>
            ! HunkAnchorer.AppliedAtAnchor(lines, c) &&
            (c.InsertLines.some(l => movedFromElsewhere(c, l)) ||
             ! HunkAnchorer.AlreadyApplied(lines, c)))
            .map(c => HunkAnchorer.TrySubLineSplice(c, lines));
        return new AnchorOutcome(kept, chunks.length - kept.length);
    }

    static UseFallbackAnchorIfNecessary(hunk: Hunk, chunk: Chunk, lineCount: number) {
        if (chunk.Match.IsNotFound && hunk.Lines.length == chunk.InsertLines.length) {	
            // OldStart is 1-based from diff header
            // OldStart = -1 (bare @@) or OldStart = 1 both mean "insert at beginning" (index 0)
            // OldStart > 1 means "insert after line N" (index N)
            // Special case: OldStart=1 needs index 0, not 1, to avoid inserting after
            // the phantom empty line that ToLines('') produces for empty files
            const anchorLine = hunk.OldStart <= 1 ? 0 : hunk.OldStart;
            // A header pointing past EOF is a lying header, not an insertion point;
            // fabricating a success would silently drop the insert downstream.
            if (anchorLine > lineCount) return chunk;
            return new Chunk(
                chunk.ContextBefore, chunk.DeleteLines, chunk.InsertLines, chunk.ContextAfter,
                new UniqueMatch (MatchState.Success, anchorLine),
                chunk.DiffLocation
            );
        }
        return chunk;
    }

    // Sub-line splice fallback: a delete line that matches no file line but occurs
    // as a substring of exactly one line is an author-quoted fragment — an author
    // cannot intend to delete text they never mentioned, so the only coherent
    // reading replaces the fragment within the line and preserves the rest. Every
    // guard failure means fragment-vs-mangled-whole-line is undecidable: the chunk
    // stays NotFound and errors loudly. The insert-side guards catch damaged
    // whole-line edits: an insert that echoes text from outside the fragment, or
    // dwarfs it, was authored by someone who saw the whole line.
    // MUST run only on chunks that survived the already-applied filter: an applied
    // edit that wrapped the old line (comment-out, prefix insertion) leaves the
    // delete line as a substring of the new line, and splicing it again would
    // stack the wrapper (corpus wave-1 case 177: "#x" became "##x").
    static TrySubLineSplice(chunk: Chunk, lines: ReadonlyArray<string>): Chunk {
        if (! chunk.Match.IsNotFound || chunk.DeleteLines.length != 1 || chunk.InsertLines.length > 1)
            return chunk;

        const frag = chunk.DeleteLines[0];
        if (frag.trim().length < HunkAnchorer.MinSpliceFragmentContent) return chunk;

        let lineIndex = -1;
        for (let i = 0; i < lines.length; i++) {
            const first = lines[i].indexOf(frag);
            if (first < 0) continue;
            const again = lines[i].indexOf(frag, first + 1) >= 0;
            if (lineIndex >= 0 || again) return chunk; // second occurrence anywhere: ambiguous
            lineIndex = i;
        }
        if (lineIndex < 0) return chunk;

        const target = lines[lineIndex];
        const at = target.indexOf(frag);
        const prefix = target.slice(0, at), suffix = target.slice(at + frag.length);
        const insert = chunk.InsertLines.length == 1 ? chunk.InsertLines[0] : "";

        // A fragment opening the line with a non-empty tail remnant is
        // byte-identical to a tail-truncated whole-line delete — the one damage
        // shape transports actually produce (corpus wave-4 fragmentDamage:
        // 127/305 silent corruptions without this refusal). End-anchored and
        // interior fragments stay decidable: nothing truncates line heads.
        if (prefix.length == 0 && suffix.length > 0) return chunk;

        // A pure-fragment delete whose excision fuses two whitespace runs -- prefix ends
        // and suffix begins with whitespace -- leaves a gap where a token stood (removing
        // "foobarbaz" from "const foobarbaz = 5;" gives "const  = 5;"), indistinguishable
        // from a whole-line delete that simply missed. Stay loud. A fragment flanked by
        // non-space (", fails loudly") joins cleanly and still splices.
        if (insert.length == 0 && prefix.length > 0 && suffix.length > 0
            && /\s/.test(prefix[prefix.length - 1]) && /\s/.test(suffix[0]))
            return chunk;

        // A non-empty remnant must carry substantial content: a tiny or
        // whitespace-only remnant (a lone comment marker, a semicolon, pure
        // indentation) means the fragment is nearly the whole line, where
        // fragment-vs-differing-whole-line is undecidable.
        const remnantOk = (r: string) => r.length == 0 || r.trim().length >= HunkAnchorer.MinSpliceRemnantContent;
        const echoes = (r: string) => r.length > 0 && insert.includes(r.trim());
        // A dwarfing insert normally signals a damaged whole-line replacement — but an
        // insert that opens or closes with a substantial run of the fragment's own text
        // was authored by someone editing WITHIN what they quoted: a whole-line author
        // reproduces the remnants (the echo guards), not the fragment. The shared stem
        // re-decides the dwarf case as a fragment edit (prose tail-edits on long
        // soft-wrapped lines routinely dwarf what they replace).
        if (! remnantOk(prefix) || ! remnantOk(suffix) || echoes(prefix) || echoes(suffix) ||
            (insert.length > frag.length * 2 + 8
             && HunkAnchorer.SharedStem(frag, insert) < HunkAnchorer.MinSpliceStemContent))
            return chunk;

        return new Chunk(
            [], [target], [prefix + insert + suffix], [],
            new UniqueMatch(MatchState.Success, lineIndex, HunkAnchorer.SubLineSpliceFuzz),
            chunk.DiffLocation
        );
    }

    // Trimmed length a fragment must reach before substring evidence counts.
    static readonly MinSpliceFragmentContent = 8;

    // Trimmed length a non-empty out-of-fragment remnant must carry.
    static readonly MinSpliceRemnantContent = 4;

    // Trimmed length the fragment/insert shared stem must reach to waive the dwarf cap.
    static readonly MinSpliceStemContent = 8;

    // The longest run the insert shares with the fragment's start or end, in trimmed
    // chars — the fragment-edit evidence that waives the dwarf cap.
    static SharedStem(frag: string, insert: string): number {
        let p = 0;
        while (p < frag.length && p < insert.length && frag[p] == insert[p]) p++;
        let s = 0;
        while (s < frag.length && s < insert.length && frag[frag.length - 1 - s] == insert[insert.length - 1 - s]) s++;
        return Math.max(frag.slice(0, p).trim().length, s == 0 ? 0 : frag.slice(-s).trim().length);
    }

    // Reported fuzz for a spliced edit: looser than every line-match pass.
    static readonly SubLineSpliceFuzz = 500;

    // A sanity check to avoid errors for a chunk that is already applied.
    // Asymmetric strictness: insert-side evidence is capped at whitespace-level
    // passes (a homoglyph variant of the post-image is not proof the edit landed,
    // and would turn a loud MatchNotFound into a silent no-op), while the delete
    // side stays uncapped (finding the pre-image even loosely proves the edit is
    // still pending, blocking a false already-applied verdict).
    static AlreadyApplied(lines: ReadonlyArray<string>, c: Chunk) {
        if (! c.HasContextLines() && (c.IsPureDelete || c.IsPureInsert)) return false;
        const insertImage = c.HasContextLines() ? c.InsertLinesWithContext() : c.InsertLines;
        const deleteImage = c.HasContextLines() ? c.DeleteLinesWithContext() : c.DeleteLines;
        const insertAt = Search.Find(lines, insertImage, 0, HunkAnchorer.MaxAppliedEvidenceFuzz);
        return insertAt.LineIndex != -1 &&
               Search.Find(lines, deleteImage).LineIndex == -1 &&
               ! HunkAnchorer.OldImagePresentElsewhere(lines, c.DeleteLines,
                     c.IsPureDelete ? null : insertImage, insertAt.LineIndex);
    }

    // Veto on the already-applied verdict: "old image absent" cannot
    // distinguish an applied edit from a delete block damaged in transit — one bad
    // char defeats every search pass — so a window nearly matching the delete block
    // proves the old image is still in the file and the edit pending: keep the chunk
    // and let it error loudly. Refinements, each forced by a corpus counter-example:
    // - Windows overlapping an insert-image occurrence never veto: after a genuine
    //   apply the region shares most lines with the old image (rewrites re-state
    //   unchanged lines as -/+), and vetoing there would break idempotent re-apply.
    // - Pure deletes skip that exclusion (exclusionImage = null): their post-image
    //   is thin context that occurs everywhere — even inside the pending block
    //   itself — so its occurrences prove nothing.
    // - The window is the delete block WITHOUT context: context sits in both images
    //   and would glue the pending old image to a context match, masking it.
    // - Only content-bearing lines vote, with an absolute floor: blank/brace lines
    //   near-match everywhere and tiny blocks carry too little signal either way.
    static OldImagePresentElsewhere(lines: ReadonlyArray<string>, dels: ReadonlyArray<string>,
                                    exclusionImage: ReadonlyArray<string> | null, insertIndex: number) {
        const contentIdx = [...dels.keys()].filter(i => dels[i].trim().length > 0);
        if (contentIdx.length < HunkAnchorer.MinNearImageMatches) return false;

        const insertStarts = exclusionImage == null ? [] :
            [...Search.FindAllExact(lines, exclusionImage), insertIndex];
        const overlapsInsert = (start: number) =>
            insertStarts.some(s => start < s + exclusionImage!.length && s < start + dels.length);

        for (let start = 0; start + dels.length <= lines.length; start++) {
            if (overlapsInsert(start)) continue;
            const matched = contentIdx.filter(j => lines[start + j] === dels[j]).length;
            if (matched >= HunkAnchorer.MinNearImageMatches && matched * 2 > contentIdx.length)
                return true;
        }
        return false;
    }

    // Exact-matching content lines required before a near-old-image window counts.
    static readonly MinNearImageMatches = 3;

    // Highest per-line fuzz (strip pass) that still counts as already-applied evidence.
    static readonly MaxAppliedEvidenceFuzz = 100;

    // A successfully anchored pure-insert chunk whose full post-image (context +
    // inserted lines + context) already sits at the resolved slot — or immediately
    // before it — would duplicate itself if applied: the file already reflects this
    // chunk. Including the context lines in the comparison distinguishes "already
    // applied" from a diff that intentionally duplicates adjacent lines (there the
    // old-side context sits where the copy would be, so the post-image cannot match).
    static AppliedAtAnchor(lines: ReadonlyArray<string>, c: Chunk) {
        if (! c.IsPureInsert || ! c.Match.IsSuccess) return false;
        const post = c.InsertLinesWithContext();
        const slot = c.Match.LineIndex;
        // applied copy at the slot itself, or ending right where the slot begins
        return HunkAnchorer.RegionEquals(lines, slot - c.ContextBefore.length, post) ||
               HunkAnchorer.RegionEquals(lines, slot - c.ContextBefore.length - c.InsertLines.length, post);
    }

    static RegionEquals(lines: ReadonlyArray<string>, start: number, region: ReadonlyArray<string>) {
        if (start < 0 || start + region.length > lines.length) return false;
        for (let i = 0; i < region.length; i++)
            if (lines[start + i] !== region[i]) return false;
        return true;
    }
}
