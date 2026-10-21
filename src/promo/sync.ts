import type { Page } from "puppeteer-core";

/** A heading or section, by what it says (or its id), and how far down its page it starts. */
export type Anchor = { key: string; top: number };

/** The page's headings and sections, top to bottom, measured where they sit before any scrolling. */
export async function anchorsOf(page: Page): Promise<{ anchors: Anchor[]; max: number }> {
  return page.evaluate(() => {
    const anchors: { key: string; top: number }[] = [];
    const seen = new Set<string>();
    for (const element of document.querySelectorAll<HTMLElement>("h1, h2, h3, section[id], footer")) {
      const box = element.getBoundingClientRect();
      if (!box.height || !box.width || getComputedStyle(element).visibility === "hidden") continue;
      const text = (element.matches("h1, h2, h3") ? element.innerText : "").replace(/\s+/g, " ").trim().slice(0, 60);
      const key = text ? `${element.tagName}:${text}` : element.id ? `#${element.id}` : element.tagName;
      if (seen.has(key)) continue;
      seen.add(key);
      anchors.push({ key, top: Math.round(box.top + window.scrollY) });
    }
    return { anchors, max: Math.max(0, document.documentElement.scrollHeight - window.innerHeight) };
  });
}

/**
 * Pairs the laptop's and the phone's scroll positions at the headings both
 * pages have: the longest run that goes down both pages together (headings
 * stacked out of order, or on one page only, are left out), from the top to
 * the bottom of each page.
 */
export function matchAnchors(desktop: Anchor[], phone: Anchor[], desktopMax: number, phoneMax: number): [number, number][] {
  const onPhone = new Map(phone.map((anchor) => [anchor.key, anchor.top]));
  const both = desktop
    .filter((anchor) => onPhone.has(anchor.key))
    .map((anchor) => [anchor.top, onPhone.get(anchor.key)!] as [number, number])
    .filter(([d, p]) => d > 0 && p > 0 && d < desktopMax && p < phoneMax)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  // Longest chain going down both pages (n is small: a page has tens of headings).
  const best = both.map(() => 1);
  const from = both.map(() => -1);
  for (let i = 0; i < both.length; i++)
    for (let j = 0; j < i; j++)
      if (both[j][0] < both[i][0] && both[j][1] < both[i][1] && best[j] + 1 > best[i]) {
        best[i] = best[j] + 1;
        from[i] = j;
      }
  const chain: [number, number][] = [];
  for (let i = best.length ? best.indexOf(Math.max(...best)) : -1; i >= 0; i = from[i]) chain.unshift(both[i]);

  const pairs: [number, number][] = [[0, 0], ...chain];
  if (desktopMax > 0 || phoneMax > 0) pairs.push([desktopMax, phoneMax]);
  return pairs;
}

export type SyncPlan = {
  seconds: number;
  /** Where each paired place falls in the scroll, 0 to 1 (shared by both screens). */
  at: number[];
  desktop: number[];
  phone: number[];
};

/**
 * When each screen reaches each paired place: every stretch takes as long as
 * the screen with more to scroll needs at `speed` px/s, so neither rushes. A
 * plan longer than `cap` seconds stops both screens at the same place part way.
 */
export function syncPlan(pairs: [number, number][], { speed, cap }: { speed: number; cap: number }): SyncPlan {
  const times = [0];
  for (let i = 1; i < pairs.length; i++) times.push(times[i - 1] + Math.max(pairs[i][0] - pairs[i - 1][0], pairs[i][1] - pairs[i - 1][1]) / speed);
  let total = times.at(-1)!;
  if (total <= 0) return { seconds: 3, at: [0, 1], desktop: [0, 0], phone: [0, 0] };

  let kept = pairs.map(([d, p]) => [d, p]);
  let keptTimes = times;
  if (total > cap) {
    const i = times.findIndex((time) => time > cap);
    const share = (cap - times[i - 1]) / (times[i] - times[i - 1]);
    const cut = [0, 1].map((k) => pairs[i - 1][k] + share * (pairs[i][k] - pairs[i - 1][k]));
    kept = [...kept.slice(0, i), cut];
    keptTimes = [...times.slice(0, i), cap];
    total = cap;
  }
  return {
    seconds: Math.max(3, total),
    at: keptTimes.map((time) => time / total),
    desktop: kept.map(([d]) => d),
    phone: kept.map(([, p]) => p),
  };
}

/**
 * The scroll position `u` (0 to 1) of the way through a plan: a smooth curve
 * through every paired place that never goes back up (monotone cubic, PCHIP).
 * Self-contained: the recorder runs this same function inside the page.
 */
export function positionAt(ys: number[], at: number[], u: number): number {
  const n = ys.length;
  if (n === 1) return ys[0];
  if (u <= at[0]) return ys[0];
  if (u >= at[n - 1]) return ys[n - 1];
  let k = 0;
  while (k < n - 2 && u >= at[k + 1]) k++;
  const h = (i: number) => at[i + 1] - at[i];
  const slope = (i: number) => (ys[i + 1] - ys[i]) / h(i);
  const tangent = (i: number) => {
    if (i === 0) return slope(0);
    if (i === n - 1) return slope(n - 2);
    const a = slope(i - 1);
    const b = slope(i);
    if (a <= 0 || b <= 0) return 0;
    const w1 = 2 * h(i) + h(i - 1);
    const w2 = h(i) + 2 * h(i - 1);
    return (w1 + w2) / (w1 / a + w2 / b);
  };
  const t = (u - at[k]) / h(k);
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * ys[k] + (t3 - 2 * t2 + t) * h(k) * tangent(k) + (-2 * t3 + 3 * t2) * ys[k + 1] + (t3 - t2) * h(k) * tangent(k + 1);
}
