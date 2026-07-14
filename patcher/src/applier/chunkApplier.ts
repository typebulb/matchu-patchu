import { TextUtils } from '../utils/textUtils.js';
import { ArrayUtils } from '../utils/arrayUtils.js';
import { Chunk } from '../models.js';
import { PatchOptions } from '../models.js';
import { Edit } from '../models.js';
import { PatchError, ErrorType, PatchException } from '../exceptions.js';
import { DuplicateGuard } from './guards.js';
import { OverlapGuard } from './guards.js';
import { EditMinimizer } from './editMinimizer.js';
import { Indenter } from './indenter.js';
import { MatchHint } from './matchHint.js';

export class InputChunks { constructor(public InputFullText: string, public Chunks: Chunk[], public Options: PatchOptions) {} }
export class OutputEdits { constructor(public OutputText: string, public Edits: Edit[], public Errors: PatchError[]) {} }

export class ChunkApplier
{
    // NOTE: on partial failure, Apply is all-or-nothing — it returns the ORIGINAL
    // text untouched alongside the errors, never a best-effort partial application.
    public static Apply(targetText: string, chunks: Chunk[], options: PatchOptions)
    {
        const inputChunks = new InputChunks(targetText, chunks, options);

        if (! options.ContinueOnError)
            return ChunkApplier.ApplyChunks(inputChunks);

        const errors: PatchError[] = [];
        for (let attempt = 0; attempt < options.MaxErrorIterations; attempt++) {
            try {
                const r = ChunkApplier.ApplyChunks(inputChunks);
                if (errors.length) return new OutputEdits(targetText, [], errors);
                return r;
            }             
            catch (ex: unknown) {
                if (ex instanceof PatchException) {
                    errors.push(ex.Error);
                    const idx = chunks.indexOf(ex.Error.FailedMatch);
                    if (idx >= 0) chunks.splice(idx, 1);
                }
                else throw ex;
            }   
        }            
        return new OutputEdits(targetText, [], errors);
    }

    static ApplyChunks(args: InputChunks)
    {
        args = DuplicateGuard.Dedupe(args);
        OverlapGuard.Guard(args);
        
        const lines = TextUtils.ToLines(args.InputFullText);
        const edits = args.Chunks.map((chunk: Chunk) => ChunkApplier.CreateEdit(chunk, lines));

        // Apply in reverse order so earlier edits don't shift later ones
        const workingLines = Array.from(lines);
        for (const edit of ArrayUtils.OrderByDescending(edits, (e: Edit) => e.LineIndex))
            edit.ApplyTo(workingLines);

        const patched = TextUtils.RoundTripWhitespace(args.InputFullText, workingLines);
        const minimalEdits = edits.flatMap(e => Array.from(EditMinimizer.ToMinimalEdits(e)));

        return new OutputEdits(patched, minimalEdits, []);
    }

    static CreateEdit(chunk: Chunk, lines: ReadonlyArray<string>) {
        const match = chunk.Match;

        if (match.IsAmbiguous)
            throw new PatchException(new PatchError("MatchAmbiguous", chunk));
        if (match.IsNotFound)
            throw new PatchException(new PatchError("MatchNotFound", chunk, null, MatchHint.SubLine(chunk, lines)));
    
        return new Edit(
            match.LineIndex,
            Array.from(chunk.DeleteLines),
            Indenter.AlignInsert(lines, chunk),
            match.Fuzz
        );       
    }
}
