import { TextUtils } from './textUtils.js';

/// <summary>
/// Minimal YAML helper focused on readable, valid output for error reporting.
/// Provides helpers for sections, scalars, folded scalars and literal blocks.
/// Indentation is derived from leading spaces in the provided key argument.
/// </summary>
export class Yaml {
    readonly _sb: string[] = [];

    // -------- Public API --------
    public AppendLine(text: string) { this._sb.push(text + "\n"); }

    public Section(keyWithIndent: string) {
        const [indent, key] = Yaml.SplitIndentAndKey(keyWithIndent);
        this._sb.push(`${indent}${key}:\n`);
    }

    public Scalar(keyWithIndent: string, value: string) {
        const [indent, key] = Yaml.SplitIndentAndKey(keyWithIndent);
        this._sb.push(`${indent}${key}: ${value}\n`);
    }

    public Folded(keyWithIndent: string, value: string, contentIndent: number = 2, chompStrip: boolean = true)
        { this.WriteBlockScalar('>', keyWithIndent, Yaml.SplitLines(value), contentIndent, chompStrip); }

    public Block(keyWithIndent: string, lines: Iterable<string> | null | undefined, contentIndent: number = 2, chompStrip: boolean = true)
        { this.WriteBlockScalar('|', keyWithIndent, lines ?? [], contentIndent, chompStrip); }

    public ToString() { return this._sb.join(''); }

    static SplitIndentAndKey(keyWithIndent: string) {
        const leadingSpaces = TextUtils.CountLeadingWhitespace(keyWithIndent, ' ');
        const indentStr = ' '.repeat(leadingSpaces);
        const key = keyWithIndent.replace(/^\s+/, '');
        return [indentStr, key] as [string, string];
    }

    static SplitLines(value?: string | null) {
        if (value == null || value.length == 0) return [] as string[];
        const lf = value.indexOf('\r') >= 0 ? value.replace(/\r\n/g, "\n").replace(/\r/g, '\n') : value;
        return lf.split('\n');
    }

    WriteBlockScalar(style: '>'|'|', keyWithIndent: string, lines: Iterable<string>, contentIndent: number, chompStrip: boolean) {
        const [indent, key] = Yaml.SplitIndentAndKey(keyWithIndent);
        const chomp = chompStrip ? "-" : "+";
        this._sb.push(`${indent}${key}: ${style}${contentIndent}${chomp}\n`);

        const pad = ' '.repeat(contentIndent);
        let any = false;
        for (const line of lines) {
            any = true;
            this._sb.push(`${indent}${pad}${line}\n`);
        }
        if (!any) {
            this._sb.push(`${indent}${pad}\n`);
        }
    }
}