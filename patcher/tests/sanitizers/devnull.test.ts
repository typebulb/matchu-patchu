/**
 * DevNullSanitizer Tests
 * 
 * Tests the sanitizer's ability to handle LLMs (like DeepSeek) that incorrectly
 * use "new file mode" and "/dev/null" syntax for files that already exist but are empty.
 */

import { describe, it, expect } from 'vitest'
import { Patcher } from '../../dist/index.js'

describe('DevNull Sanitizer', () => {
  it('should handle empty file with /dev/null syntax', () => {
    const original = '' // File exists but is empty
    const patch = `diff --git a/styles.css b/styles.css
new file mode 100644
index 0000000..b2c04fb
--- /dev/null
+++ b/styles.css
@@ -0,0 +1,3 @@
+html {
+  color: red;
+}
`
    const expected = `html {
  color: red;
}
`
    const files = [{ Key: 'styles.css', InputFullText: original, InputSelectedText: '' }]
    const outcome = Patcher.Apply(patch, files)
    
    expect(outcome.Files[0].Errors.length).toBe(0)
    expect(outcome.Files[0].OutputFullText).toBe(expected)
  })

  it('should handle multiple empty files with /dev/null', () => {
    const indexOriginal = ''
    const stylesOriginal = ''
    
    const patch = `diff --git a/index.html b/index.html
new file mode 100644
index 0000000..0a25b36
--- /dev/null
+++ b/index.html
@@ -0,0 +1,3 @@
+<div id="root"></div>
+<p>Test</p>
+
diff --git a/styles.css b/styles.css
new file mode 100644
index 0000000..b2c04fb
--- /dev/null
+++ b/styles.css
@@ -0,0 +1,5 @@
+body {
+  margin: 0;
+  padding: 0;
+}
+
`
    const files = [
      { Key: 'index.html', InputFullText: indexOriginal, InputSelectedText: '' },
      { Key: 'styles.css', InputFullText: stylesOriginal, InputSelectedText: '' }
    ]
    
    const outcome = Patcher.Apply(patch, files)
    
    expect(outcome.Files[0].Errors.length).toBe(0)
    expect(outcome.Files[1].Errors.length).toBe(0)
    expect(outcome.Files[0].OutputFullText).toBe(`<div id="root"></div>
<p>Test</p>

`)
    expect(outcome.Files[1].OutputFullText).toBe(`body {
  margin: 0;
  padding: 0;
}

`)
  })

  it('should handle actual new file correctly', () => {
    // If file truly doesn't exist in fileKeys, /dev/null should be left alone
    const patch = `diff --git a/newfile.txt b/newfile.txt
new file mode 100644
index 0000000..abc1234
--- /dev/null
+++ b/newfile.txt
@@ -0,0 +1,2 @@
+Line1
+Line2
`
    const files = [
      { Key: 'newfile.txt', InputFullText: '', InputSelectedText: '' }
    ]
    
    const outcome = Patcher.Apply(patch, files)
    
    expect(outcome.Files[0].Errors.length).toBe(0)
    expect(outcome.Files[0].OutputFullText).toBe(`Line1
Line2
`)
  })

  it('should not affect existing file with content', () => {
    const original = `existing content
`
    const patch = `diff --git a/file.txt b/file.txt
index abc1234..def5678
--- a/file.txt
+++ b/file.txt
@@ -1 +1,2 @@
 existing content
+new line
`
    const expected = `existing content
new line
`
    const files = [{ Key: 'file.txt', InputFullText: original, InputSelectedText: '' }]
    const outcome = Patcher.Apply(patch, files)
    
    expect(outcome.Files[0].Errors.length).toBe(0)
    expect(outcome.Files[0].OutputFullText).toBe(expected)
  })

  it('should handle mixed scenario - some empty, some with content', () => {
    const patch = `diff --git a/empty.css b/empty.css
new file mode 100644
index 0000000..abc1234
--- /dev/null
+++ b/empty.css
@@ -0,0 +1,3 @@
+body {
+  margin: 0;
+}

diff --git a/hasContent.js b/hasContent.js
index def5678..ghi9012
--- a/hasContent.js
+++ b/hasContent.js
@@ -1 +1,2 @@
 console.log('exists')
+console.log('added')
`
    const files = [
      { Key: 'empty.css', InputFullText: '', InputSelectedText: '' },
      { Key: 'hasContent.js', InputFullText: `console.log('exists')
`, InputSelectedText: '' }
    ]
    
    const outcome = Patcher.Apply(patch, files)
    
    expect(outcome.Files[0].Errors.length).toBe(0)
    expect(outcome.Files[1].Errors.length).toBe(0)
    expect(outcome.Files[0].OutputFullText).toBe(`body {
  margin: 0;
}
`)
    expect(outcome.Files[1].OutputFullText).toBe(`console.log('exists')
console.log('added')
`)
  })
})

