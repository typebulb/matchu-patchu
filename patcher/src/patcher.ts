import { ChunkApplier } from './applier/chunkApplier.js';
import { UnifiedDiffParser } from './parser/unifiedDiffParser.js';
import { HunkAnchorer } from './anchorer/hunkAnchorer.js';
import { PatchInputFile, PatchOptions, PatchOutputFile, PatchOutput, Chunk, DiffLocation, Hunk, LineType, UniqueMatch } from './models.js';
import { PatchError, PatchException } from './exceptions.js';
import { SelectionTarget } from './selectionTarget.js';
import { DiffSanitizer } from './parser/diffSanitizer.js';

export class Patcher {
    public static Apply(diff: string, files: PatchInputFile[], options?: PatchOptions)
    {
        options = options ?? new PatchOptions();
        const fileKeys = files.map(f => f.Key);
        const fileContents = new Map(files.map(f => [f.Key, f.InputFullText]));
        diff = options.SanitizeDiff ? DiffSanitizer.Process(diff, fileKeys) : diff;
        const fileHunks = UnifiedDiffParser.Parse(diff, fileContents, options.Truncation, options.ControlChars);

        // Hunks naming files outside the input set are ignored by design (a hunk for
        // a file we don't hold must not be guessed at) — but loudly: silent drops
        // reported shredded or misdirected patches as clean zero-edit successes
        // (finding 19). In throw-mode loud means thrown: an exceptions-channel
        // caller must not have to poll Errors. In continue-mode they surface once,
        // patch-scoped (PatchOutput.Errors), so clean files stay clean.
        const foreignErrors = fileHunks.filter(g => g.Key != "" && !fileContents.has(g.Key))
                                       .map(g => new PatchError("FileMismatch", Patcher.ForeignChunk(g.Hunks[0]), g.Key));
        if (foreignErrors.length > 0 && ! options.ContinueOnError)
            throw new PatchException(foreignErrors[0]);
        
        const patchOutputFiles = files.map(f => {
            const targetSelection = new SelectionTarget(f.InputFullText, f.InputSelectedText);
            const targetText = targetSelection.TargetText;  
            const hunks = (fileHunks.find(h => h.Key == f.Key)?.Hunks) ?? [];
            const anchored = HunkAnchorer.Anchor(targetText, hunks, options);
            const outputEdits = ChunkApplier.Apply(targetText, anchored.Chunks, options);

            return new PatchOutputFile(
                f.Key,
                outputEdits.Edits.map(h => h.Fuzz).reduce((a,b)=>a+b,0),
                outputEdits.Edits.map(e => e.Shift(targetSelection.LineOffset)),
                f.InputSelectedText,
                f.InputFullText,
                targetSelection.Replace(outputEdits.OutputText),
                [...outputEdits.Errors],
                anchored.AlreadyAppliedCount,
                hunks.flatMap(h => h.Lines)
                     .filter(l => l.CollapsedFrom != null)
                     .map(l => l.CollapsedFrom!),
                hunks.some(h => h.TruncationSuspected),
                hunks.some(h => h.ControlCharsSuspected)
            );
        });
        const output = new PatchOutput(patchOutputFiles);
        output.Errors = foreignErrors;
        return output;
    }

    // Error-reporting stand-in for a hunk that was never anchored (it names a file
    // that isn't being patched): its lines and diff location, no match.
    static ForeignChunk(h: Hunk) {
        return new Chunk(
            [],
            h.Lines.filter(l => l.Type == LineType.Delete).map(l => l.Text),
            h.Lines.filter(l => l.Type == LineType.Insert).map(l => l.Text),
            [],
            UniqueMatch.NotFound,
            new DiffLocation(h));
    }
}