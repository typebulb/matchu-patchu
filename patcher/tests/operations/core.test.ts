/**
 * Core patcher operations tests
 * Tests basic insert, delete, and modify operations
 */

import { describe, it, expect } from 'vitest'
import { TestHelpers } from '../helpers'
import { Patcher } from '../../dist/index.js'

describe('Core Operations', () => {
  describe('Pure Inserts', () => {
    it('should insert in empty file', () => {
      const original = ''
      const patch = `@@ -0,0 +1,2 @@
+Line1
+Line2
`
      const expected = `Line1
Line2
`
      TestHelpers.assertApply(original, patch, expected)
    })

    it('should insert at end of file', () => {
      const original = `Line1
Line2
`
      const patch = `@@ -2,0 +2,1 @@
+Line2.5
`
      const expected = `Line1
Line2
Line2.5
`
      TestHelpers.assertApply(original, patch, expected)
    })
  })

  describe('Pure Deletes', () => {
    it('should delete from middle of file', () => {
      const original = `A
B
C
`
      const patch = `@@ -2,1 +2,0 @@
-B
`
      const expected = `A
C
`
      TestHelpers.assertApply(original, patch, expected)
    })

    it('should delete from start of file', () => {
      const original = `First
Second
Third
`
      const patch = `@@ -1,1 +1,0 @@
-First
`
      const expected = `Second
Third
`
      TestHelpers.assertApply(original, patch, expected)
    })

    it('should delete from end of file', () => {
      const original = `One
Two
Three
`
      const patch = `@@ -3,1 +3,0 @@
-Three
`
      const expected = `One
Two
`
      TestHelpers.assertApply(original, patch, expected)
    })

    it('should delete multiple lines', () => {
      const original = `A
B
C
D
E
`
      const patch = `@@ -2,3 +2,0 @@
-B
-C
-D
`
      const expected = `A
E
`
      TestHelpers.assertApply(original, patch, expected)
    })

    it('should delete whole file', () => {
      const original = `OnlyLine
`
      const patch = `@@ -1 +0,0 @@
-OnlyLine
`
      const expected = ``
      TestHelpers.assertApply(original, patch, expected)
    })
  })

  describe('Modifications', () => {
    it('should modify with context', () => {
      const original = `Line1
Line2
Line3
Line4
Line5
`
      const patch = `--- a/file.txt
+++ b/file.txt
@@ -1,5 +1,5 @@
 Line1
 Line2
-Line3
+NewLine3
 Line4
 Line5
`
      const expected = `Line1
Line2
NewLine3
Line4
Line5
`
      TestHelpers.assertApply(original, patch, expected)
      
      // Also verify edit structure
      const files = [{ Key: 'file.txt', InputFullText: original, InputSelectedText: '' }]
      const outcome = Patcher.Apply(patch, files)
      const edit = TestHelpers.assertSingle(outcome.Files[0].Edits)
      TestHelpers.assertEqual(edit.LineIndex, 2, 'Edit at line 2')
      TestHelpers.assertEqual(edit.DeleteLines.length, 1, 'One deletion')
      TestHelpers.assertArrayEqual(edit.InsertLines, ['NewLine3'], 'Correct insertion')
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty file to content', () => {
      const original = ''
      const patch = `@@ -0,0 +1,3 @@
+Line1
+Line2
+Line3
`
      const expected = `Line1
Line2
Line3
`
      TestHelpers.assertApply(original, patch, expected)
    })

    it('should handle content to empty file', () => {
      const original = `Line1
Line2
Line3
`
      const patch = `@@ -1,3 +0,0 @@
-Line1
-Line2
-Line3
`
      const expected = ''
      TestHelpers.assertApply(original, patch, expected)
    })
  })
})

