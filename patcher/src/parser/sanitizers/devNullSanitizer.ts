/**
 * Fixes /dev/null usage for files that exist.
 * LLMs often use "new file mode" and "/dev/null" for empty files that already exist.
 */
export class DevNullSanitizer {
    public static process(text: string, fileKeys?: string[]): string {
        if (!fileKeys?.length) return text;
        
        const existingFiles = new Set(fileKeys);
        const lines = text.split('\n');
        const result: string[] = [];
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            
            // Skip "new file mode" for existing files
            if (this.isNewFileModeForExistingFile(trimmed, lines, i, existingFiles)) {
                continue;
            }
            
            // Convert "--- /dev/null" to "--- a/file" for existing files
            if (trimmed.startsWith('--- /dev/null')) {
                const targetFile = this.getTargetFileFromNextLine(lines[i + 1]);
                if (targetFile && existingFiles.has(targetFile)) {
                    result.push(line.replace('/dev/null', `a/${targetFile}`));
                    continue;
                }
            }
            
            result.push(line);
        }
        
        return result.join('\n');
    }

    private static isNewFileModeForExistingFile(line: string, allLines: string[], currentIndex: number, existingFiles: Set<string>): boolean {
        if (!line.startsWith('new file mode')) return false;
        
        const prevLine = allLines[currentIndex - 1]?.trim() || '';
        if (!prevLine.startsWith('diff --git')) return false;
        
        const match = prevLine.match(/diff --git\s+[ab]\/(\S+)\s+[ab]\/\S+/);
        const filePath = match?.[1];
        return filePath ? existingFiles.has(filePath) : false;
    }

    private static getTargetFileFromNextLine(nextLine?: string): string | null {
        if (!nextLine?.trim().startsWith('+++ ')) return null;
        const match = nextLine.match(/^\+\+\+\s+(?:[ab]\/)?(\S+)/);
        return match?.[1] ?? null;
    }
}