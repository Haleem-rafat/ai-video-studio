import { after, before, test } from "node:test";
import assert from "node:assert/strict";

import puppeteer, { type Browser, type Page } from "puppeteer-core";

import { openParts } from "./parts.ts";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

// A page with everything a visitor has to open by hand: FAQ boxes, a button accordion,
// a menu that must stay shut, a press-and-hold reveal, and a slow embedded frame.
const PAGE = `<!doctype html><html><body style="margin:0">
<nav><button id="menu" aria-expanded="false" aria-controls="menuList">Menu</button><ul id="menuList" hidden><li>Home</li></ul></nav>
<main>
  <details id="q1"><summary>Is it therapy?</summary><p>No.</p></details>
  <details id="q2"><summary>How long?</summary><p>An hour.</p></details>
  <button id="acc" aria-expanded="false" aria-controls="accBody">Prices +</button>
  <div id="accBody" hidden>From 500</div>
  <button id="share" aria-expanded="false" aria-haspopup="menu" aria-controls="shareMenu">Share</button><div id="shareMenu" hidden>x</div>
  <section style="margin-top:1500px">
    <p id="line" style="opacity:0">The words that aren't said weigh on you.</p>
    <button id="hold" type="button"><span>اضغط مطوّل</span></button>
  </section>
  <iframe id="frame" style="margin-top:600px" srcdoc="<p id=x>loading</p><script>setTimeout(() => { document.getElementById('x').textContent = 'ready'; }, 10)</script>"></iframe>
</main>
<script>
  for (const button of document.querySelectorAll("[aria-controls]")) button.addEventListener("click", () => {
    const open = button.getAttribute("aria-expanded") === "true";
    button.setAttribute("aria-expanded", String(!open));
    document.getElementById(button.getAttribute("aria-controls")).hidden = open;
  });
  // Shows the line only after a 1.2 s press, like a real press-and-hold.
  let timer;
  const hold = document.getElementById("hold");
  hold.addEventListener("pointerdown", () => { timer = setTimeout(() => { document.getElementById("line").style.opacity = 1; }, 1200); });
  hold.addEventListener("pointerup", () => clearTimeout(timer));
</script>
</body></html>`;

let browser: Browser;
let page: Page;

before(async () => {
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.setContent(PAGE, { waitUntil: "load" });
});

after(() => browser?.close());

test("every closed part of the page is opened before recording, and the page ends where it started", async () => {
  const notes: string[] = [];
  const opened = await openParts(page, (message) => notes.push(message));
  const state = await page.evaluate(() => ({
    details: [...document.querySelectorAll("details")].map((d) => d.open),
    accordion: !document.getElementById("accBody")!.hidden,
    menu: !document.getElementById("menuList")!.hidden,
    popup: !document.getElementById("shareMenu")!.hidden,
    line: getComputedStyle(document.getElementById("line")!).opacity,
    scrollY,
  }));
  assert.deepEqual(state.details, [true, true], "FAQ answers are open");
  assert.equal(state.accordion, true, "the accordion is open");
  assert.equal(state.menu, false, "the navigation menu stays shut");
  assert.equal(state.popup, false, "pop-up menus stay shut");
  assert.equal(state.line, "1", "the press-and-hold line is revealed");
  assert.equal(state.scrollY, 0, "the recording still starts at the top");
  assert.deepEqual(opened, { details: 2, accordions: 1, holds: 1 });
  assert.match(notes.join("\n"), /2 FAQ answers.*1 section.*1 press-and-hold/s);
});

test("embedded frames have finished loading when it returns", async () => {
  const frame = page.frames().find((f) => f !== page.mainFrame())!;
  assert.equal(await frame.evaluate(() => document.readyState), "complete");
});
