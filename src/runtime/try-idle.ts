import { chromium } from "@playwright/test";
import { __zeitaku } from "./zeitaku";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await __zeitaku.attach(page);

  await page.goto("http://localhost:3000");
  console.log("Right after goto:  " + (await page.textContent("#status")));

  const start = Date.now();
  await __zeitaku.idle(page);
  console.log("After Zeitaku idle: " + (await page.textContent("#status")) + "  (waited " + (Date.now() - start) + "ms)");

  await browser.close();
}

main();
