import { defineConfig } from "vitest/config";

// Unit tests only. Playwright specs (e2e/, e2e-diagnose/, samples/) are run by Playwright, not Vitest.
export default defineConfig({
  test: { include: ["test/**/*.test.ts"] },
});
