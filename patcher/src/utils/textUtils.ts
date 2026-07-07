export class TextUtils
{
    static NormalizeToLf(text?: string): string {
        return (text ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n")
    }

    static DetectNewline(text: string): string {
        if (!text || text.length === 0) return "\n"
        const idx = text.search(/[\r\n]/)
        if (idx < 0) return "\n"
        return text[idx] === '\r'
            ? (idx + 1 < text.length && text[idx + 1] === '\n') ? "\r\n" : "\r"
            : "\n"
    }

    /// <summary>Normalize + split to LF-only lines.</summary>
    public static ToLines(text?: string): string[] {
        return TextUtils.NormalizeToLf(text).split('\n')
    }

    /// <summary>Count of leading characters drawn from `chars` (default: space or tab).</summary>
    public static CountLeadingWhitespace(s: string, chars: string = " \t"): number {
        let i = 0
        while (i < s.length && chars.includes(s[i])) i++
        return i
    }

    /// <summary>Maps chat-layer typography (smart quotes, Unicode dashes, special
    /// spaces) to ASCII. Match-only: output text is never built from this.
    /// Numeric code points throughout: invisible/lookalike literals would make this
    /// file unmatchable by byte-exact edit tools, including this patcher's own MCP.</summary>
    public static NormalizeHomoglyphs(line: string): string {
        return [...line].some(c => c.charCodeAt(0) >= 0xA0)
            ? [...line].map(c => TextUtils.MapHomoglyph(c)).join('')
            : line
    }

    static MapHomoglyph(c: string): string {
        const cp = c.codePointAt(0)!
        if (cp >= 0x2018 && cp <= 0x201B) return '\''                   // smart single quotes
        if (cp >= 0x201C && cp <= 0x201F) return '"'                    // smart double quotes
        if ((cp >= 0x2010 && cp <= 0x2015) || cp === 0x2212) return '-' // hyphen..horizontal bar, minus sign
        if (cp === 0xA0 || (cp >= 0x2002 && cp <= 0x200A) ||
            cp === 0x202F || cp === 0x205F || cp === 0x3000) return ' ' // NBSP, en quad..hair space, narrow NBSP, math space, ideographic
        return c
    }

    /// <summary>Removes zero-width/control code points for match-tolerant
    /// comparison. Match-only, like NormalizeHomoglyphs: output text is never
    /// built from this.</summary>
    public static StripInvisibles(line: string): string {
        return [...line].some(c => TextUtils.IsInvisible(c))
            ? [...line].filter(c => !TextUtils.IsInvisible(c)).join('')
            : line
    }

    /// <summary>Folds NFC canonical equivalence and fullwidth ASCII forms
    /// (U+FF01..U+FF5E) for match-tolerant comparison. Match-only, like
    /// NormalizeHomoglyphs. The NFKC compat remainder (ligatures, superscripts)
    /// stays unfolded: visually distinct content must not cross-match.</summary>
    public static FoldCanonicalAndFullwidth(line: string): string {
        // Below U+0300 nothing composes under NFC and no fullwidth forms exist.
        if (![...line].some(c => c.charCodeAt(0) >= 0x300)) return line
        const folded = [...line].map(c => {
            const cp = c.charCodeAt(0)
            return cp >= 0xFF01 && cp <= 0xFF5E ? String.fromCharCode(cp - 0xFEE0) : c
        }).join('')
        // Some Unicode normalizers throw on unpaired surrogates; gating behind an
        // explicit scan keeps behavior on malformed UTF-16 input deterministic.
        return TextUtils.HasUnpairedSurrogate(folded) ? folded : folded.normalize("NFC")
    }

    static HasUnpairedSurrogate(s: string): boolean {
        for (let i = 0; i < s.length; i++) {
            const cp = s.charCodeAt(i)
            if (cp < 0xD800 || cp > 0xDFFF) continue // not a surrogate
            const next = i + 1 < s.length ? s.charCodeAt(i + 1) : 0
            if (cp > 0xDBFF || next < 0xDC00 || next > 0xDFFF) return true // lone low, or high without low
            i++
        }
        return false
    }

    // Zero-width/control code points that render as nothing (or reorder text):
    // the classes JSON-escape mangling degrades into. Tab excluded: real content.
    // Numeric code points, not escapes or literals: they survive tool boundaries
    // that decode backslash escapes or eat raw control chars.
    static IsInvisible(c: string): boolean {
        const cp = c.codePointAt(0)!
        if (cp === 0x09) return false
        return cp < 0x20 || (cp >= 0x7F && cp <= 0x9F)                       // C0 controls, DEL, C1 controls
            || cp === 0xAD || cp === 0x61C || cp === 0x180E                  // soft hyphen, Arabic letter mark, Mongolian vowel separator
            || (cp >= 0x200B && cp <= 0x200F) || (cp >= 0x202A && cp <= 0x202E) // zero-widths, bidi marks/embeddings
            || (cp >= 0x2060 && cp <= 0x2064) || (cp >= 0x2066 && cp <= 0x2069) // word joiner..invisible operators, bidi isolates
            || cp === 0xFEFF                                                 // zero-width no-break space / stray BOM
    }

    /// <summary>Round-trip variant that accepts updated LF lines.</summary>
    public static RoundTripWhitespace(originalSnapshot: string, updatedLines: ReadonlyArray<string>): string {
        const joined = updatedLines.join('\n')
        
        const origHadTrailing = originalSnapshot.endsWith('\n') || originalSnapshot.endsWith("\r\n") || originalSnapshot.length === 0
        
        let result = joined;
        if (origHadTrailing && !joined.endsWith('\n') && joined.length > 0)
            result += '\n'
        else if (!origHadTrailing && joined.endsWith('\n'))
            result = result.slice(0, -1)

        const newline = TextUtils.DetectNewline(originalSnapshot)
        return newline === "\n" ? result : result.replace(/\n/g, newline)
    }
}