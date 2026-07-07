export function isDiffMarker(line: string): boolean {
    return line.startsWith('--- ') || 
           line.startsWith('+++ ') || 
           line.startsWith('@@') || 
           line.startsWith('diff --git');
}

export function isHunkBoundary(line: string, trimmed: string): boolean {
    return isDiffMarker(line) || trimmed.startsWith('```');
}

export function isValidPrefix(char: string): boolean {
    return char === '+' || char === '-' || char === ' ';
}

// Inside a hunk body every line is content, so sanitizers must not touch it — a
// dash-only line there is a real deletion, "+++ NOTE +++" a real insert. Decoration
// exists only between hunks. Counted headers (@@ -a,b +c,d @@) declare exactly how
// many body lines follow; a bare @@ carries no counts, so its body is taken as the
// run of +/-/space-prefixed lines that follows, ending at a blank line, a file
// header, or any other non-diff-shaped line. Applies transform to each line outside
// hunk bodies; returning null drops the line. Splits on '\n' only, so a trailing
// '\r' rides along on each line and CRLF input round-trips byte-identically.
export function transformOutsideHunkBodies(text: string, transform: (line: string) => string | null): string {
    let remainingOld = 0, remainingNew = 0;
    let inBareBody = false;
    const kept: string[] = [];
    for (const line of text.split('\n')) {
        const trimmed = line.trim();
        const m = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/.exec(trimmed);
        if (m) {
            remainingOld = m[1] !== undefined ? parseInt(m[1]) : 1;
            remainingNew = m[2] !== undefined ? parseInt(m[2]) : 1;
            inBareBody = false;
            kept.push(line);
            continue;
        }
        if (remainingOld > 0 || remainingNew > 0) {
            const c = line.length > 0 ? line[0] : ' ';
            if (c === '-') remainingOld--;
            else if (c === '+') remainingNew--;
            else { remainingOld--; remainingNew--; }
            kept.push(line);
            continue;
        }
        if (trimmed.startsWith('@@')) {
            inBareBody = true;
            kept.push(line);
            continue;
        }
        if (inBareBody && line.length > 0 && isValidPrefix(line[0]) && !isLikelyFileHeader(trimmed)) {
            kept.push(line);
            continue;
        }
        inBareBody = false;
        const t = transform(line);
        if (t !== null) kept.push(t);
    }
    return kept.join('\n');
}

// Mirrors the parser's header-vs-content disambiguation (LooksLikePath): inside a
// bare-@@ body, "--- Section ---" is a deletion of "-- Section ---", but
// "--- file2.ts ---" is the next file's header and ends the body.
function isLikelyFileHeader(trimmed: string): boolean {
    return trimmed.startsWith('diff --git') ||
        ((trimmed.startsWith('--- ') || trimmed.startsWith('+++ ')) &&
         (trimmed.includes('.') || trimmed.includes('/') || trimmed.includes('\\')));
}