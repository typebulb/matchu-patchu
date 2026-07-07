import { UniqueMatch, MatchState } from '../models.js';
import { TextUtils } from '../utils/textUtils.js';
import { ArrayUtils } from '../utils/arrayUtils.js';

/// <summary>
/// Result of a context search: the index where the needle was found (or -1) 
/// and the accumulated fuzz cost (0 if none).
/// </summary>
export class Match { constructor(public LineIndex: number, public Fuzz: number) {} }

export class Search
{
    // Whitespace matching modes with their per-line fuzz
    static readonly StrictnessPasses: Array<{ Transform: (s:string)=>string, Fuzz:number }> =
    [
        { Transform: s => s           , Fuzz: 0   }, // exact
        { Transform: s => s.trimEnd() , Fuzz: 1   }, // rstrip
        { Transform: s => s.trim()    , Fuzz: 100 }, // strip
        { Transform: s => TextUtils.NormalizeHomoglyphs(s).trim(), Fuzz: 200 }, // homoglyphs + strip
        { Transform: s => TextUtils.NormalizeHomoglyphs(TextUtils.StripInvisibles(s)).trim(), Fuzz: 300 }, // invisibles stripped + homoglyphs + strip
        { Transform: s => TextUtils.NormalizeHomoglyphs(TextUtils.FoldCanonicalAndFullwidth(TextUtils.StripInvisibles(s))).trim(), Fuzz: 400 }  // + NFC and fullwidth folds
    ];

    /// <summary>
    /// Attempts to locate <paramref name="needle"/> inside <paramref name="haystack"/>,
    /// applying the strictness passes in order, strictest first.
    /// Returns a FindResult with Index == -1 if no match.
    /// Passes whose per-line fuzz exceeds <paramref name="maxPassFuzz"/> are skipped:
    /// callers that treat a match as evidence the file already contains specific text
    /// (rather than as an anchor to edit) pass 100 to exclude the homoglyph and
    /// invisible-stripping passes.
    /// </summary>
    public static Find(haystack: ReadonlyArray<string>, needle: ReadonlyArray<string>, startIndex: number = 0, maxPassFuzz: number = Number.MAX_SAFE_INTEGER)
    {
        if (needle.length == 0)
            return new Match(Math.min(Math.max(startIndex, 0), haystack.length), 0);

        if (haystack.length < needle.length)
            return new Match(-1, 0);

        for (const { Transform: transform, Fuzz: fuzz } of Search.StrictnessPasses.filter(p => p.Fuzz <= maxPassFuzz)) {
            const transformedNeedle = Array.from(needle).map(transform);
            for (let i = startIndex; i <= haystack.length - needle.length; i++) {
                let match = true;
                for (let j = 0; j < needle.length; j++) {
                    if (transform(haystack[i + j]) != transformedNeedle[j]) {
                        match = false;
                        break;
                    }
                }
                if (!match) continue;
                
                let affected = 0;
                for (let k = 0; k < needle.length; k++) {
                    if (transform(haystack[i + k]) != haystack[i + k] || transformedNeedle[k] != needle[k])
                        affected++;
                }					
                return new Match(i, fuzz * affected);
            }
        }
        return new Match(-1, 0);
    }

    /// <summary>
    /// True when two lines are equal under any of the strictness passes the anchor
    /// search itself uses. Used to revalidate context at a line-number-tiebroken slot:
    /// the revalidation must not be stricter than the search that produced the
    /// candidates, or slots the search considered equivalent (indent slop, homoglyphs)
    /// get rejected loudly instead of applied.
    /// </summary>
    public static LinesEquivalent(a: string, b: string): boolean {
        return Search.StrictnessPasses.some(p => p.Transform(a) == p.Transform(b));
    }

    /// <summary>
    /// Attempts to find a unique match and reports ambiguity without requiring a separate call.
    /// Success=true when exactly one match; Ambiguous=true when more than one match exists; both false when none.
    /// </summary>
    public static FindUnique(haystack: ReadonlyArray<string>, needle: ReadonlyArray<string>)
    {
        const first = Search.Find(haystack, needle);
        if (first.LineIndex < 0)
            return UniqueMatch.NotFound;

        const second = Search.Find(haystack, needle, first.LineIndex + 1);
        if (second.LineIndex >= 0)
            return UniqueMatch.Ambiguous;

        return new UniqueMatch(MatchState.Success, first.LineIndex, first.Fuzz);
    }
    
    /// <summary>
    /// Finds the best insertion anchor for a pure-insert hunk using provided context lines.
    /// Attempts, in order: full pattern (pre+post), pre-only (insert after pre), post-only (insert before post).
    /// If none uniquely match, returns a non-success result with Ambiguous flag when any side matches somewhere.
    /// </summary>
    public static FindContextAnchor(
        haystack: ReadonlyArray<string>,
        contextBefore: ReadonlyArray<string>,
        contextAfter: ReadonlyArray<string>)
    {
        const preCount = contextBefore.length;
        let sawAmbiguity = false;

        const searchPatterns = [
            { pattern: contextBefore.concat(contextAfter), insertIndex: preCount, condition: preCount + contextAfter.length > 0 },
            { pattern: contextBefore, insertIndex: preCount, condition: preCount > 0 },
            { pattern: contextAfter, insertIndex: 0, condition: contextAfter.length > 0 }
        ];

        for (const { pattern, insertIndex, condition } of searchPatterns) {
            if (!condition) continue;
            const match = Search.FindUnique(haystack, pattern);
            if (match.IsSuccess)
                return new UniqueMatch(MatchState.Success, match.LineIndex + insertIndex, match.Fuzz);
            if (match.IsAmbiguous)
                sawAmbiguity = true;
        }

        return new UniqueMatch(sawAmbiguity ? MatchState.Ambiguous : MatchState.NotFound);
    }

    /// <summary>
    /// Returns every position in <paramref name="haystack"/> where <paramref name="needle"/>
    /// matches exactly (no whitespace fuzz). Used for line-number tiebreaking among
    /// ambiguous candidates — we deliberately exclude fuzzy matches so the candidate set
    /// reflects only positions the LLM could plausibly have meant.
    /// </summary>
    public static FindAllExact(haystack: ReadonlyArray<string>, needle: ReadonlyArray<string>): number[] {
        const results: number[] = [];
        if (needle.length == 0) return results;

        for (let i = 0; i + needle.length <= haystack.length; i++)
            if (needle.every((v, j) => haystack[i + j] === v))
                results.push(i);
        return results;
    }

    public static TiebreakByLineNumber(candidates: ReadonlyArray<number>, expectedLine: number): number | null {
        if (candidates.length == 0) return null;
        if (candidates.length == 1) return candidates[0];

        const sorted = ArrayUtils.OrderBy(
            candidates.map(c => ({ line: c, dist: Math.abs(c - expectedLine) })),
            x => x.dist);

        // First, check for a perfect match by line number:
        if (sorted[0].dist == 0) return sorted[0].line;

        // Next, check for a match that's 10 times or more closer than the next match:
        const gapToNext = sorted[1].dist - sorted[0].dist;
        if (gapToNext > sorted[0].dist * 10) return sorted[0].line;

        return null;
    }
}
