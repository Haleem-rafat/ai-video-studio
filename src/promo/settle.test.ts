import { test } from "node:test";
import assert from "node:assert/strict";

import { NetworkWatch } from "./settle.ts";

test("a page is settled only when nothing is downloading and no bytes have arrived for a while", () => {
  const watch = new NetworkWatch(1500);
  assert.equal(watch.settled(0), true, "a page that never downloads anything is settled");

  watch.started("video", "Fetch", 100);
  assert.equal(watch.settled(5000), false, "a download in flight keeps it busy");
  watch.received(5000);
  watch.finished("video", 6000);
  assert.equal(watch.settled(6500), false, "just finished: not quiet long enough");
  assert.equal(watch.settled(7600), true);
});

test("a streamed download that trickles in counts as busy, however long it takes", () => {
  const watch = new NetworkWatch(1500);
  watch.started("hero", "Fetch", 0);
  for (let t = 0; t < 50000; t += 1000) {
    watch.received(t);
    assert.equal(watch.settled(t + 500), false);
  }
});

test("connections that never end (live updates, sockets) don't keep the page busy forever", () => {
  const watch = new NetworkWatch(1500);
  watch.started("live", "EventSource", 0);
  watch.started("socket", "WebSocket", 0);
  assert.equal(watch.settled(2000), true);
  assert.equal(watch.pending(), 0);
});

test("a failed download ends like a finished one", () => {
  const watch = new NetworkWatch(1000);
  watch.started("a", "Image", 0);
  watch.finished("a", 300);
  assert.equal(watch.settled(1400), true);
});
