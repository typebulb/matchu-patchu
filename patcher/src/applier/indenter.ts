import { Chunk } from '../models.js';
import { TextUtils } from '../utils/textUtils.js';

class Anchor { constructor(public BaseIndent: string, public Shift: number) {} }

export class Indenter
{    
    static readonly DefaultTabSize = 4;

    /// <summary>
    /// Aligns an inserted block (<see cref="Chunk.InsertLines"/>) to the file’s
    /// indent context at <see cref="Chunk.LineIndex"/>, leveraging
    /// ContextBefore / ContextAfter when available.
    /// </summary>
    static AlignInsert(lines: ReadonlyArray<string>, chunk: Chunk) {
        const insert = chunk.InsertLines;
        if (insert.length == 0) return insert;

        const tabSize = Indenter.InferTabSize(lines.concat(insert));
        const anchor = Indenter.FindAnchor(lines, chunk.ContextBefore, chunk.Match.LineIndex - 1, true,  tabSize) ??
                        Indenter.FindAnchor(lines, chunk.ContextAfter,  chunk.Match.LineIndex,    false, tabSize) ??
                        new Anchor("", 0);

        const reindented = new Set(chunk.DeleteLines.map(l => Indenter.SplitIndent(l)[1]));

        // Indents a whitespace-only insert line may legitimately carry: a sibling
        // insert line's indent or the anchor's own. Anything else (e.g. an LLM's
        // stray "+ " single space) is slop, not content.
        const blankKeep = new Set(
            insert.filter(l => !Indenter.IsBlank(l)).map(Indenter.LeadingWs).concat([anchor.BaseIndent]));

        // The file's tab-vs-space style: the anchor's own indent when it has one,
        // otherwise (anchor at column 0) whatever the file's indented lines use.
        const tabStyle = anchor.BaseIndent.length > 0
            ? anchor.BaseIndent.indexOf('\t') >= 0
            : lines.some(l => l.startsWith('\t'));

        return insert.map((l: string) => Indenter.Adjust(l, anchor, tabSize, tabStyle, reindented, blankKeep));
    }
    
    private static FindAnchor(lines: ReadonlyArray<string>, contextLines: ReadonlyArray<string>, startIndex: number, backward: boolean, tabSize: number)
    {
        if (contextLines.length == 0) return null;

        const [ctxWs, ctxTrim] = Indenter.SplitIndent(contextLines[backward ? contextLines.length - 1 : 0]);
        const ctxW = Indenter.VisualWidth(ctxWs, tabSize);

        const step = backward ? -1 : 1;
        const end  = backward ? -1 : lines.length;

        for (let i = startIndex; i != end; i += step) {
            const [ws, trim] = Indenter.SplitIndent(lines[i]);
            if (trim != ctxTrim) continue;
            return new Anchor(ws, Indenter.VisualWidth(ws, tabSize) - ctxW);
        }
        return null;
    }
    
    private static Adjust(line: string, anchor: Anchor, tabSize: number, tabStyle: boolean, reindented: Set<string>, blankKeep: Set<string>) {
        // A whitespace-only insert keeps its bytes only when unshifted AND its
        // whitespace is a plausible indent (a sibling insert's or the anchor's):
        // real commits indent blank lines to match neighbouring code, while LLM
        // slop like a stray "+ " (one space) still flattens to empty.
        if (Indenter.IsBlank(line)) return anchor.Shift == 0 && blankKeep.has(line) ? line : "";

        const [ws, content] = Indenter.SplitIndent(line);
        const wsWidth = Indenter.VisualWidth(ws, tabSize);
        const target = Math.max(0, wsWidth + anchor.Shift);

        // When the visual width already matches, keep the line's own indent if its
        // tab/space style agrees with the file's, or if the hunk deletes this same
        // content — i.e. the edit is a deliberate reindent that must be honored.
        // Otherwise new code inherits the file's style via BuildIndent.
        if (wsWidth == target && ((ws.indexOf('\t') >= 0) == tabStyle || reindented.has(content)))
            return ws + content;

        return Indenter.BuildIndent(anchor.BaseIndent, target, tabSize) + content;
    }

    static LeadingWs (line: string) { return Indenter.SplitIndent(line)[0]; }

    static IsBlank(s: string) { return s == null || s.length == 0 || Array.from(s).every(c => c === ' ' || c === '\t'); }

    private static SplitIndent(line: string) {
        if (line == null || line.length == 0) return ["", ""] as [string,string];
        const i = TextUtils.CountLeadingWhitespace(line);
        return [line.substring(0, i), line.substring(i)];
    }

    private static InferTabSize(lines: Iterable<string>) {
        for (const ws of Array.from(lines).map(Indenter.LeadingWs)) {
            const lastTab = (ws as string).lastIndexOf('\t');
            if (lastTab >= 0) {
                const spaces = ws.length - lastTab - 1;
                if (spaces > 0) return spaces;
            }
        }
        return Indenter.DefaultTabSize;
    }

    private static VisualWidth(indent: string, tabSize: number)
        { return Array.from(indent).map(c => c == '\t' ? tabSize : 1).reduce((a,b)=>a+b,0); }

    private static BuildIndent(baseIndent: string, targetW: number, tabSize: number) {
        if (targetW <= 0) return "";

        const baseW = Indenter.VisualWidth(baseIndent, tabSize);
        const delta = targetW - baseW;

        if (delta == 0) return baseIndent;
        if (delta > 0)  return baseIndent + ' '.repeat(delta);

        // target < base
        return baseIndent.indexOf('\t') >= 0
            ? '\t'.repeat(Math.floor(targetW / tabSize)) + ' '.repeat(targetW % tabSize)
            : ' '.repeat(targetW);
    }
}