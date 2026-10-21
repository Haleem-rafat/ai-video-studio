import type { Page } from "puppeteer-core";

/** Connections that stay open for the life of a page: they never "finish", so they can't count as loading. */
const ENDLESS = new Set(["EventSource", "WebSocket"]);

/**
 * Whether a page is still downloading, from its network events: a request in
 * flight, or bytes that arrived within the last `quietMs`. A streamed download
 * (a site fetching its hero video behind a loading ring) stays busy for as
 * long as it trickles in, which "network idle" checks miss.
 */
export class NetworkWatch {
  private inFlight = new Set<string>();
  private lastActivity = -Infinity;
  private quietMs: number;

  constructor(quietMs: number) {
    this.quietMs = quietMs;
  }

  started(id: string, type: string, now: number): void {
    if (ENDLESS.has(type)) return;
    this.inFlight.add(id);
    this.lastActivity = now;
  }

  received(now: number): void {
    this.lastActivity = now;
  }

  finished(id: string, now: number): void {
    this.inFlight.delete(id);
    this.lastActivity = now;
  }

  pending(): number {
    return this.inFlight.size;
  }

  settled(now: number): boolean {
    return this.inFlight.size === 0 && now - this.lastActivity >= this.quietMs;
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type PageNetwork = {
  /**
   * Waits until the page has finished downloading (at most `maxMs`), then until
   * its videos can play, so a recording never shows a site's loading state.
   */
  settled: (log: (message: string) => void, maxMs?: number) => Promise<void>;
  stop: () => Promise<void>;
};

/** Watches a page's downloads; start it before the page opens so nothing is missed. */
export async function watchNetwork(page: Page): Promise<PageNetwork> {
  const session = await page.createCDPSession();
  const watch = new NetworkWatch(1500);
  let bytes = 0;
  session.on("Network.requestWillBeSent", (event) => watch.started(event.requestId, event.type ?? "Other", Date.now()));
  session.on("Network.dataReceived", (event) => {
    bytes += event.dataLength;
    watch.received(Date.now());
  });
  session.on("Network.loadingFinished", (event) => watch.finished(event.requestId, Date.now()));
  session.on("Network.loadingFailed", (event) => watch.finished(event.requestId, Date.now()));
  await session.send("Network.enable");

  return {
    async settled(log, maxMs = 90000) {
      const start = Date.now();
      let told = start;
      while (!watch.settled(Date.now())) {
        if (Date.now() - start > maxMs) {
          log(`promo: the page was still loading after ${Math.round(maxMs / 1000)}s; recording anyway`);
          return;
        }
        if (Date.now() - told > 8000) {
          told = Date.now();
          log(`promo: waiting for the page to finish loading its videos and pictures (${(bytes / 1e6).toFixed(1)} MB so far) ...`);
        }
        await wait(250);
      }
      // A downloaded video still needs a moment before it can show frames.
      await page
        .waitForFunction(() => [...document.querySelectorAll("video")].every((video) => !video.currentSrc || video.readyState >= 3), { timeout: 15000, polling: 250 })
        .catch(() => log("promo: a video on the page never became ready; recording anyway"));
    },
    stop: () => session.detach().catch(() => {}),
  };
}

/** Chrome's errors for a connection that is down or changing, which come back on their own. */
const OFFLINE = /net::ERR_(INTERNET_DISCONNECTED|NETWORK_CHANGED|NAME_NOT_RESOLVED|CONNECTION_(RESET|TIMED_OUT|CLOSED|REFUSED|ABORTED)|TIMED_OUT|ADDRESS_UNREACHABLE|NETWORK_IO_SUSPENDED|PROXY_CONNECTION_FAILED)\b/;

/** Whether an error is the Mac's internet dropping (worth waiting out), not a problem with the site. */
export function offline(error: unknown): boolean {
  return error instanceof Error && OFFLINE.test(error.message);
}

/**
 * Runs `work`, and while it fails because the internet is down, tries again
 * every `every` ms for up to `upTo` ms. Any other error fails at once.
 */
export async function whenOnline<T>(work: () => Promise<T>, log: (message: string) => void, { every = 5000, upTo = 120000 } = {}): Promise<T> {
  const start = Date.now();
  for (;;) {
    try {
      return await work();
    } catch (error) {
      if (!offline(error) || Date.now() - start >= upTo) throw error;
      log(`promo: no internet connection (${(error as Error).message.match(/ERR_\w+/)?.[0]}); trying again in ${Math.round(every / 1000)}s ...`);
      await wait(every);
    }
  }
}
