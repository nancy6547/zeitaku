import { chromium, Page } from "@playwright/test";
import { __zeitaku } from "../runtime/zeitaku";

const RUNS = 20;
const URL = "http://localhost:3000/dashboard";

type Mode = { name: string; wait: (page: Page) => Promise<void> };

const modes: Mode[] = [
  { name: "fixed 2s wait", wait: (page) => page.waitForTimeout(2000) },
  { name: "fixed 3s wait", wait: (page) => page.waitForTimeout(3000) },
  { name: "Zeitaku idle ", wait: (page) => __zeitaku.idle(page, 200) },
];

// Chrome DevTools' "Slow 3G" preset: ~2s latency, ~400 kbit/s
async function throttleSlow3G(page: Page): Promise<void> {
  const client = await page.context().newCDPSession(page);
  await client.send("Network.enable");
  await client.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 2000,
    downloadThroughput: (500 * 1024 * 0.8) / 8,
    uploadThroughput: (500 * 1024 * 0.8) / 8,
  });
}

async function main() {
  const browser = await chromium.launch();

  for (const network of ["normal", "slow 3G"]) {
    console.log("== network: " + network);
    for (const mode of modes) {
      let passed = 0;
      let totalMs = 0;

      for (let i = 0; i < RUNS; i++) {
        const page = await browser.newPage();
        if (network === "slow 3G") await throttleSlow3G(page);
        await __zeitaku.attach(page);

        const start = Date.now();
        await page.goto(URL);
        await mode.wait(page);
        const status = await page.textContent("#status");
        totalMs += Date.now() - start;

        if (status === "3 items") passed++;
        await page.close();
      }

      const avg = Math.round(totalMs / RUNS);
      const failRate = Math.round(((RUNS - passed) / RUNS) * 100);
      console.log("  " + mode.name + " | avg " + avg + "ms | failed " + failRate + "%");
    }
  }

  await browser.close();
}

main();
