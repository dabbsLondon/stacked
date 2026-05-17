import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Force the backend adapter into its "no config" path during tests, even
  // when a developer has VITE_PB_URL set in their local .env.local.
  define: {
    'import.meta.env.VITE_PB_URL': '""',
  },
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
        // backend.ts is a thin adapter over PocketBase; only the no-config
        // fallback is unit-testable here. Integration coverage happens in
        // staging against a real PocketBase instance.
        'src/engine/backend.ts',
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
