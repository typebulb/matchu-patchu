/**
 * Ambiguity resolution tests
 * Tests disambiguation via grown context and coalesced blocks
 */

import { describe, it } from 'vitest'
import { TestHelpers } from '../helpers'

describe('Ambiguity Resolution', () => {
  it('should disambiguate via grown context', () => {
    const original = `Start
u3a
u2
u1
B
d1
d2
d3a
Middle
u3b
u2
u1
B
d1
d2
d3b
End
`
    // Three context lines above (u3b,u2,u1) and three below (d1,d2,d3b).
    // The nearest two lines above/below (u2,u1 and d1,d2) are identical at both sites,
    // so k=1 and k=2 remain ambiguous; only at k=3 does it become unique.
    const patch = `@@ -10,7 +10,7 @@
 u3b
 u2
 u1
-B
+B2
 d1
 d2
 d3b
`
    const expected = `Start
u3a
u2
u1
B
d1
d2
d3a
Middle
u3b
u2
u1
B2
d1
d2
d3b
End
`
    TestHelpers.assertApply(original, patch, expected)
  })

  it('should disambiguate via coalesced adjacent blocks', () => {
    const original = `Start
U3
U2
U1
B
D
d1
Second
C3
C2
C1
B
D
d2
End
`
    const patch = `@@ -2,7 +2,7 @@
 U3
 U2
 U1
-B
+BX
 D
 d1

@@ -10,6 +10,6 @@
 C3
 C2
 C1
-B
+BY
 D
 d2
`
    const expected = `Start
U3
U2
U1
BX
D
d1
Second
C3
C2
C1
BY
D
d2
End
`
    TestHelpers.assertApply(original, patch, expected)
  })

  it('should handle coalesced adjacent blocks variant', () => {
    const original = `Start
U3
U2
U1
B
D
d1
Middle
U3
U2
U1
B
D
d2
End
`
    const patch = `@@ -8,7 +8,7 @@
·U3
·U2
·U1
-B
-D
+B_MODIFIED
+D_MODIFIED
·d2
`
    const expected = `Start
U3
U2
U1
B
D
d1
Middle
U3
U2
U1
B_MODIFIED
D_MODIFIED
d2
End
`
    TestHelpers.assertApply(original, patch, expected)
  })

  it('should handle full file duplicate blocks', () => {
    const original = `Top
A
A
A
Bottom
`
    // Real LLMs add context to disambiguate duplicate lines
    const patch = `@@ -2,3 +2,3 @@
 A
-A
+A_MOD
 A
`
    const expected = `Top
A
A_MOD
A
Bottom
`
    TestHelpers.assertApply(original, patch, expected)
  })
})

