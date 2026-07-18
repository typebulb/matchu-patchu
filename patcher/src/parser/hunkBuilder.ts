import { Hunk, LineType, DiffLine } from '../models.js';
import { DiffContentHeuristics } from './heuristics.js';

export class Header
{
    constructor(
    public Path: string | null = null,
    public OldStart: number = -1,
    public OldCount: number = 0,
    public NewStart: number = -1,
    public NewCount: number = 0,
    public DiffBodyStartLine: number = -1
) {}

    public static WithParsed(h: Header, parsedHdr: Header, diffBodyStartLine: number) {
        return new Header(h.Path, parsedHdr.OldStart, parsedHdr.OldCount, parsedHdr.NewStart, parsedHdr.NewCount, diffBodyStartLine);
    }

    public static ParseSide(header: Header, part: string, prefix: string, isOld: boolean) {
        if (!part.startsWith(prefix)) return header;
        
        const split = part.substring(1).split(',');
        const start = split.length > 0 && !isNaN(parseInt(split[0])) ? parseInt(split[0]) : -1;
        const count = split.length > 1 && !isNaN(parseInt(split[1])) ? parseInt(split[1]) : 1;
        
        return isOld 
            ? new Header(header.Path, start, count, header.NewStart, header.NewCount, header.DiffBodyStartLine)
            : new Header(header.Path, header.OldStart, header.OldCount, start, count, header.DiffBodyStartLine);
    }
}

export class HunkBuilder {
    readonly hunks: Hunk[] = [];
    readonly bodySeen = new Map<string, Set<number>>();

    public get Hunks() { return this.hunks; }

    // Only the diff's FINAL hunk can be torn by a cutoff, so the parser reads this
    // once, after the last commit; mid-diff the same signature is just sloppy counting.
    public LastHunkTruncated = false;

    // A closing ``` fence is completion evidence a token cutoff cannot emit — the
    // tear signature on a fence-closed hunk is miscount slop, not truncation.
    // (Trailing prose already clears the flag via the pure-context commit path.)
    public ClearTruncation() { this.LastHunkTruncated = false; }

    // Diff line of the first @@-headed body with real content but no change lines.
    // Such a hunk can never be intentional (its '+'/'-' markers were lost, and the
    // loss is ambiguous — adds or deletes?), so the parser rejects the whole diff
    // instead of silently dropping it. Bodies outside any hunk (prose before or
    // after a diff) and blank-only bodies keep flowing through silently.
    public ContextOnlyHunkLine: number | null = null;

    public CommitIfAny(hdr: Header, body: string[], fileLines?: string[])
    {
        if (body.length == 0) return;

        const blankContextDeletion = HunkBuilder.IsBlankContextDeletion(hdr.OldCount, hdr.NewCount, body);

        // pure context – skip
        if (!blankContextDeletion && !body.some(l => l.length > 0 && (l[0] == '-' || l[0] == '+'))) {
            this.LastHunkTruncated = false;
            if (hdr.DiffBodyStartLine >= 0 && this.ContextOnlyHunkLine == null && body.some(l => l.trim().length > 0))
                this.ContextOnlyHunkLine = hdr.DiffBodyStartLine;
            body.length = 0;
            return;
        }

        const diffLines = HunkBuilder.BuildLines(body, blankContextDeletion, fileLines);
        this.LastHunkTruncated = HunkBuilder.IsTruncated(hdr, diffLines);

        const oldSb: string[] = [];
        const newSb: string[] = [];
        let oldLines = 0, newLines = 0;

        for (const dl of diffLines) {
            switch (dl.Type) {
                case LineType.Insert:
                    newSb.push(dl.Text, '\n'); newLines++; break;
                case LineType.Delete:
                    oldSb.push(dl.Text, '\n'); oldLines++; break;
                case LineType.Context:
                    oldSb.push(dl.Text, '\n'); oldLines++;
                    newSb.push(dl.Text, '\n'); newLines++; break;
            }
        }

        const oldTxt = oldLines > 0 ? oldSb.join("") : "";
        const newTxt = newLines > 0 ? newSb.join("") : "";
        if (oldTxt == newTxt) { body.length = 0; return; }

        const hunk = new Hunk(hdr.Path ?? "", oldTxt, newTxt, hdr.OldStart);
        hunk.NewStart = hdr.NewStart;
        hunk.Lines = diffLines;
        hunk.DiffBodyStartLine = hdr.DiffBodyStartLine;

        this.AddHunk(hunk);
        body.length = 0;
    }

    // Token-limit cutoff: body ends mid-change-run and the header declares more lines
    // than delivered, asymmetrically. Symmetric deficits are stripped context (the
    // anchorer recovers) and never count. An insert-ending body is torn only when the
    // old side is ALSO short (promised trailing context never arrived): an old side
    // fully delivered is complete by its own header, and a new-side deficit alone is
    // overcount slop that must still apply — a complete append with a miscounted
    // header is indistinguishable from a mid-run cut, and counts are tie-breakers,
    // never sole grounds for rejection. A delete-ending body is the mirror: torn only
    // when the NEW side is also short (newDeficit > 0) AND the old side is shorter
    // still (the delete run was cut), so an over-counted-but-complete delete hunk
    // (newDeficit == 0) applies as overcount slop. Cost (both branches): a cut with no
    // trailing context owed on the completed side goes undetected.
    static IsTruncated(hdr: Header, lines: ReadonlyArray<DiffLine>): boolean {
        if (hdr.OldStart < 0 || hdr.NewStart < 0 || lines.length == 0) return false;
        const last = lines[lines.length - 1].Type;
        if (last == LineType.Context) return false;
        const actualOld = lines.filter(l => l.Type != LineType.Insert).length;
        const actualNew = lines.filter(l => l.Type != LineType.Delete).length;
        const oldDeficit = hdr.OldCount - actualOld, newDeficit = hdr.NewCount - actualNew;
        return last == LineType.Insert
            ? oldDeficit > 0 && newDeficit > oldDeficit
            : newDeficit > 0 && oldDeficit > newDeficit;
    }

    // Identical bodies collapse when the repeat adds no placement info (bare @@ or a
    // start line already seen) — LLM-slop duplication. But git legitimately emits
    // byte-identical hunks at distinct line numbers when a file repeats a pattern;
    // those are separate edits, and the anchorer's line-number tiebreak places each
    // at its own site. Distinct bodies always survive.
    AddHunk(h: Hunk) {
        const bodyKey = `${h.OldText}\n\u241E\n${h.NewText}`;
        const starts = this.bodySeen.get(bodyKey);
        if (starts) {
            if (h.OldStart < 0 || starts.has(-1) || starts.has(h.OldStart)) return;
            starts.add(h.OldStart);
        } else {
            this.bodySeen.set(bodyKey, new Set([h.OldStart]));
        }
        this.hunks.push(h);
    }

    static BuildLines(rawLines: string[], blankContextDeletion: boolean, fileLines?: string[]) {
        const result: DiffLine[] = [];
        let seenExplicitContext = false;
        const diffShaped = DiffContentHeuristics.IsDiffShapedRegion(rawLines, fileLines);

        for (let i = 0; i < rawLines.length; i++) {
            const raw = rawLines[i];

            // Trailing empty split token represents final newline terminator.
            if (raw.length == 0) {
                if (i == rawLines.length - 1) continue;
                result.push(new DiffLine(blankContextDeletion ? LineType.Delete : LineType.Context, ""));
                continue;
            }

            if (blankContextDeletion) {
                const c = raw[0];
                result.push(new DiffLine(LineType.Delete, (c == ' ' || c == '-') ? HunkBuilder.RemoveDiffPrefix(raw) : raw));
                continue;
            }

            switch (raw[0]) {
                case '+':
                case '-':
                    // Check if this is content with missing context prefix (e.g., "- list item" or "+ changelog")
                    if (fileLines && DiffContentHeuristics.IsMissingContextPrefix(raw, fileLines)) {
                        result.push(new DiffLine(LineType.Context, raw));
                        seenExplicitContext = true;
                        break;
                    }
                    if (raw[0] === '+') {
                        if (DiffContentHeuristics.IsSloppyDoublePlus(raw)) {
                            // '++X' is either a doubled marker (insert 'X') or marker +
                            // payload '+X'. Inserted content has no file image, so the
                            // REGION decides: verified diff-shaped context/deletes mean
                            // the payload keeps its '+'; otherwise collapse as sloppy
                            // doubling and record the raw line for disclosure.
                            result.push(diffShaped
                                ? new DiffLine(LineType.Insert, raw.substring(1))
                                : new DiffLine(LineType.Insert, HunkBuilder.RemoveDiffPrefix(raw), raw));
                            break;
                        }
                        result.push(new DiffLine(LineType.Insert, HunkBuilder.RemoveDiffPrefix(raw)));
                        break;
                    }
                    // Lines starting with '--X' (CSS vars, comments) are content, but '---' is deletion of '--'
                    if (DiffContentHeuristics.IsDoubleMarkerContent(raw)) {
                        // Content-verified strict reading: the file has the line the
                        // marker would delete ('-X') and not the literal doubled line
                        // ('--X') — a deletion in a diff-shaped payload, not CSS/SQL
                        // content.
                        if (fileLines && fileLines.some(l => l == raw.substring(1)) && !fileLines.some(l => l == raw)) {
                            result.push(new DiffLine(LineType.Delete, raw.substring(1)));
                            break;
                        }
                        // False positive check: If we've seen explicit context AND this is '-- ' (space after --),
                        // it's likely a deletion of a markdown list item '- text', not a CSS variable.
                        // Proper CSS vars in diffs appear as ' --var-name' (context lines with leading space).
                        if (seenExplicitContext && raw.length > 2 && raw[2] === ' ') {
                            // Strip only the first '-' (diff marker), keep the second '-' (markdown list marker)
                            result.push(new DiffLine(LineType.Delete, raw.substring(1)));
                        } else {
                        result.push(DiffContentHeuristics.ApplyRawLineHeuristic(raw, rawLines, i, seenExplicitContext, fileLines));
                        }
                    } else {
                        result.push(new DiffLine(LineType.Delete, HunkBuilder.RemoveDiffPrefix(raw)));
                    }
                    break;
                case ' ':
                    result.push(new DiffLine(LineType.Context, HunkBuilder.RemoveDiffPrefix(raw)));
                    seenExplicitContext = true;
                    break;
                default:
                    result.push(DiffContentHeuristics.ApplyRawLineHeuristic(raw, rawLines, i, seenExplicitContext, fileLines));
                    break;
            }
        }
        return result;
    }

    static IsBlankContextDeletion(oldCount: number, newCount: number, rawLines: string[]) {
        return oldCount > 0 && newCount == 0 && rawLines.every(l => l.length == 0 || l[0] == ' ');
    }

    // Strip diff prefix: ` foo` → `foo`, `-bar` → `bar`, `+baz` → `baz`
    // Sloppy doubled markers: `++code` → `code`, `++ code` → `code`
    // But NOT tripled: `---comment` → `--comment` (proper syntax for deleting `--comment`)
    // And NOT `-- text` which is deletion of `- text` (markdown list), not sloppy
    static RemoveDiffPrefix(s: string) {
        if (!s || s.length <= 1) return "";

        let result = s.substring(1);
        // Only ++ is sloppy; -- is proper deletion syntax (e.g., `-- text` = delete `- text`)
        if (DiffContentHeuristics.IsSloppyDoublePlus(s)) {
            result = result.substring(1);
            if (result[0] === ' ' || result[0] === '\t') result = result.substring(1);
        }
        return result;
    }
}