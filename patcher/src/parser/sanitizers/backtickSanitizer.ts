/**
 * Normalizes malformed code fence syntax.
 * Example: "````diff", "``` diff", "```DIFF" → "```diff"
 */
export class BacktickSanitizer {
    public static process(text: string): string {
        return text
            .replace(/^```+\s*diff\b/gmi, '```diff')
            .replace(/^```+$/gm, '```');
    }
}