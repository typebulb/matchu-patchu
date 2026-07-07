import { transformOutsideHunkBodies } from './shared.js';

/**
 * Removes decorative markers from file headers.
 * Example: "--- code.tsx ---" → "--- code.tsx"
 * Hunk-body lines shaped like decorated headers ("+++ NOTE +++") are content
 * and pass through untouched (see transformOutsideHunkBodies).
 */
export class DecoratedHeaderSanitizer {
    private static readonly DECORATED_HEADER_REGEX = /^(---|\+\+\+)\s+(.+?)\s+(---|\+\+\+)+\s*$/;

    public static process(text: string): string {
        return transformOutsideHunkBodies(text, line => {
            const hadCr = line.endsWith('\r');
            const core = hadCr ? line.slice(0, -1) : line;
            const replaced = core.replace(DecoratedHeaderSanitizer.DECORATED_HEADER_REGEX, '$1 $2');
            return replaced === core ? line : hadCr ? replaced + '\r' : replaced;
        });
    }
}
