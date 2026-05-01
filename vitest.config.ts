import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: [
      "node_modules",
      "tests/ai-eval-suite.test.ts",
      "tests/golden-set.test.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/shared/**/*.ts"],
      exclude: ["node_modules"],
    },
  },
});
