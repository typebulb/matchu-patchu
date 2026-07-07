import { Edit } from '../models.js';

export class EditMinimizer
{
    static Same(a: string | null | undefined, b: string | null | undefined) {
        return a === b;
    }

    /// <summary>
    /// Convert an edit into a sequence of minimal edits, by excluding all unchanged lines.
    /// </summary>
    public static *ToMinimalEdits(edit: Edit)
    {
        const deleted = edit.DeleteLines;
        const inserted = edit.InsertLines;
        const maxLength = Math.max(deleted.length, inserted.length);
        let diffStart = -1;

        for (let i = 0; i <= maxLength; i++) {
            const withinDeleted = i < deleted.length;
            const withinInserted = i < inserted.length;

            const atEnd = i == maxLength;
            const isMatch = withinDeleted && withinInserted && EditMinimizer.Same(deleted[i], inserted[i]);
            const isDiff = !atEnd && (!withinDeleted || !withinInserted || !isMatch);
            const isBoundary = atEnd || isMatch;

            if (diffStart == -1 && isDiff) {
                diffStart = i;
            }
            else if (diffStart != -1 && isBoundary) {
                const delCount = Math.max(0, Math.min(i, deleted.length) - diffStart);
                const insCount = Math.max(0, Math.min(i, inserted.length) - diffStart);

                const delBlock = delCount <= 0 ? [] : deleted.slice(diffStart, diffStart + delCount);
                const insBlock = insCount <= 0 ? [] : inserted.slice(diffStart, diffStart + insCount);

                yield new Edit (edit.LineIndex + diffStart, delBlock, insBlock, edit.Fuzz);
                diffStart = -1;
            }
        }
    }
}
