import { transformOutsideHunkBodies } from './shared.js';

/**
 * Converts custom LLM formats like "*** Update File: path" to standard unified diff headers.
 * Hunk-body lines containing the marker text are content and pass through untouched
 * (see transformOutsideHunkBodies); the marker must also start its line, so a mid-line
 * prose mention never converts.
 */
export class CustomFormatSanitizer {
    private static readonly OPERATIONS = [
        { header: /^\s*\*\*\* Update File: (.+)$/i, fromPath: (p: string) => `a/${p}`, toPath: (p: string) => `b/${p}` },
        { header: /^\s*\*\*\* Add File: (.+)$/i,    fromPath: (_p: string) => '/dev/null', toPath: (p: string) => `b/${p}` },
        { header: /^\s*\*\*\* Delete File: (.+)$/i, fromPath: (p: string) => `a/${p}`, toPath: (_p: string) => '/dev/null' }
    ];

    public static process(text: string): string {
        return transformOutsideHunkBodies(text, line => {
            const hadCr = line.endsWith('\r');
            const core = hadCr ? line.slice(0, -1) : line;
            for (const op of CustomFormatSanitizer.OPERATIONS) {
                const m = core.match(op.header);
                if (!m) continue;
                const path = m[1].trim();
                const tail = hadCr ? '\r' : '';
                return `--- ${op.fromPath(path)}${tail}\n+++ ${op.toPath(path)}${tail}`;
            }
            return line;
        });
    }
}