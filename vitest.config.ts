import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**"],
      exclude: ["src/**/*.test.ts"],
      // Thresholds set conservatively. Run `npm run coverage` once after
      // Task E1 to baseline the actual numbers, then bump these to within
      // ~5% of observed so accidental regressions fail CI.
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 70,
      },
    },
  },
});
