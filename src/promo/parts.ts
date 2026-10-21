import type { Page } from "puppeteer-core";

/** Labels of press-and-hold buttons: content that appears only while a visitor keeps pressing. */
const HOLD = /اضغط\s*(مطوّ?ل|باستمرار|واستمر|وا?ثبت)|press\s*(and|&)\s*hold|hold\s+to\b|long[\s-]?press|tap\s*(and|&)\s*hold/i;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type Opened = { details: number; accordions: number; holds: number };

/**
 * Opens what a visitor would open by hand, so the recording shows it: FAQ
 * boxes (<details>), accordion buttons (never menus or pop-ups), and
 * press-and-hold reveals; then waits for embedded frames (a booking
 * calendar, a map) to finish loading. The page is left at the top.
 */
export async function openParts(page: Page, log: (message: string) => void, holdMs = 2600): Promise<Opened> {
  const { details, accordions } = await page.evaluate(() => {
    // Navigation, menus and dialogs stay as a first visit shows them.
    const chrome = "nav, header, [role=navigation], [role=menubar], [role=menu], [role=dialog], dialog";
    let details = 0;
    for (const box of document.querySelectorAll("details")) {
      if (box.open || box.closest(chrome)) continue;
      box.open = true;
      details++;
    }
    let accordions = 0;
    for (const toggle of document.querySelectorAll<HTMLElement>("[aria-expanded=false][aria-controls]")) {
      if (toggle.closest(chrome) || toggle.hasAttribute("aria-haspopup")) continue;
      if (toggle instanceof HTMLAnchorElement && !(toggle.getAttribute("href") ?? "").startsWith("#")) continue;
      if (!document.getElementById(toggle.getAttribute("aria-controls")!)) continue;
      toggle.click();
      if (toggle.getAttribute("aria-expanded") === "true") accordions++;
    }
    return { details, accordions };
  });

  // A press-and-hold needs a real, held press: a click would let go at once.
  let holds = 0;
  const buttons = await page.$$("button, [role=button]");
  for (const button of buttons) {
    const label = await button.evaluate((element) => (element as HTMLElement).innerText || element.getAttribute("aria-label") || "");
    if (!HOLD.test(label)) continue;
    await button.evaluate((element) => element.scrollIntoView({ block: "center", behavior: "instant" }));
    await wait(300);
    const box = await button.boundingBox();
    if (!box) continue;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await wait(holdMs);
    await page.mouse.up();
    holds++;
  }
  await Promise.all(buttons.map((button) => button.dispose()));
  await page.evaluate(() => window.scrollTo(0, 0));

  // Embedded frames load on their own; their downloads don't show on the page's network.
  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue;
    await frame.waitForFunction(() => document.readyState === "complete", { timeout: 20000, polling: 250 }).catch(() => {});
  }
  await page.waitForNetworkIdle({ idleTime: 1000, timeout: 15000 }).catch(() => {});

  const parts = [details && `${details} FAQ answer${details > 1 ? "s" : ""}`, accordions && `${accordions} section${accordions > 1 ? "s" : ""}`, holds && `${holds} press-and-hold${holds > 1 ? "s" : ""}`].filter(Boolean);
  if (parts.length) log(`promo: opened ${parts.join(", ")} so the recording shows them`);
  return { details, accordions, holds };
}
