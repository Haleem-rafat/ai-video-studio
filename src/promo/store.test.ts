import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.PROMOS_DIR = await mkdtemp(join(tmpdir(), "promos-"));
const { listPromos, loadPromo, promoIdFor, promoOptions, savePromo, siteUrl, startPromo } = await import("./store.ts");
const { DEFAULT_OPTIONS } = await import("./record.ts");

test("a promo id carries the time and the site, so promos of one site never collide", () => {
  const at = new Date(2026, 9, 20, 23, 5);
  assert.equal(promoIdFor("https://www.HythamSalah.risero.io/about", at), "202610202305-hythamsalah-risero-io");
  assert.equal(promoIdFor("hythamsalah.risero.io", at), "202610202305-hythamsalah-risero-io");
});

test("a typed address becomes a web address; anything that isn't one is refused", () => {
  assert.equal(siteUrl("hythamsalah.risero.io"), "https://hythamsalah.risero.io/");
  assert.equal(siteUrl(" http://a.example.com/x "), "http://a.example.com/x");
  assert.throws(() => siteUrl("not a site"), /"not a site" is not a website address/);
  assert.throws(() => siteUrl("file:///etc/passwd"));
  assert.throws(() => siteUrl(""));
});

test("promos are saved and listed newest first", async () => {
  const base = { url: "https://a.example.com/", host: "a.example.com", title: "A", status: "done" as const, seconds: 19.4, videos: { "16x9": "promo-16x9.mp4", "9x16": "promo-9x16.mp4" } };
  await savePromo({ ...base, id: "202610200900-a-example-com", createdAt: "2026-10-20T09:00:00.000Z" });
  await savePromo({ ...base, id: "202610201000-a-example-com", createdAt: "2026-10-20T10:00:00.000Z" });
  const list = await listPromos();
  assert.deepEqual(
    list.map((promo) => promo.id),
    ["202610201000-a-example-com", "202610200900-a-example-com"],
  );
  assert.equal((await loadPromo("202610200900-a-example-com")).seconds, 19.4);
});

test("speed and length from the app are checked; anything missing or unknown falls back to the defaults", () => {
  assert.deepEqual(promoOptions({ speed: "fast", length: 30 }), { speed: "fast", length: 30 });
  assert.deepEqual(promoOptions({ speed: "normal", length: "page" }), { speed: "normal", length: "page" });
  assert.deepEqual(promoOptions({}), DEFAULT_OPTIONS);
  assert.deepEqual(promoOptions({ speed: "warp", length: 999 }), DEFAULT_OPTIONS);
  assert.deepEqual(promoOptions(undefined), DEFAULT_OPTIONS);
});

test("a new promo remembers its speed and length, so it can be recorded again the same way", async () => {
  const promo = await startPromo("https://b.example.com", { speed: "normal", length: 60 });
  assert.deepEqual((await loadPromo(promo.id)).options, { speed: "normal", length: 60 });
});
