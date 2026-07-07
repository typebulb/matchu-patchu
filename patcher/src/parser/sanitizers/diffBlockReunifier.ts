import { isDiffMarker } from './shared.js';

/**
 * Removes intermediate ``` fences that LLMs sometimes insert between files.
 * Reunifies split diff blocks into a single continuous block.
 */
export class DiffBlockReunifier {
    public static process(text: string): string {
        const lines = text.split('\n');
        const result: string[] = [];
        let inDiff = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            if (trimmed.startsWith('```diff')) {
                inDiff = true;
                result.push(line);
            // Only a column-0 fence is a fence: a whitespace-prefixed ``` is a hunk
            // CONTEXT line (a diff patching markdown that contains code blocks), and
            // deleting it silently strips the hunk's anchor.
            } else if (trimmed === '```' && line.startsWith('```')) {
                if (inDiff && this.hasDiffContentBeforeNextFence(lines, i)) {
                    continue;  // Intermediate fence - skip it
                }
                inDiff = false;
                result.push(line);
            } else {
                result.push(line);
            }
        }

        return result.join('\n');
    }

    private static hasDiffContentBeforeNextFence(lines: string[], currentIndex: number): boolean {
        for (let j = currentIndex + 1; j < lines.length; j++) {
            const ahead = lines[j].trim();
            if (lines[j].startsWith('```')) return false; // column-0 fences only
            if (isDiffMarker(ahead)) return true;
        }
        return false;
    }
}