import type { Page } from "@playwright/test";

type Request = { url: string; start: number };
type Tracker = { inflight: Map<string, Request>; lastActivity: number };
const trackers = new Map<Page, Tracker>();

async function attach(page: Page): Promise<void> {
  const client = await page.context().newCDPSession(page);
  const tracker: Tracker = { inflight: new Map(), lastActivity: Date.now() };
  trackers.set(page, tracker);

  await client.send("Network.enable");

  client.on("Network.requestWillBeSent", (event) => {
    if (event.type === "WebSocket" || event.type === "EventSource") return;
    tracker.inflight.set(event.requestId, { url: event.request.url, start: Date.now() });
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
      console.warn("Zeitaku: timed out.\n" + diagnose(page));
      return;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
}

// Explain what the network was doing right now: which requests are still open, and for how long
function diagnose(page: Page): string {
  const tracker = trackers.get(page);
  if (!tracker) return "Zeitaku: page was not attached";
  if (tracker.inflight.size === 0) return "Zeitaku: no requests were in flight (failure is probably not network timing)";

  const now = Date.now();
  const lines = [...tracker.inflight.values()].map(
    (r) => "  - " + r.url + "  (in flight for " + (now - r.start) + "ms)"
  );
  return "Zeitaku: " + tracker.inflight.size + " request(s) still in flight at failure:\n" + lines.join("\n");
}

export const __zeitaku = { attach, idle, diagnose };
