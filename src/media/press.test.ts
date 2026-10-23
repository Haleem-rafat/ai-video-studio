import { test } from "node:test";
import assert from "node:assert/strict";

import { appleSlug, articleImages, clipFolders, newsroomArticles } from "./press.ts";

test("Apple products map to their apple.com page; other makers get none", () => {
  assert.equal(appleSlug("iPhone 18 Pro"), "iphone-18-pro");
  assert.equal(appleSlug("Apple iPhone Duo"), "iphone-duo");
  assert.equal(appleSlug("MacBook Pro 14 M5 Pro"), "macbook-pro-14-m5-pro");
  assert.equal(appleSlug("Galaxy Z Fold 8"), null);
});

test("the page's clip folders, the newsroom's articles and an article's photos are read once each, at the largest size", () => {
  const page = `<div data-inline-media-basepath="/105/media/us/iphone-duo/2026/x/anim/hero/"></div><div data-inline-media-basepath="/105/media/us/iphone-duo/2026/x/anim/hero/"></div><div data-inline-media-basepath="/105/media/us/iphone-duo/2026/x/anim/display/"></div>`;
  assert.deepEqual(clipFolders(page), ["/105/media/us/iphone-duo/2026/x/anim/hero/", "/105/media/us/iphone-duo/2026/x/anim/display/"]);
  const rss = `<link href="https://www.apple.com/newsroom/2026/10/open-up-to-new-possibilities-with-iphone-duo/" /><link href="https://www.apple.com/newsroom/2026/10/apple-tv/" />`;
  assert.deepEqual(newsroomArticles(rss, "iphone-duo"), ["https://www.apple.com/newsroom/2026/10/open-up-to-new-possibilities-with-iphone-duo/"]);
  const article = `src="/newsroom/images/2026/10/x/article/Apple-iPhone-Duo-closed-and-open_big.jpg.medium_2x.jpg" srcset="/newsroom/images/2026/10/x/article/Apple-iPhone-Duo-closed-and-open_big.jpg.large_2x.jpg" "/newsroom/images/2026/10/x/article/Apple-iPhone-Duo-StandBy_big.jpg.jpg" "/newsroom/images/2026/10/x/tile/Apple-iPhone-Duo-hero-lp.jpg.og.jpg"`;
  assert.deepEqual(articleImages(article), ["/newsroom/images/2026/10/x/article/Apple-iPhone-Duo-closed-and-open_big.jpg.large_2x.jpg", "/newsroom/images/2026/10/x/article/Apple-iPhone-Duo-StandBy_big.jpg.large_2x.jpg"]);
});

test("the product picture comes from the clips that end on the product, colours first", async () => {
  const { productClipRank } = await import("./press.ts");
  const names = ["hero", "highlights-display", "highlights-colors", "timelapse", undefined, "design"];
  assert.deepEqual([...names].sort((x, y) => productClipRank(x) - productClipRank(y)).slice(0, 3), ["highlights-colors", "highlights-display", "design"]);
  assert.equal(productClipRank("timelapse"), productClipRank(undefined));
});
