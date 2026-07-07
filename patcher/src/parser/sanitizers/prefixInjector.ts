import { isHunkBoundary, isValidPrefix } from './shared.js';

/**
 * Infers and injects missing +/-/ prefixes using hunk header line counts.
 */
export class PrefixInjector {
    public static process(text: string): string {
        const lines = text.split('\n');
        let inHunk = false;
        let deletes = { remaining: 0, consumed: 0 };
        let adds = { remaining: 0, consumed: 0 };

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Skip trailing empty string from split (represents final newline terminator)
            if (line.length === 0 && i === lines.length - 1) continue;
            
            const trimmed = line.trim();

            if (trimmed.startsWith('@@')) {
                const { deleteCount, addCount } = this.parseHunkHeader(trimmed);
                inHunk = true;
                deletes = { remaining: deleteCount, consumed: 0 };
                adds = { remaining: addCount, consumed: 0 };
                continue;
            }

            if (isHunkBoundary(line, trimmed)) {
                inHunk = false;
                continue;
            }

            if (inHunk) {
                const first = line[0] ?? '';
                const hasValidPrefix = isValidPrefix(first);
                const prefix = hasValidPrefix ? first : this.inferPrefix(
                    deletes.remaining - deletes.consumed,
                    adds.remaining - adds.consumed
                );

                if (!hasValidPrefix && prefix !== null) {
                    lines[i] = prefix + line;
                }

                if (prefix === '+') adds.consumed++;
                else if (prefix === '-') deletes.consumed++;
                else { adds.consumed++; deletes.consumed++; }
            }
        }

        return lines.join('\n');
    }

    private static parseHunkHeader(header: string): HunkLineCounts {
        const match = header.match(/@@\s*-(\d+)(?:,(\d+))?\s*\+(\d+)(?:,(\d+))?\s*@@/);
        return match 
            ? { deleteCount: parseInt(match[2] ?? '1'), addCount: parseInt(match[4] ?? '1') }
            : { deleteCount: 0, addCount: 0 };
    }

    // Only inject when the header arithmetic is unambiguous. When both deletes and
    // adds remain (or the header had no usable counts), leave the line untouched —
    // the parser's raw-line heuristics use content evidence and insertion-lookahead
    // to classify it better than count-based guessing can.
    private static inferPrefix(remainingDeletes: number, remainingAdds: number): string | null {
        if (remainingDeletes > 0 && remainingAdds <= 0) return '-';
        if (remainingAdds > 0 && remainingDeletes <= 0) return '+';
        return null;
    }
}

type HunkLineCounts = {
    deleteCount: number;
    addCount: number;
};