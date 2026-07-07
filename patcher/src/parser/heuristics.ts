/**
 * Heuristics for distinguishing between diff syntax and content that happens to start with diff markers.
 * 
 * Primary use case: CSS custom properties (--variable-name) and similar constructs in various languages
 * that use double hyphens as part of their syntax rather than as diff deletion markers.
 * 
 * Created to handle CSS parsing issues where `--bg-color: #fff` was incorrectly parsed as
 * a deletion marker followed by content.
 */

import { DiffLine, LineType } from '../models.js';

export class DiffContentHeuristics {
    /**
     * Checks if a line starts with a doubled marker (++ or --)
     */
    static IsDoubleMarker(line: string): boolean {
        return line.length > 1 && line[0] == line[1] && (line[0] == '-' || line[0] == '+');
    }

    /**
     * Determines if a doubled marker represents content rather than diff syntax.
     * 
     * Examples:
     * - `--bg-color` → true (CSS variable, content)
     * - `--` → true (exactly two hyphens, content)
     * - `-- text` → false (deletion of markdown list `- text`, diff syntax)
     * - `---comment` → false (deletion of `--comment`, diff syntax)
     * - `----` → false (deletion of `--`, diff syntax)
     * - `++var` → true (C++ code, content)
     * - `++ text` → false (insertion of `+ text`, diff syntax)
     * - `+++` → false (insertion of `+`, diff syntax)
     */
    static IsDoubleMarkerContent(line: string): boolean {
        if (!DiffContentHeuristics.IsDoubleMarker(line)) return false;
        if (line.length == 2) return true;  // exactly '--' or '++'
        // '--X' where X is not '-' and not ' ' is content
        // CSS vars look like --var-name (no space after --)
        // '-- text' is deletion of '- text' (markdown list), not content
        return line[2] != line[0] && line[2] != ' ';
    }

    /**
     * A '++X' line that is a candidate for the sloppy doubled-insert-marker
     * collapse ('++X' → insert 'X'). Tripled markers are proper syntax
     * ('+++X' = insert '++X') and never candidates.
     */
    static IsSloppyDoublePlus(line: string): boolean {
        return line.length > 1 && line[0] == '+' && line[1] == '+' &&
            (line.length == 2 || line[2] != '+');
    }

    /**
     * True when the hunk body proves the edit region is itself diff-shaped:
     * a context or deletion line whose CONTENT starts with '+' or '-' exists
     * verbatim in the file. In such a region, doubled markers are diff syntax
     * over diff-shaped content, not sloppy doubling.
     */
    static IsDiffShapedRegion(rawLines: string[], fileLines?: string[]): boolean {
        if (!fileLines || fileLines.length == 0) return false;
        for (const l of rawLines) {
            if (l.length < 2 || (l[0] != ' ' && l[0] != '-')) continue;
            if (l[1] != '+' && l[1] != '-') continue;
            const content = l.substring(1);
            if (fileLines.some(f => f == content)) return true;
        }
        return false;
    }

    /**
     * Validates whether a line (after stripping indentation) represents valid diff syntax.
     * Used by StripIndent to determine if indentation should be removed.
     * 
     * Returns false for content that looks like diff markers:
     * - `--text` (CSS variables)
     * - `-abc-*` (hyphenated identifiers like -webkit-*)
     */
    static IsValidDiffLineStart(line: string): boolean {
        if (line.length == 0) return false;
        const first = line[0];
        
        if (first == ' ' || first == '+') return true;
        
        if (first == '-') {
            if (line.length == 1) return true;
            // '--X' is content (CSS var), but '---' is deletion of '--'
            if (line[1] == '-') return line.length > 2 && line[2] == '-';
            // -abc-* is a hyphenated identifier, not a deletion
            if (DiffContentHeuristics.IsHyphenatedIdentifier(line)) return false;
            return true;
        }
        
        return false;
    }

    /**
     * Pattern: -[a-z]+-  (e.g., -webkit-*, -moz-*)
     * If hyphen is followed by letters then another hyphen, it's structural content.
     */
    static IsHyphenatedIdentifier(line: string): boolean {
        if (line.length < 3 || line[0] != '-') return false;
        let i = 1;
        while (i < line.length && line[i] >= 'a' && line[i] <= 'z') i++;
        return i > 1 && i < line.length && line[i] == '-';
    }

    /**
     * Applies heuristics to classify raw lines (lines without explicit diff markers).
     * 
     * Heuristic: Raw lines are treated as context until we've seen explicit context markers.
     * Once explicit context has been seen, a raw line followed by an insertion before a 
     * context/deletion boundary is treated as a deletion.
     * 
     * This helps handle sloppy diffs where deletion markers are omitted but can be inferred.
     */
    static ApplyRawLineHeuristic(raw: string, rawLines: string[], index: number, seenExplicitContext: boolean, fileLines?: string[]): DiffLine {
        const insAhead = DiffContentHeuristics.HasInsertionAheadBeforeContextOrDeletion(rawLines, index);
        if (insAhead && seenExplicitContext) {
            return new DiffLine(LineType.Delete, DiffContentHeuristics.StripInlineComment(raw, fileLines));
        }
        if (insAhead) {
            // Even before any explicit context, a content-verified annotation strip is
            // strong evidence this raw line is an annotated deletion.
            const verified = DiffContentHeuristics.TryVerifiedCommentStrip(raw, fileLines);
            if (verified !== null) return new DiffLine(LineType.Delete, verified);
        }
        return new DiffLine(LineType.Context, raw);
    }

    static readonly InlineCommentMarkers = [" //", " --", " #"];

    /**
     * Returns the comment-stripped form of a line when file content verifies it:
     * the full line must NOT exist in the file and the stripped variant MUST — so
     * real content containing " --" (SQL) or " #" (Python) is never mangled.
     * Returns null when no verified strip exists.
     */
    static TryVerifiedCommentStrip(input: string, fileLines?: string[]): string | null {
        if (!fileLines || fileLines.length == 0) return null;
        if (fileLines.some(l => l === input)) return null; // full line is real content
        for (const marker of DiffContentHeuristics.InlineCommentMarkers) {
            for (let idx = input.indexOf(marker); idx >= 0; idx = input.indexOf(marker, idx + 1)) {
                const candidate = input.substring(0, idx).trimEnd();
                if (fileLines.some(l => l === candidate)) return candidate;
            }
        }
        return null;
    }

    /**
     * Strips an inline comment the LLM appended to an inferred deletion line
     * (e.g., "Line2  // Missing - marker" → "Line2").
     * Prefers a content-verified strip; without file content (or when
     * verification is inconclusive), falls back to stripping C-style " //" only.
     */
    static StripInlineComment(input: string, fileLines?: string[]): string {
        if (fileLines?.some(l => l === input)) return input; // full line is real content
        const verified = DiffContentHeuristics.TryVerifiedCommentStrip(input, fileLines);
        if (verified !== null) return verified;
        const idx = input.indexOf(" //");
        return idx >= 0 ? input.substring(0, idx) : input;
    }

    /**
     * Checks if there's an insertion (line starting with '+') ahead of the current position,
     * before encountering a context line, deletion line, or blank line (boundaries).
     *
     * Used to infer whether a raw line should be treated as a deletion.
     */
    static HasInsertionAheadBeforeContextOrDeletion(rawLines: string[], currentIndex: number): boolean {
        for (let i = currentIndex + 1; i < rawLines.length; i++) {
            const l = rawLines[i];
            if (l.length == 0) break;                                    // blank: boundary
            const c = l[0];
            if (c == ' ') break;                                         // context: boundary
            if (c == '-' && !DiffContentHeuristics.IsDoubleMarkerContent(l)) break;  // deletion: boundary (not '--X' content)
            if (c == '+') return true;                                   // insertion before boundary
        }
        return false;
    }

    /**
     * Checks if a line starting with "-" or "+" is likely content with a missing context prefix.
     * Uses file content to disambiguate: if file has the line but NOT the would-be-modified content.
     *
     * Examples:
     * - "- list item" might be markdown bullet, not deletion of " list item"
     * - "+ Add feature" might be changelog entry, not insertion of " Add feature"
     *
     * @returns true if line should be treated as context, false if it should be treated as diff operation
     */
    static IsMissingContextPrefix(line: string, fileLines: string[]): boolean {
        if (line.length < 2) return false;
        const marker = line[0];
        if (marker !== '-' && marker !== '+') return false;

        // '+' additionally requires a space after the marker ("+ Add feature"):
        // flipping a deletion to context is fail-safe (an unmatched delete errors
        // loudly anyway), but flipping an insertion silently swallows it, so
        // insertions get the stricter test.
        if (marker === '+' && line[1] !== ' ') return false;

        // e.g. "- list item" (markdown bullet), "-- setup" (SQL comment),
        // "+ Add feature" (changelog): context iff the file has the literal line
        // and does NOT have the line the marker would operate on.
        const hasContentMatch = fileLines.some(l => l === line);
        const hasOperationMatch = fileLines.some(l => l === line.substring(1));

        return hasContentMatch && !hasOperationMatch;
    }

    /**
     * Resolves ambiguity when stripping indentation reveals "- " (hyphen + space).
     *
     * This pattern is ambiguous:
     * - Could be an indented DELETE line (deleting content starting with a space)
     * - Could be a properly formatted CONTEXT line containing a markdown bullet
     *
     * Example: "    - Label them..." could mean:
     * - DELETE: Remove line " Label them..." (space + content) from file
     * - CONTEXT: Keep line "   - Label them..." (3 spaces + bullet) in file
     *
     * Resolution: Check which interpretation matches the actual file content.
     * If only one matches, use that. If both or neither, prefer CONTEXT (conservative).
     *
     * @param original - The original line before stripping (e.g., "    - Label them...")
     * @param stripped - The line after stripping indentation (e.g., "- Label them...")
     * @param fileLines - Lines from the actual file being patched
     * @returns The line to use (original if CONTEXT, stripped if DELETE)
     */
    static ResolveHyphenSpaceAmbiguity(original: string, stripped: string, fileLines: string[]): string {
        // Interpretation A: This is a properly formatted CONTEXT line
        // First char is the diff context marker (space), rest is file content
        // e.g., " " + "   - Label them..." where first space is diff marker
        const contextContent = original.length > 0 && original[0] === ' '
            ? original.substring(1)  // "   - Label them..."
            : original;

        // Interpretation B: This is an indented DELETE line
        // After stripping, "-" is the delete marker, rest is content being deleted
        // e.g., "- Label them..." means delete " Label them..."
        const deleteContent = stripped.substring(1);  // " Label them..."

        // Check which interpretation matches the file
        const hasContextMatch = fileLines.some(line => line === contextContent);
        const hasDeleteMatch = fileLines.some(line => line === deleteContent);

        // If file has the context line (e.g., markdown bullet), don't strip
        if (hasContextMatch && !hasDeleteMatch) return original;

        // If file has the delete target (e.g., space-prefixed line), strip
        if (hasDeleteMatch && !hasContextMatch) return stripped;

        // Both match or neither matches - be conservative, prefer CONTEXT
        // (markdown bullets are more common than single-space-prefixed lines)
        return original;
    }
}