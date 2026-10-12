import { chromium, Page } from "@playwright/test";
import { __zeitaku } from "../runtime/zeitaku";

const RUNS = 50;

type Mode = { name: string; wait: (page: Page) => Promise<void> };

const modes: Mode[] = [
  { name: "fixed 2s wait", wait: (page) => page.waitForTimeout(2000) },
  { name: "fixed 3s wait", wait: (page) => page.waitForTimeout(3000) },
  { name: "Zeitaku idle ", wait: (page) => __zeitaku.idle(page, 200) },
];

async function main() {
  const browser = await chromium.launch();

  for (const mode of modes) {
    let passed = 0;
    let totalMs = 0;

    for (let i = 0; i < RUNS; i++) {
      const page = await browser.newPage();
      await __zeitaku.attach(page);

      const start = Date.now();
      await page.goto("http://localhost:3000");
      await mode.wait(page);
      const status = await page.textContent("#status");
      totalMs += Date.now() - start;

      if (status === "3 items") passed++;
      await page.close();
    }

    const avg = Math.round(totalMs / RUNS);
    const failRate = Math.round(((RUNS - passed) / RUNS) * 100);
    console.log(mode.name + " | avg " + avg + "ms | failed " + failRate + "%");
  }

  await browser.close();
}

main();
