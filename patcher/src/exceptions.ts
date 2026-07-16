import { Chunk } from './models.js';
import { Yaml } from './utils/yaml.js';

export type ErrorType = "ChunkDuplicated" | "ChunkOverlapping" | "MatchNotFound" | "MatchAmbiguous" | "FileMismatch";
    
export class PatchException extends Error {
    public Errors: PatchError[];
    public get Error() { return this.Errors[0]; }
    constructor (...errors: PatchError[]) { super(errors.map(e => e.SuggestedFixYaml).join('\n')); this.Errors = errors; }
}

export class PatchParserException extends Error {
    constructor(message?: string) { super(message ?? "Malformed diff patch"); }
}

export class PatchError {
    public readonly Type: ErrorType;
    public readonly FailedMatch: Chunk;
    // The file key(s) the error concerns: the foreign key a FileMismatch named, or
    // the comma-joined candidate keys of an ambiguous headerless routing; null otherwise.
    public readonly FileKey: string | null;
    // Diagnosis computed against the file at error time (e.g. the quoted line
    // occurs inside one longer file line); null when no confident diagnosis.
    public readonly Hint: string | null;

    constructor (errorType: ErrorType, chunk: Chunk, fileKey: string | null = null, hint: string | null = null) {
        this.Type = errorType;
        this.FailedMatch = chunk;
        this.FileKey = fileKey;
        this.Hint = hint;
    }

    public toString() { return `Failed to patch text with the diff provided.\n${this.SuggestedFixYaml}`; }

    public get SuggestedFixYaml() {
        const SummaryFor = (type: ErrorType) => ({
            "MatchNotFound": "Matching lines not found; make sure the diff's context and deleted lines exactly match the original text.",
            "MatchAmbiguous": "Matched multiple locations; make sure there are enough context lines to uniquely identify an edit.",
            "ChunkDuplicated": "Duplicate chunks.",
            "ChunkOverlapping": "Overlapping chunks.",
            "FileMismatch": "The hunk's file header names a file that is not being patched, so it was not applied. Send hunks only for the file(s) being patched."
        })[type] ?? "Patch failed.";

        const diffLoc = this.FailedMatch.DiffLocation!;

        const y = new Yaml();
        y.AppendLine("PatchError:");
        y.Scalar ("  Type", this.Type.toString());
        if (this.FileKey != null) y.Scalar("  File", this.FileKey);
        y.Folded ("  Summary", SummaryFor(this.Type));
        if (this.Hint != null) y.Folded("  Hint", this.Hint);
        y.Section("  Details");                                       
        y.Section("    FailedMatch");
        y.Block  ("      ContextBefore", this.FailedMatch.ContextBefore as string[]);
        y.Block  ("      DeleteLines", this.FailedMatch.DeleteLines as string[]);
        y.Block  ("      InsertLines", this.FailedMatch.InsertLines as string[]);
        y.Block  ("      ContextAfter", this.FailedMatch.ContextAfter as string[]);
        y.Section("      DiffLocation");
        y.Scalar ("        StartLine", diffLoc.StartLine.toString());
        y.Scalar ("        Length",    diffLoc.Length.toString()); 
        return y.ToString();
    }
}