import { CustomFormatSanitizer } from './sanitizers/customFormatSanitizer.js';
import { DecoratedHeaderSanitizer } from './sanitizers/decoratedHeaderSanitizer.js';
import { DecorativeMarkerSanitizer } from './sanitizers/decorativeMarkerSanitizer.js';
import { BacktickSanitizer } from './sanitizers/backtickSanitizer.js';
import { DiffBlockReunifier } from './sanitizers/diffBlockReunifier.js';
import { DevNullSanitizer } from './sanitizers/devNullSanitizer.js';
import { PrefixInjector } from './sanitizers/prefixInjector.js';

/**
 * Orchestrates diff sanitization pipeline.
 * 
 * Pipeline order (must run in sequence):
 *  1. CustomFormatSanitizer - "*** Update File: path" → standard headers
 *  2. DecoratedHeaderSanitizer - "--- file.tsx ---" → "--- file.tsx"
 *  3. DecorativeMarkerSanitizer - Remove ***, ===, BEGIN PATCH, etc.
 *  4. BacktickSanitizer - ````diff → ```diff
 *  5. DiffBlockReunifier - Merge split ``` blocks between files
 *  6. DevNullSanitizer - Fix /dev/null for existing empty files (needs fileKeys)
 *  7. PrefixInjector - Infer missing +/-/ prefixes from @@ line counts
 */
export class DiffSanitizer {
    public static Process(diff: string, fileKeys?: string[]): string {
        if (!diff?.trim()) return diff;

        let result = CustomFormatSanitizer.process(diff);
        result = DecoratedHeaderSanitizer.process(result);
        result = DecorativeMarkerSanitizer.process(result);
        result = BacktickSanitizer.process(result);
        result = DiffBlockReunifier.process(result);
        result = DevNullSanitizer.process(result, fileKeys);
        result = PrefixInjector.process(result);
        return result;
    }
}