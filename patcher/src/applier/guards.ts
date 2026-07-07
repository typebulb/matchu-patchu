import { Chunk } from '../models.js';
import { PatchException, PatchError } from '../exceptions.js';
import { InputChunks } from './chunkApplier.js';
import { ArrayUtils } from '../utils/arrayUtils.js';

export class DuplicateGuard {
    // Two chunks that resolve to the same anchor with the same deletes and inserts are
    // provably the same edit (an LLM re-emitting a hunk). Applying it once is
    // unambiguously correct, so keep the first occurrence and drop the rest — the lenient
    // move, with no false-positive risk: genuinely distinct edits differ in key
    // (anchor or content) and fall through to OverlapGuard.
    public static Dedupe(args: InputChunks): InputChunks {
        const seen = new Set<string>();
        const kept: Chunk[] = [];
        for (const chunk of args.Chunks) {
            const key = DuplicateGuard.BuildKey(chunk);
            if (!seen.has(key)) { seen.add(key); kept.push(chunk); }
        }
        return new InputChunks(args.InputFullText, kept, args.Options);
    }

    static BuildKey(c: Chunk) {
        let sb = "";
        sb += `${c.Match?.LineIndex ?? -1}\n`;
        for (const l of c.DeleteLines) sb += `${l}\n`;
        sb += `→\n`;
        for (const l of c.InsertLines) sb += `${l}\n`;
        return sb.toString();
    }
}

/// <summary>
/// Validates that chunks do not overlap in their effective delete ranges.
/// </summary>
export class OverlapGuard {
    public static Guard(args: InputChunks)
    {
        const chunks = ArrayUtils.OrderBy(args.Chunks, (c: Chunk) => c.Match?.LineIndex ?? -1);
        let currentEnd = 0;

        for (const chunk of chunks) {
            const idx = chunk.Match?.LineIndex ?? -1;
            if (idx < 0) continue;

            if (idx < currentEnd)
                throw new PatchException(new PatchError("ChunkOverlapping", chunk));

            if (chunk.DeleteLines.length > 0)
                currentEnd = idx + chunk.DeleteLines.length;
        }
    }
}
