import type { Page } from "@playwright/test";

type Tracker = { inflight: Set<string>; lastActivity: number };
const trackers = new Map<Page, Tracker>();

async function attach(page: Page): Promise<void> {
  const client = await page.context().newCDPSession(page);
  const tracker: Tracker = { inflight: new Set(), lastActivity: Date.now() };
  trackers.set(page, tracker);

  await client.send("Network.enable");

  client.on("Network.requestWillBeSent", (event) => {
    if (event.type === "WebSocket" || event.type === "EventSource") return;
    
    tracker.inflight.add(event.requestId);
    tracker.lastActivity = Date.now();
  });

  const done = (event: { requestId: string }) => {
    tracker.inflight.delete(event.requestId);
    tracker.lastActivity = Date.now();
  };
  client.on("Network.loadingFinished", done);
  client.on("Network.loadingFailed", done);
}

async function idle(page: Page, quietMs = 500, timeoutMs = 10000): Promise<void> {
  const tracker = trackers.get(page);
  if (!tracker) throw new Error("Zeitaku: call __zeitaku.attach(page) first");

  const start = Date.now();
  while (true) {
    const quietFor = Date.now() - tracker.lastActivity;
    if (tracker.inflight.size === 0 && quietFor >= quietMs) return;
    if (Date.now() - start > timeoutMs) {
      console.warn("Zeitaku: timed out with " + tracker.inflight.size + " requests still open");
      return;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
}

export const __zeitaku = { attach, idle };
