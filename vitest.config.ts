import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**"],
      exclude: [
        "src/**/*.test.ts",
        // src/cli.ts is exercised end-to-end via test/integration/* which
        // spawn the compiled CLI as a subprocess via `tsx`. v8 coverage
        // does not see across that process boundary, so the file would
        // report 0% under unit coverage despite being well-tested at
        // the integration tier. Exclude it from the threshold computation
        // and rely on the integration suite to gate CLI behaviour.
        "src/cli.ts",
      ],
      // Thresholds set within ~5 points of the observed baseline so accidental
      // regressions fail CI but routine churn doesn't flake. Baseline as of
      // 2026-05-13: stmts 88.07 / branches 74.78 / funcs 98.09 / lines 94.34.
      thresholds: {
        lines: 90,
        statements: 85,
        functions: 95,
        branches: 70,
      },
    },
  },
});
