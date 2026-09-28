import { defineConfig } from 'vitest/config';

// Pure unit tests (state machines, migration mapping): no database, no setup file.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/tests/unit/**/*.test.ts'],
  },
});
