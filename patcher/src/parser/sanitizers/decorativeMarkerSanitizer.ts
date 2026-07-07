import { transformOutsideHunkBodies } from './shared.js';

/**
 * Removes decorative lines like "*****", "=====", "BEGIN PATCH", etc.
 * Hunk-body lines are content — a dashes-only line there is a real deletion —
 * and pass through untouched (see transformOutsideHunkBodies).
 */
export class DecorativeMarkerSanitizer {
    public static process(text: string): string {
        return transformOutsideHunkBodies(text, line =>
            DecorativeMarkerSanitizer.isDecorativeMarker(line.trim()) ? null : line);
    }

    private static isDecorativeMarker(line: string): boolean {
        if (!line) return false;

        // Never remove actual diff headers
        if (/^diff --git\s+/.test(line)) return false;

        // Only remove pure repeated characters if 5+ (avoids markdown ---, ===)
        // Don't match - or = with only 3-4 chars (common in markdown/YAML)
        if (/^[*#_]{3,}$/.test(line)) return true;  // ***, ####
        if (/^[=\-]{5,}$/.test(line)) return true;  // =====, -----

        // Explicit patch/diff keywords with decoration — anchored to the WHOLE line
        // (decoration chars/whitespace around the keyword phrase only): a mid-line
        // mention in prose or a string literal is content, not chrome, and eating it
        // silently corrupts.
        const wholeLineKeyword = /^[*=\-#_\s]*(BEGIN|END|START|STOP)\s+(PATCH|DIFF|HUNK|SECTION|BLOCK)[*=\-#_\s]*$/i.test(line);
        if (wholeLineKeyword && /[*=\-#_]{2,}/.test(line)) return true;  // *** BEGIN PATCH ***

        return false;
    }
}
