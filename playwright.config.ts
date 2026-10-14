import { defineConfig } from "@playwright/test";

// Browser tests only. Unit tests in test/ are run by Vitest; samples/ are input files, not tests.
export default defineConfig({
  testIgnore: ["test/**", "samples/**"],
});
