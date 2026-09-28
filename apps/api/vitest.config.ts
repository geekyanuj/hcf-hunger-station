import { defineConfig } from 'vitest/config';

// Integration tests (need MongoDB — in-memory by default, or TEST_MONGO_URI).
// Pure unit tests live in src/tests/unit and run via `npm run test:unit`.
export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000,
    include: ['src/tests/**/*.test.ts'],
    exclude: ['src/tests/unit/**', 'node_modules/**'],
    setupFiles: ['src/tests/setup.ts'],
  },
});
