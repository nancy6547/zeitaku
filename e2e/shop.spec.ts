import { test, expect } from "@playwright/test";
import { __zeitaku } from "../src/runtime/zeitaku";
test.beforeEach(async ({ page }) => { await __zeitaku.attach(page); });

test("shop shows 3 items", async ({ page }) => {
  await page.goto("http://localhost:3000");
  await __zeitaku.idle(page);
  const status = await page.textContent("#status");
  expect(status).toBe("3 items");
});