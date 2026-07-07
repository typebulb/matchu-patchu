import { Header, HunkBuilder } from './hunkBuilder.js';
import { FileHunkGroup, TruncationPolicy } from '../models.js';
import { DiffContentHeuristics } from './heuristics.js';
import { PatchParserException } from '../exceptions.js';
import { ArrayUtils } from '../utils/arrayUtils.js';
import { TextUtils } from '../utils/textUtils.js';

/// <summary>
/// Parses unified-diff text into structured hunks.
/// </summary>
export class UnifiedDiffParser
{
    /**
     * Parse a unified diff into structured hunks.
     * @param diff - The diff text to parse
     * @param files - Map of filename to content (content used for disambiguation of ambiguous lines)
     * @param truncation - Verdict for a surviving tear signature on the final hunk
     */
    public static Parse(diff: string, files: Map<string, string>, truncation: TruncationPolicy = 'warn')
    {
        const hunks = (diff == null || diff.trim().length == 0) ? [] : UnifiedDiffParser.ParseHunks(diff, files, truncation);

        const fileKeySet = new Set<string>(files.keys());
        const headerless       = hunks.filter(h => h.Key == null || h.Key == "");
        const explicitKnown    = hunks.filter(h => h.Key != null && h.Key != "" && fileKeySet.has(h.Key));
        const explicitFallback = hunks.filter(h => h.Key != null && h.Key != "" && !fileKeySet.has(h.Key));

        const groups: FileHunkGroup[] = [];

        if (headerless.length > 0)
            groups.push(new FileHunkGroup("", headerless));

        if (explicitKnown.length > 0)
            ArrayUtils.GroupBy(explicitKnown, h => h.Key)
                .map(g => new FileHunkGroup(g.key, g.values))
                .forEach(x => groups.push(x));

        // Single-file special-case: a diff whose hunks all name ONE (unknown) path was
        // written for the single unnamed buffer — route it there. Multi-path diffs are
        // deliberately NOT guessed at: their unrouted groups are still returned (under
        // their own keys) so the caller can report them loudly instead of a silent no-op.
        const treatAsSingleFile =
            fileKeySet.size == 1 &&
            fileKeySet.has("") &&
            explicitKnown.length == 0 &&
            headerless.length == 0 &&
            Array.from(new Set(explicitFallback.map(h => h.Key))).length == 1;

        if (treatAsSingleFile && explicitFallback.length > 0)
            groups.push(new FileHunkGroup("", explicitFallback));
        else if (explicitFallback.length > 0)
            ArrayUtils.GroupBy(explicitFallback, h => h.Key)
                .map(g => new FileHunkGroup(g.key, g.values))
                .forEach(x => groups.push(x));

        return groups;
    }

    static ParseHunks(diff: string, fileContents?: Map<string, string>, truncation: TruncationPolicy = 'warn') {
        const hunkBuilder = new HunkBuilder();
        const body: string[] = [];
        let header  = new Header();

        let inFence = false;
        let inHunkBody = false;
        let lineNo = -1;

        // Single-file mode (editor buffers are keyed ""): use that file's content for
        // headerless hunks and for headers that don't name a known file, so content
        // disambiguation still applies when the diff carries no usable file headers.
        const defaultFileLines = fileContents?.size == 1 && fileContents.has("")
            ? UnifiedDiffParser.ToFileLines(fileContents.get(""))
            : undefined;
        let currentFileLines = defaultFileLines;
        let fileLineSet = UnifiedDiffParser.ToLineSet(currentFileLines);

        for (const raw of UnifiedDiffParser.StripCommonIndent(diff.replace(/\r\n/g, "\n")).split('\n')) {
            lineNo++;

            // Self-referential context guard (finding 19): a raw line reading as
            // ' ' + <exact file line> is a context line whose CONTENT is diff-shaped
            // (files that contain diff literals — this repo's own tests). Content
            // evidence outranks structure heuristics: no indent-stripping, fence,
            // meta, or header detection may reinterpret it as diff structure.
            if (raw.length > 1 && raw[0] == ' ' && fileLineSet != null &&
                fileLineSet.has(raw.slice(1).replace(/\s+$/, ''))) {
                body.push(raw);
                continue;
            }

            const line = UnifiedDiffParser.StripIndent(raw, currentFileLines);

            // fenced ```diff blocks
            if (line.startsWith("```diff")) { inFence = true; continue; }
            if (!inFence && line.startsWith("```") ) { continue; } // stray fence line outside a diff fence
            if (inFence && line.startsWith("```") ) { hunkBuilder.CommitIfAny(header, body, currentFileLines); hunkBuilder.ClearTruncation(); inFence = false; inHunkBody = false; continue; }

            if (UnifiedDiffParser.IsMeta(line)) continue;

            // File headers: `diff --git`, `---`, `+++`
            const path = UnifiedDiffParser.TryParseFileHeader(line);
            if (path && UnifiedDiffParser.IsFileHeader(line, path, inHunkBody, fileContents, fileLineSet, body, currentFileLines)) {
                hunkBuilder.CommitIfAny(header, body, currentFileLines);
                header = new Header(path);
                // Update current file content for disambiguation
                currentFileLines = UnifiedDiffParser.ToFileLines(fileContents?.get(path)) ?? defaultFileLines;
                fileLineSet = UnifiedDiffParser.ToLineSet(currentFileLines);
                inHunkBody = false;
                continue;
            }

            // @@ -a,b +c,d @@
            const parsedHdr = UnifiedDiffParser.TryParseHunkHeader(line);
            if (parsedHdr) {
                hunkBuilder.CommitIfAny(header, body, currentFileLines);
                header = Header.WithParsed(header, parsedHdr, lineNo + 1);
                inHunkBody = true;
                continue;
            }
            body.push(line);
        }

        hunkBuilder.CommitIfAny(header, body, currentFileLines);
        const hunks = hunkBuilder.Hunks;
        // The policy decides the verdict only for a SURVIVING signature — completion
        // evidence (trailing prose, fence-close) already cleared it in the builder.
        if (hunkBuilder.LastHunkTruncated && truncation != 'ignore') {
            if (truncation == 'error')
                throw new PatchParserException(
                    "The diff appears truncated mid-hunk: the final hunk's header declares more " +
                    "lines than its body delivers. Nothing was applied; re-send the complete diff.");
            if (hunks.length > 0)
                hunks[hunks.length - 1].TruncationSuspected = true;
        }
        return hunks;
    }        

    static readonly MetaPrefixes = [
        "index ", "new file mode ", "deleted file mode ", "similarity index ",
        "rename from ", "rename to ", "Binary files ", "GIT binary patch", "mode change "
    ];

    static IsMeta(line: string) { return UnifiedDiffParser.MetaPrefixes.some(p => line.startsWith(p)); }

    static ToFileLines(content?: string) {
        return content ? content.replace(/\r\n/g, '\n').split('\n') : undefined;
    }

    static ToLineSet(lines?: string[]) {
        return lines ? new Set(lines.map(l => l.replace(/\s+$/, ''))) : undefined;
    }

    // Strips the longest common whitespace prefix from all non-empty diff body lines.
    // This normalizes diffs that are uniformly indented (e.g. pasted inside a markdown block
    // or another indented structure), while preserving the single-space context markers on
    // lines whose content happens to start with '+' or '-'.
    //
    // @@ hunk headers are excluded from the prefix calculation because an LLM may indent
    // body lines but not the header (or vice versa). The strip is applied only to lines
    // that actually start with the computed prefix, so unindented headers are left intact.
    //
    // Runs before the per-line StripIndent pass: this handles uniform indentation
    // (including a single-space indent that per-line stripping must not touch), while
    // StripIndent handles ragged 2+ whitespace indentation line by line.
    static StripCommonIndent(diff: string) {
        const lines = diff.split('\n');
        let common: string | null = null;
        for (const line of lines) {
            if (line.length == 0) continue;
            const i = TextUtils.CountLeadingWhitespace(line);
            if (line.startsWith("@@", i)) continue; // exclude hunk headers
            const prefix = line.substring(0, i);
            if (common == null) { common = prefix; continue; }
            const minLen = Math.min(common.length, prefix.length);
            let j = 0;
            while (j < minLen && common[j] == prefix[j]) j++;
            common = common.substring(0, j);
            if (common.length == 0) return diff;
        }
        if (common == null || common.length == 0) return diff;
        const c = common;
        // Only strip if at least one body line reveals a '+' or '-' diff marker after stripping.
        // This prevents stripping the context-marker space from pure-context hunks (e.g. a
        // hunk whose body contains only unchanged lines like " C") while still handling
        // uniformly-indented diffs that have real additions/deletions.
        if (!lines.some(l => l.startsWith(c) && l.length > c.length &&
                             (l[c.length] == '+' || l[c.length] == '-')))
            return diff;
        // Use startsWith rather than unconditional slice so that @@ headers that weren't
        // uniformly indented with the body are left untouched.
        return lines.map(l => l.startsWith(c) ? l.substring(c.length) : l).join('\n');
    }

    static StripIndent(s: string, fileLines?: string[]) {
        if (s == null || s.length == 0) return s;
        // Only strip indentation (2+ spaces/tabs), not single space diff markers
        const stripped = s.replace(/^[ \t]{2,}/, "");

        // If stripping reveals "- " (hyphen + space), this could be either:
        // 1. An indented DELETE line (deleting content that starts with a space)
        // 2. A properly formatted CONTEXT line containing a markdown bullet
        // Use file content to disambiguate when available.
        if (fileLines && stripped.length > 1 && stripped[0] === '-' && stripped[1] === ' ') {
            return DiffContentHeuristics.ResolveHyphenSpaceAmbiguity(s, stripped, fileLines);
        }

        // Over-indented CONTEXT line whose content starts with '+' (e.g. "   ++i;" for
        // file content "    ++i;"): stripping would hand it to the doubled-marker
        // collapse, which fabricates an insert of its tail. Inserts have no file image
        // to verify, so file evidence decides the other way: if the whole stripped line
        // exists in the file (whitespace-insensitive), it is content — keep the line.
        if (fileLines && stripped.length > 0 && stripped[0] === '+' &&
            fileLines.some(f => f.trim() == stripped.trimEnd()))
            return s;

        // Only strip if it reveals valid diff syntax, not content that happens to start with markers
        return DiffContentHeuristics.IsValidDiffLineStart(stripped) ? stripped : s;
    }

    static TryParseFileHeader(line: string) {
        if (! (line.startsWith("diff --git ") || line.startsWith("--- ") || line.startsWith("+++ "))) {
            return null;
        }

        const path = line.startsWith("diff --git ")
            ? UnifiedDiffParser.Canon(line.split(' ').filter(s=>s.length>0)[2])
            : UnifiedDiffParser.Canon(line.length >= 4 ? line.substring(4) : "");

        return path;
    }

    // Inside a hunk body, `--- foo` could be deletion of `-- foo` (SQL comment,
    // prose) and `+++ foo` insertion of `++ foo` — or the next file's header.
    // Evidence ladder: a transition to a file we HOLD
    // is a real header; otherwise content decides — the delete reading wins when
    // the current file contains `-- foo` verbatim, the insert reading when the
    // body so far is a verified diff-shaped region (real header pairs never hit
    // this: their `+++` follows a header-read `---`, which ends the body). Only
    // in an evidence vacuum does the structure heuristic decide: real paths have
    // `.` (extension) or `/` (directory); prose doesn't.
    static IsFileHeader(line: string, path: string, inHunkBody: boolean,
                        files?: Map<string, string>,
                        fileLineSet?: Set<string>,
                        body?: string[], fileLines?: string[]) {
        if (!inHunkBody) return true;
        if (line.startsWith("diff --git ")) return true;
        if (path != "" && files?.has(path)) return true;
        if (line.startsWith("--- ") && fileLineSet != null &&
            fileLineSet.has(line.slice(1).replace(/\s+$/, ''))) return false;
        if (line.startsWith("+++ ") && body != null &&
            DiffContentHeuristics.IsDiffShapedRegion(body, fileLines)) return false;
        return UnifiedDiffParser.LooksLikePath(path);
    }

    static LooksLikePath(path: string) {
        return path.includes('.') || path.includes('/') || path.includes('\\') || path === '/dev/null';
    }

    static Canon(p?: string | null) {
        if (p == null || p.length == 0) return p;
        p = p.trim();
        if (p.startsWith("a/") || p.startsWith("b/")) p = p.substring(2);
        return p;
    }

    static TryParseHunkHeader(line: string) {
        const t = line.trim();
        if (!t.startsWith("@@"))
            return null;    

        let header = new Header();
        const parts = t.replace(/^[@ ]+|[@ ]+$/g, '').split(' ').filter(s=>s.length>0);
        if (parts.length > 0) header = Header.ParseSide(header, parts[0], '-', true);
        if (parts.length > 1) header = Header.ParseSide(header, parts[1], '+', false);
        return header;
    }
}