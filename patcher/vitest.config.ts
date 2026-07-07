import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: false,  // Require explicit imports
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})

