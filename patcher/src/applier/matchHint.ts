import { Chunk } from '../models.js';

/// <summary>
/// Diagnoses a MatchNotFound chunk against the file to enrich the error with a
/// targeted hint, staying silent without a confident candidate: a misleading
/// "did you mean" is worse than the generic summary.
/// </summary>
export class MatchHint {
    // A quoted line inside exactly one longer file line is the prose line-model
    // mistake: the author's "line" (a sentence of an unwrapped paragraph, or a
    // re-flowed hard wrap) is a slice of the file's physical line. Matching stays
    // refused — a head fragment is byte-identical to an elided whole-line delete,
    // so either auto-reading risks silent corruption — but naming the line is
    // correct under both readings: the retry re-quotes it whole.
    static SubLine(chunk: Chunk, lines: ReadonlyArray<string>): string | null {
        for (const q of chunk.DeleteLinesWithContext()) {
            if (q.trim().length < MatchHint.MinHintLineContent) continue;
            if (lines.includes(q)) continue; // present whole: not this line's problem
            const containing: number[] = [];
            for (let i = 0; i < lines.length && containing.length < 2; i++)
                if (lines[i].length > q.length && lines[i].includes(q)) containing.push(i);
            if (containing.length != 1) continue;
            return `The diff line "${MatchHint.Preview(q)}" matches only PART of line ` +
                   `${containing[0] + 1}, which is ${lines[containing[0]].length} characters long — ` +
                   `in prose, a whole paragraph is often one physical line. ` +
                   `Re-send the diff quoting entire lines exactly.`;
        }
        return null;
    }

    static Preview(s: string) {
        const t = s.trim();
        return t.length <= 60 ? t : t.slice(0, 57) + "...";
    }

    // Trimmed length a quoted line must reach before containment counts as
    // evidence: short strings occur inside longer lines by coincidence.
    static readonly MinHintLineContent = 12;
}
