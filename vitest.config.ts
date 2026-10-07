import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules/**", "dist/**"],

    // These integration tests share one isolated database, so running test
    // files concurrently could make one suite interfere with another.
    fileParallelism: false,
  },
});