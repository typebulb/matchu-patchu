import { Hunk, Chunk, PatchOptions, UniqueMatch, MatchState, LineType, DiffLocation } from '../models.js';
import { Search } from './search.js';
import { Block } from './hunkSlicer.js';

/// <summary>
/// Anchors blocks within a hunk using progressive context growth and adjacent block coalescing.
/// Returns one Chunk per original Block; coalescing is only a virtual search window.
/// </summary>
export class BlockAnchorer {
    public static AnchorBlocks(
        hunk: Hunk,
        blocks: ReadonlyArray<Block>,
        lines: ReadonlyArray<string>,
        options: PatchOptions
    ): Iterable<Chunk> {
        return blocks.map((focus, index: number) =>
        { 				
            let aboveEdge = focus.StartIndex;
            let belowEdge = focus.EndIndex;
            let aboveBlockIdx = index - 1;
            let belowBlockIdx = index + 1;
            let chunk: Chunk | null = null;

            while (true) {
                const aboveBound = aboveBlockIdx >= 0 ? blocks[aboveBlockIdx].EndIndex + 1 : 0;
                const belowBound = belowBlockIdx < blocks.length ? blocks[belowBlockIdx].StartIndex - 1 : hunk.Lines.length - 1;

                // must start at 1, not 0, because occasionally we need a single context line to correctly indent even if the lines don't match
                for (let k = 1; k <= options.ContextWindowMax; k++) {
                    const ctxAbove = BlockAnchorer.ContextLines(hunk, aboveEdge - 1, aboveBound, k, true);
                    const ctxBelow = BlockAnchorer.ContextLines(hunk, belowEdge + 1, belowBound, k, false);
                    const needle = BlockAnchorer.BuildNeedle(hunk, aboveEdge, belowEdge);
                    const match = BlockAnchorer.Anchor(lines, ctxAbove, needle, ctxBelow);
                    // The chunk carries the focus block's own adjacent context, not the
                    // (possibly coalesced) search window's: window-edge context belongs
                    // to a neighbouring block and would mislead indent anchoring and
                    // already-applied detection downstream.
                    chunk = new Chunk(
                        aboveEdge == focus.StartIndex ? ctxAbove : BlockAnchorer.ContextLines(hunk, focus.StartIndex - 1, 0, k, true),
                        focus.DeleteLines,
                        focus.InsertLines,
                        belowEdge == focus.EndIndex ? ctxBelow : BlockAnchorer.ContextLines(hunk, focus.EndIndex + 1, hunk.Lines.length - 1, k, false),
                        BlockAnchorer.AlignMatchToFocus(match, hunk, aboveEdge, focus.StartIndex),
                        new DiffLocation(hunk, focus.StartIndex, focus.EndIndex)
                    );
                    if (!(chunk.Match.IsAmbiguous)) return chunk;
                    if (ctxAbove.length < k && ctxBelow.length < k) break;
                }

                // Try to coalesce with adjacent blocks
                if (aboveBlockIdx < 0 && belowBlockIdx >= blocks.length) break;

                const ctxAboveCount = aboveBlockIdx >= 0 ? aboveEdge - (blocks[aboveBlockIdx].EndIndex + 1) : Number.MAX_SAFE_INTEGER;
                const ctxBelowCount = belowBlockIdx < blocks.length ? blocks[belowBlockIdx].StartIndex - (belowEdge + 1) : Number.MAX_SAFE_INTEGER;
                
                if (ctxBelowCount <= ctxAboveCount && belowBlockIdx < blocks.length)
                    belowEdge = blocks[belowBlockIdx++].EndIndex;
                else
                    aboveEdge = blocks[aboveBlockIdx--].StartIndex;
            }

            // Last-resort tiebreaker: when context growth and coalescing both fail to
            // produce a unique anchor, fall back to the hunk header's line number — but only
            // if that line number is unambiguous (either points exactly at a candidate, or
            // is far closer to one candidate than to any other).
            if (chunk!.Match.IsAmbiguous && hunk.OldStart >= 0) {
                const tiebroken = BlockAnchorer.TryLineNumberTiebreak(hunk, focus, lines);
                if (tiebroken != null) chunk = chunk!.with({ Match: tiebroken });
            }
            return chunk!;
        });
    }

    static TryLineNumberTiebreak(hunk: Hunk, focus: Block, lines: ReadonlyArray<string>): UniqueMatch | null
    {
        // Translate the hunk-header line number into the expected 0-based anchor line
        // for this focus block, by counting old-side (Context+Delete) lines that precede it.
        let expectedLine = hunk.OldStart - 1;
        for (let i = 0; i < focus.StartIndex; i++)
            if (hunk.Lines[i].Type != LineType.Insert) expectedLine++;

        if (focus.DeleteLines.length == 0) {
            // Pure insert with ambiguous context: every line position is a valid insertion
            // candidate, so the header line number directly identifies the intended slot.
            if (expectedLine < 0 || expectedLine > lines.length) return null;
            if (! BlockAnchorer.CtxMatchesAtSlot(hunk, focus, lines, expectedLine)) return null;
            return new UniqueMatch(MatchState.Success, expectedLine);
        }

        const candidates = Search.FindAllExact(lines, focus.DeleteLines);
        const resolved = Search.TiebreakByLineNumber(candidates, expectedLine);
        // The candidate set is delete-content-only (FindAllExact ignores context), so a
        // header pointing at an occurrence whose surrounding context contradicts the hunk
        // would silently mis-anchor there. Revalidate context at the resolved slot, the
        // way the pure-insert branch does via CtxMatchesAtSlot: context-equivalent
        // candidates (the legitimate tiebreak) still pass; a contradicting slot stays loud.
        return resolved != null && BlockAnchorer.CtxMatchesAtSlot(hunk, focus, lines, resolved)
            ? new UniqueMatch(MatchState.Success, resolved) : null;
    }

    // Validates the hunk's immediate context lines against a resolved slot's
    // neighbours so a stale or shifted header errs loudly instead of silently
    // mis-placing the edit. Content-bearing context compares under the search's own
    // strictness ladder — the revalidation must not be stricter than the search that
    // produced the candidates, or indent-slopped slots the search matched get
    // rejected loudly. But a line that trims to near-nothing (brace/paren-only)
    // carries its signal IN the indentation, which every ladder pass beyond rstrip
    // erases — such context stays whitespace-right-trimmed strict, or a shifted
    // header walks the edit to any same-shaped brace. Both tolerances corpus-measured
    // 2026-07-06 (ladder-everywhere: 3 silent mis-applies; this gate: 0, +14 recall).
    // Serves both callers: a pure insert (DeleteLines empty, after-context sits at
    // `slot`) and a delete-block tiebreak (deletes occupy [slot, slot + DeleteLines.length)).
    static CtxMatchesAtSlot(hunk: Hunk, focus: Block, lines: ReadonlyArray<string>, slot: number): boolean {
        const MinLadderContent = 3; // trimmed chars needed before ladder tolerance applies
        const matches = (hunkIdx: number, lineIdx: number) => {
            if (hunkIdx < 0 || hunkIdx >= hunk.Lines.length || hunk.Lines[hunkIdx].Type != LineType.Context)
                return true; // no context on this side — nothing to validate
            if (lineIdx < 0 || lineIdx >= lines.length) return false;
            const text = hunk.Lines[hunkIdx].Text;
            return text.trim().length >= MinLadderContent
                ? Search.LinesEquivalent(lines[lineIdx], text)
                : lines[lineIdx].trimEnd() == text.trimEnd();
        };
        return matches(focus.StartIndex - 1, slot - 1)
            && matches(focus.EndIndex + 1, slot + focus.DeleteLines.length);
    }


    static AlignMatchToFocus(match: UniqueMatch, hunk: Hunk, needleStartIndex: number, focusStartIndex: number): UniqueMatch {
        if (!match.IsSuccess) return match;
        return new UniqueMatch(
            match.State,
            match.LineIndex + hunk.Lines
                .slice(needleStartIndex, focusStartIndex)
                .filter(l => l.Type != LineType.Insert).length,
            match.Fuzz
        );
    }

    static ContextLines(hunk: Hunk, startLine: number, bound: number, maxTake: number, isAbove: boolean): string[] {
        if (maxTake <= 0) return [];
                    
        const lines: string[] = [];
        for (let i = 0; i < maxTake; i++) {
            const index = startLine + (isAbove ? -i : i);
            if (!(index >= 0 && index < hunk.Lines.length)) break;
            if (!(isAbove ? index >= bound : index <= bound)) break;
            const line = hunk.Lines[index];
            if (line.Type != LineType.Context) break;
            lines.push(line.Text);
        }

        return isAbove ? [...lines].reverse() : lines;
    }

    static BuildNeedle(h: Hunk, startIndex: number, endIndex: number): ReadonlyArray<string> {
        return h.Lines
            .slice(startIndex, endIndex + 1)
            .filter(line => line.Type != LineType.Insert)
            .map(line => line.Text)
    }
            
    static Anchor(
        lines: ReadonlyArray<string>,
        contextAbove: ReadonlyArray<string>,
        deleteLines: ReadonlyArray<string>,
        contextBelow: ReadonlyArray<string>
    ) {
        if (deleteLines.length == 0)
            return Search.FindContextAnchor(lines, contextAbove, contextBelow);

        const pattern = contextAbove.concat(deleteLines).concat(contextBelow);
        const match = Search.FindUnique(lines, pattern);
        if (match.IsAmbiguous) return UniqueMatch.Ambiguous;
        if (match.IsSuccess)   return new UniqueMatch(match.State, match.LineIndex + contextAbove.length, match.Fuzz);

        // fall back to delete-only; if match is successful, a single context line above/below can still be used for indentation
        return Search.FindUnique(lines, deleteLines);
    }
}
