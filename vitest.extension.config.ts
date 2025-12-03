import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.js"],
    globals: false,
  },
  resolve: {
    alias: {
      "@arete/core": resolve(__dirname, "packages/core/dist/index.js"),
    },
  },
});
