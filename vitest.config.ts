import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary', 'lcov'],
      // Engine modules are the pure logic we want covered.
      include: ['src/engine/**/*.ts'],
      exclude: [
        'src/engine/**/*.test.ts',
        // supabase.ts is a thin adapter over an external service — only the
        // null-fallback path is unit-testable; integration coverage happens
        // in staging against a real Supabase project.
        'src/engine/supabase.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 75,
      },
    },
  },
});
