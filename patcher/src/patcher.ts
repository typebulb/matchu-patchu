import { ChunkApplier } from './applier/chunkApplier.js';
import { UnifiedDiffParser } from './parser/unifiedDiffParser.js';
import { HunkAnchorer } from './anchorer/hunkAnchorer.js';
import { PatchInputFile, PatchOptions, PatchOutputFile, PatchOutput } from './models.js';
import { PatchError, PatchException } from './exceptions.js';
import { SelectionTarget } from './selectionTarget.js';
import { DiffSanitizer } from './parser/diffSanitizer.js';
import { HeaderlessRouter } from './headerlessRouter.js';

export class Patcher {
    public static Apply(diff: string, files: PatchInputFile[], options?: PatchOptions)
    {
        options = options ?? new PatchOptions();
        const fileKeys = files.map(f => f.Key);
        const fileContents = new Map(files.map(f => [f.Key, f.InputFullText]));
        diff = options.SanitizeDiff ? DiffSanitizer.Process(diff, fileKeys) : diff;
        const fileHunks = UnifiedDiffParser.Parse(diff, fileContents, options.Truncation, options.ControlChars);

        HeaderlessRouter.Route(fileHunks, files, options);

        // Hunks naming files outside the input set are a defect of the request —
        // provable from the diff and the input keys alone — so they throw in every
        // mode, like a parse failure. ContinueOnError governs only per-file content
        // mismatches discovered while matching.
        const namedKeys = fileKeys.filter(k => k != "");
        const rosterHint = namedKeys.length > 0 ? `Files being patched: ${namedKeys.join(", ")}.` : null;
        const foreignErrors = fileHunks.filter(g => g.Key != "" && !fileContents.has(g.Key))
                                       .map(g => new PatchError("FileMismatch", g.Hunks[0].ToUnanchoredChunk(), g.Key, rosterHint));
        if (foreignErrors.length > 0)
            throw new PatchException(...foreignErrors);
        
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
        return new PatchOutput(patchOutputFiles);
    }
}