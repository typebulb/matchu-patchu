/**
 * SQL torture suite
 *
 * Realistic LLM-mangled diffs against SQL sources, in single-file mode:
 * single file, key "", frequently headerless. SQL's `--` line comments collide
 * with diff deletion markers in every way that matters, so this file attacks
 * each collision deliberately.
 */

import { describe, it, expect } from 'vitest'
import { TestHelpers } from '../helpers'
import { Patcher } from '../../dist/index.js'

const sqlFile = (content: string) => [{ Key: '', InputFullText: content, InputSelectedText: '' }]

describe('SQL torture', () => {
  it('headerless: replaces a leading -- comment via triple-dash deletion', () => {
    const original = `-- comment1
-- comment2
select *
from customer
`
    const patch = `@@ -1,4 +1,4 @@
--- comment1
+-- comment1a
 -- comment2
 select *
 from customer
`
    const expected = `-- comment1a
-- comment2
select *
from customer
`
    TestHelpers.assertApply(original, patch, expected)
  })

  it('headerless: rescues missing context prefix on a -- comment line', () => {
    // LLM forgot the leading space on the "-- setup" context line.
    // Without content evidence this parses as deletion of "- setup" and fails.
    const original = `-- setup
SELECT 1;
`
    const patch = `@@ -1,2 +1,2 @@
-- setup
-SELECT 1;
+SELECT 2;
`
    const expected = `-- setup
SELECT 2;
`
    TestHelpers.assertApply(original, patch, expected)
  })

  it('headerless: raw deletion line carrying an LLM -- annotation is verified against the file', () => {
    // "WHERE id = 1  -- old filter" — the annotation is the LLM's, not the file's.
    const original = `SELECT *
FROM users
WHERE id = 1
`
    const patch = `@@ -1,3 +1,3 @@
 SELECT *
 FROM users
WHERE id = 1  -- old filter
+WHERE id = 2
`
    const expected = `SELECT *
FROM users
WHERE id = 2
`
    TestHelpers.assertApply(original, patch, expected)
  })

  it('does not strip -- when it is real file content', () => {
    // Here the full annotated line exists in the file; stripping would corrupt it.
    const original = `SELECT a -- projected
FROM t
`
    const patch = `@@ -1,2 +1,2 @@
 SELECT a -- projected
-FROM t
+FROM t2
`
    const expected = `SELECT a -- projected
FROM t2
`
    TestHelpers.assertApply(original, patch, expected)
  })

  it('headerless: inserts new -- comment lines', () => {
    const original = `SELECT * FROM users;
`
    const patch = `@@
-SELECT * FROM users;
+-- Select only active users
+SELECT * FROM users WHERE active = 1;
`
    const expected = `-- Select only active users
SELECT * FROM users WHERE active = 1;
`
    TestHelpers.assertApply(original, patch, expected)
  })

  it('uniformly indented diff body (pasted from markdown) against SQL', () => {
    const original = `-- header
SELECT id,
       name
FROM users;
`
    const patch = `@@ -1,4 +1,4 @@
     -- header
     SELECT id,
    -       name
    +       name, email
     FROM users;
`
    const expected = `-- header
SELECT id,
       name, email
FROM users;
`
    TestHelpers.assertApply(original, patch, expected)
  })

  it('headerless: comment-only file grows a comment', () => {
    const original = `-- Comment 1
-- Comment 2
`
    const patch = `@@ -1,2 +1,3 @@
 -- Comment 1
 -- Comment 2
+-- Comment 3
`
    const expected = `-- Comment 1
-- Comment 2
-- Comment 3
`
    TestHelpers.assertApply(original, patch, expected)
  })

  it('failure stays contained: unmatched SQL edit reports a structured error, file untouched', () => {
    const original = `SELECT * FROM users;
`
    const patch = `@@ -1,1 +1,1 @@
-SELECT * FROM orders;
+SELECT * FROM customers;
`
    const result = Patcher.Apply(patch, sqlFile(original))
    expect(result.Files[0].Errors.length).toBeGreaterThan(0)
    expect(result.Files[0].Errors[0].Type).toBe('MatchNotFound')
    expect(result.Files[0].OutputFullText).toBe(original)
  })
})
