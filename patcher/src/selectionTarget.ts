import { Search } from './anchorer/search.js';
import { TextUtils } from './utils/textUtils.js';
import { Edit } from './models.js';

export class SelectionTarget
{
    public readonly FullText: string;
    public readonly SelectedText: string;
    public readonly UseSelection: boolean = false;
    public readonly LineOffset: number = 0;

    public get TargetText() { return this.UseSelection ? this.SelectedText : this.FullText; }

    public constructor(fullText: string, selection: string = "") {
        this.FullText = fullText;
        this.SelectedText = selection;

        if (! (this.SelectedText == null || this.SelectedText.length == 0)) {
            const hay = TextUtils.ToLines(this.FullText);
            const needle = TextUtils.ToLines(this.SelectedText);
            const result = Search.Find(hay, needle);
            this.UseSelection = result.LineIndex >= 0;
            this.LineOffset = this.UseSelection ? Math.max(0, result.LineIndex) : 0;
        }
    }

    public Replace(replace: string) {
        if (!this.UseSelection)
            return replace;            

        const fullLines      = TextUtils.ToLines(this.FullText);
        const selectionLines = TextUtils.ToLines(this.SelectedText);
        const replaceLines   = TextUtils.ToLines(replace);

        const edit = new Edit(this.LineOffset, selectionLines, replaceLines);
        edit.ApplyTo(fullLines);

        return TextUtils.RoundTripWhitespace(this.FullText, fullLines);
    }
}
