import { PatchError } from './exceptions.js';

export class PatchInputFile { constructor (public Key: string, public InputFullText: string = "", public InputSelectedText: string = "") {} }

// Verdict for a diff whose final hunk carries the tear signature (its @@ header
// declares more lines than the body delivers, ending mid-change-run). Completion
// evidence (trailing prose, a closing fence) clears the signature before this
// policy is consulted. 'warn' (the default) applies the delivered lines AND sets
// PatchOutputFile.TruncationSuspected — the leniency stance (the signature is a
// header-vs-body COUNT mismatch, and counts are at most tie-breakers, never verdicts,
// so rejecting on one would contradict the "@@ line numbers are ignored" contract)
// while still leaving a non-blocking breadcrumb a caller can disclose. 'ignore' applies
// identically but sets no flag. 'error' rejects the whole diff at parse time — opt in
// (e.g. the differential test harness) for raw-text channels where token cutoffs are real.
export type TruncationPolicy = 'error' | 'warn' | 'ignore';

// Verdict for INSERT lines carrying raw control characters (C0 minus tab/LF/CR/FF,
// plus DEL) — direct content evidence of transport damage with no legitimate
// reading (a written NUL turns the target "binary" for much of the toolchain).
// 'error' (the default — deliberately the opposite default to TruncationPolicy,
// whose signature is a mere count mismatch) rejects the whole diff at parse time,
// naming the offending code points. 'warn' applies AND sets
// PatchOutputFile.ControlCharsSuspected; 'ignore' applies silently. Delete/context
// lines are never policed: they are assertions about existing file content,
// resolved by matching — and deleting an already-damaged line must stay possible.
export type ControlCharPolicy = 'error' | 'warn' | 'ignore';

export class PatchOptions {
    constructor (
        public ContinueOnError: boolean                   = true,
        public MaxErrorIterations: number                 = 10,
        public ContextWindowMax: number                   = 8,
        public MaxChunksPerHunk: number                   = 64,
        // Appended after the originals: prepending SanitizeDiff silently retargeted
        // external positional callers (new PatchOptions(false) meant ContinueOnError).
        public SanitizeDiff: boolean                      = true,
        public Truncation: TruncationPolicy               = 'warn',
        public ControlChars: ControlCharPolicy            = 'error'
    ) {}
}

export class PatchOutputFile {
    constructor (
        public Key: string,
        public Fuzz: number,
        public Edits: Edit[],
        public InputSelectedText: string,
        public InputFullText: string,
        public OutputFullText: string,
        public Errors: PatchError[],
        // Chunks skipped because the file already reflects them — lets a zero-edit
        // outcome say "already applied" rather than a bare no-op.
        public AlreadyAppliedCount: number = 0,
        // Raw '++X' body lines interpreted as sloppy doubled insert markers (leading
        // marker dropped) — surfaced so callers can disclose the silent rewrite.
        public CollapsedMarkerLines: string[] = [],
        // True when the final hunk carried the tear signature under
        // TruncationPolicy 'warn' — the diff may have been cut off in generation, so
        // callers should disclose it and have the tail of the change verified.
        public TruncationSuspected: boolean = false,
        // True when any hunk's insert lines carried raw control characters under
        // ControlCharPolicy 'warn' — the content was applied verbatim, so callers
        // should disclose it and have the written bytes verified.
        public ControlCharsSuspected: boolean = false
    ) {}
}

/// <summary>
/// Result of applying a (potentially multi-file) patch.
/// </summary>
export class PatchOutput {
    constructor (public Files: PatchOutputFile[]) {}
}

export enum LineType { Context, Delete, Insert }

/// <summary>
/// One logical diff line with its role and LF-normalised text (no trailing newline).
/// </summary>
/// CollapsedFrom carries the raw body line when Text was produced by the sloppy
/// doubled-marker collapse ('++X' → 'X'); null otherwise.
export class DiffLine { constructor (public Type: LineType, public Text: string, public CollapsedFrom: string | null = null) {} }

/// <summary>
/// Immutable value object representing the before/after text of a unified-diff hunk.
/// Texts are stored LF-normalised with a single trailing LF when non-empty.
/// Also carries an optional line-level representation for richer matching,
/// without breaking the legacy API surface.
/// </summary>
/// <param name="OldStart">1-based line number extracted from the @@ header; ‑1 when unavailable.</param>
export class Hunk {
    constructor (public Key: string,
                          public OldText: string,
                          public NewText: string,
                          public OldStart: number = -1)
    {}

    public Lines: DiffLine[] = [];

    /// <summary>        
    /// 1-based start position for the new side when available (from +c,d header), otherwise -1.
    /// Unused, but here for Unified Diff completeness.
    /// </summary>
    public NewStart: number = -1;

    /// <summary>
    /// 0-based line number in the original diff text where this hunk's body (first diff body line) starts.
    /// -1 when unavailable (e.g., parser could not determine it).
    /// </summary>
    public DiffBodyStartLine: number = -1;

    // Set by the parser under TruncationPolicy 'warn' on the final hunk when it
    // carried the tear signature.
    public TruncationSuspected = false;

    // Set by the parser under ControlCharPolicy 'warn' when this hunk's insert
    // lines carried raw control characters.
    public ControlCharsSuspected = false;

    // Error-reporting stand-in Chunk for a hunk that was never anchored: its lines
    // and diff location, no match.
    public ToUnanchoredChunk() {
        return new Chunk(
            [],
            this.Lines.filter(l => l.Type == LineType.Delete).map(l => l.Text),
            this.Lines.filter(l => l.Type == LineType.Insert).map(l => l.Text),
            [],
            UniqueMatch.NotFound,
            new DiffLocation(this));
    }
}
    
export class Edit {
    constructor (public LineIndex: number, public DeleteLines: string[], public InsertLines: string[], public Fuzz: number = 0)
    {}

    public Shift(lineDelta: number) { return new Edit(this.LineIndex + lineDelta, this.DeleteLines, this.InsertLines, this.Fuzz); }

    public ApplyTo(lines: string[]) {
        if (this.LineIndex < 0 || this.LineIndex > lines.length)
            return;

        const deleteCount = Math.min(this.DeleteLines.length, lines.length - this.LineIndex);
        if (deleteCount > 0)
            lines.splice(this.LineIndex, deleteCount);

        if (this.InsertLines.length > 0)
            lines.splice(this.LineIndex, 0, ...this.InsertLines);
    }
}

/// <summary>
/// Identifies a span of lines in the original diff text using 1-based line numbers
/// and a length (consistent with unified diff headers).
/// Intended for UI highlighting and error reporting.
/// </summary>
export class DiffLocation  {
    public StartLine: number; public Length: number;
    constructor (startOrHunk: number | Hunk, lengthOrStartLine?: number, endLine?: number) {
        if (typeof startOrHunk === 'number') { this.StartLine = startOrHunk; this.Length = lengthOrStartLine ?? 0; }
        else {
            const hunk = startOrHunk as Hunk;
            const startLine = (lengthOrStartLine as number | undefined) ?? 0;
            const end = (endLine as number | undefined) ?? (hunk.Lines.length - 1);
            this.StartLine = hunk.DiffBodyStartLine + startLine + 1;
            this.Length = (end) - (startLine) + 1;
        }
    }
}

export class FileHunkGroup { constructor (public Key: string, public Hunks: Hunk[]) {} }

 /// <summary>
/// Represents a single diff hunk, including inferred before/after context and changed lines.
/// </summary>
export class Chunk  {
    constructor (
    public ContextBefore: string[],
    public DeleteLines: string[],
    public InsertLines: string[],
    public ContextAfter: string[],
    public Match: UniqueMatch,           // How the chunk matches the target text
    public DiffLocation: DiffLocation | null  //  Used to report error to AI when chunk can't be applied        
    )
    {}

    public get IsPureInsert() { return this.DeleteLines.length == 0 && this.InsertLines.length > 0; }
    public get IsPureDelete() { return this.DeleteLines.length > 0 && this.InsertLines.length == 0; }

    public HasContextLines() { return this.ContextBefore.length > 0 || this.ContextAfter.length > 0; }

    public DeleteLinesWithContext()
        { return [...this.ContextBefore, ...this.DeleteLines, ...this.ContextAfter]; }

    public InsertLinesWithContext()
        { return [...this.ContextBefore, ...this.InsertLines, ...this.ContextAfter]; }

    public with(values: Partial<Chunk>) { return new Chunk(
        values.ContextBefore ?? this.ContextBefore,
        values.DeleteLines ?? this.DeleteLines,
        values.InsertLines ?? this.InsertLines,
        values.ContextAfter ?? this.ContextAfter,
        values.Match ?? this.Match,
        values.DiffLocation ?? this.DiffLocation
    ); }
}

export enum MatchState { Success, Ambiguous, NotFound };

export class UniqueMatch {
    constructor (public State: MatchState, public LineIndex: number = -1, public Fuzz: number = 0) {}
    public get IsAmbiguous() { return this.State == MatchState.Ambiguous; }
    public get IsNotFound() { return this.State == MatchState.NotFound; }
    public get IsSuccess() { return this.State == MatchState.Success; }

    public static get Ambiguous() { return new UniqueMatch(MatchState.Ambiguous); }
    public static get NotFound() { return new UniqueMatch(MatchState.NotFound); }

    public with(values: Partial<UniqueMatch>) { return new UniqueMatch(
        values.State ?? this.State,
        values.LineIndex ?? this.LineIndex,
        values.Fuzz ?? this.Fuzz
    ); }
}

