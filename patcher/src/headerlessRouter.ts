import { ChunkApplier } from './applier/chunkApplier.js';
import { HunkAnchorer } from './anchorer/hunkAnchorer.js';
import { FileHunkGroup, PatchInputFile, PatchOptions } from './models.js';
import { PatchError, PatchException } from './exceptions.js';
import { SelectionTarget } from './selectionTarget.js';

// Routes a headerless hunk group to the one held file whose content anchors it cleanly —
// tolerant of form, strict about intent: zero or multiple candidates fail loudly instead
// of guessing. An ''-keyed input file opts out (single-file fallback mode).
export class HeaderlessRouter {
    public static Route(fileHunks: FileHunkGroup[], files: PatchInputFile[], options: PatchOptions): PatchError[] {
        const group = fileHunks.find(g => g.Key == "");
        if (group == null || files.some(f => f.Key == ""))
            return [];

        // Probe with a continue-mode clone: candidate misses must collect, not throw.
        const probeOptions = Object.assign(new PatchOptions(), options, { ContinueOnError: true });
        const candidates = files.filter(f => {
            const target = new SelectionTarget(f.InputFullText, f.InputSelectedText).TargetText;
            const anchored = HunkAnchorer.Anchor(target, group.Hunks, probeOptions);
            return ChunkApplier.Apply(target, anchored.Chunks, probeOptions).Errors.length == 0;
        });

        if (candidates.length == 1) {
            fileHunks.splice(fileHunks.indexOf(group), 1);
            const existing = fileHunks.find(g => g.Key == candidates[0].Key);
            if (existing) existing.Hunks.push(...group.Hunks);
            else fileHunks.push(new FileHunkGroup(candidates[0].Key, group.Hunks));
            return [];
        }

        const error = candidates.length == 0
            ? new PatchError("MatchNotFound", group.Hunks[0].ToUnanchoredChunk(), null,
                "The diff has no file headers and its content did not match any file being patched. " +
                "Make sure context and deleted lines match the target file, and add '--- <file>' / '+++ <file>' headers naming it.")
            : new PatchError("MatchAmbiguous", group.Hunks[0].ToUnanchoredChunk(), candidates.map(f => f.Key).join(", "),
                "The diff has no file headers and its content matched more than one file being patched. " +
                "Add '--- <file>' / '+++ <file>' headers naming the intended file.");
        if (! options.ContinueOnError)
            throw new PatchException(error);
        return [error];
    }
}
