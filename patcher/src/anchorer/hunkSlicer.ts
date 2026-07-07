import { Hunk } from '../models.js';
import { LineType } from '../models.js';

// Internal representation of a contiguous region of non-context diff lines
// capturing the old-side deletes and new-side inserts within [StartIndex, EndIndex].
export class Block {
    constructor(
    public StartIndex: number,
    public EndIndex: number,
    public DeleteLines: string[],
    public InsertLines: string[]
) {} }

/// <summary>
/// A hunk and its maximal non-context runs (Blocks).
/// </summary>
export class SlicedHunk { constructor(public Hunk: Hunk, public Blocks: Block[]) {} }

export class HunkSlicer
{
    public static Slice (hunks: Iterable<Hunk>)
        { return Array.from(hunks).map(h => new SlicedHunk(h, Array.from(HunkSlicer.SliceHunk(h)))); }

    private static *SliceHunk(hunk: Hunk): Iterable<Block>
    {
        const lines = hunk.Lines;
        if (lines == null || lines.length == 0) { return; }

        let i = 0;
        while (i < lines.length)
        {
            if (lines[i].Type == LineType.Context) { i++; continue; }

            const start = i;
            const del: string[] = [];
            const ins: string[] = [];

            while (i < lines.length && lines[i].Type != LineType.Context) {
                const l = lines[i++];
                if (l.Type == LineType.Delete) del.push(l.Text);
                else if (l.Type == LineType.Insert) ins.push(l.Text);
            }

            const end = i - 1;
            if (del.length > 0 || ins.length > 0)
                yield new Block(start, end, del, ins);
        }
    }
}