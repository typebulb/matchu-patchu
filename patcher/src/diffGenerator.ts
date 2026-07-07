import { TextUtils } from './utils/textUtils.js'

export interface DiffInput {
  key: string
  oldContent: string
  newContent: string
}

/**
 * Generates synthetic unified diff format from before/after content.
 * 
 * Creates "delete all + insert all" diffs - useful for converting whole-file
 * replacements into the unified diff format that Patcher.Apply() consumes.
 */
export class DiffGenerator {
  static generate(files: DiffInput[]): string {
    return files
      .filter(f => f.oldContent !== f.newContent)  // Skip unchanged files
      .map(f => this.generateFileDiff(f.key, f.oldContent, f.newContent))
      .join('\n\n')
  }

  private static generateFileDiff(filename: string, oldContent: string, newContent: string): string {
    const oldLines = this.toLines(oldContent)
    const newLines = this.toLines(newContent)
    const hunkHeader = `@@ -1,${oldLines.length} +1,${newLines.length} @@`
    
    const deletions = oldLines.map(line => `-${line}`)
    const insertions = newLines.map(line => `+${line}`)
    
    return [this.formatDiffHeader(filename), hunkHeader, ...deletions, ...insertions].join('\n')
  }

  private static toLines(content: string): string[] {
    return content === '' ? [] : TextUtils.ToLines(content)
  }

  private static formatDiffHeader(filename: string): string {
    return `--- ${filename}\n+++ ${filename}`
  }
}

