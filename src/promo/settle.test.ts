import { test } from "node:test";
import assert from "node:assert/strict";

import { NetworkWatch, offline, whenOnline } from "./settle.ts";

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

test("only connection drops are worth waiting out; a wrong address or a broken site is not", () => {
  for (const code of ["ERR_INTERNET_DISCONNECTED", "ERR_NETWORK_CHANGED", "ERR_NAME_NOT_RESOLVED", "ERR_CONNECTION_RESET", "ERR_CONNECTION_TIMED_OUT", "ERR_TIMED_OUT", "ERR_ADDRESS_UNREACHABLE"]) {
    assert.equal(offline(new Error(`net::${code} at https://a.example.com/`)), true, code);
  }
  assert.equal(offline(new Error("net::ERR_CERT_DATE_INVALID at https://a.example.com/")), false);
  assert.equal(offline(new Error("Navigation timeout of 60000 ms exceeded")), false);
  assert.equal(offline("nope"), false);
});

test("a connection drop is retried until the internet is back; other errors fail at once", async () => {
  const notes: string[] = [];
  let calls = 0;
  const value = await whenOnline(
    async () => {
      calls++;
      if (calls < 3) throw new Error("net::ERR_INTERNET_DISCONNECTED at https://a.example.com/");
      return "opened";
    },
    (message) => notes.push(message),
    { every: 1, upTo: 1000 },
  );
  assert.equal(value, "opened");
  assert.equal(calls, 3);
  assert.match(notes[0], /internet/i);

  let tries = 0;
  await assert.rejects(
    () =>
      whenOnline(
        async () => {
          tries++;
          throw new Error("net::ERR_CERT_DATE_INVALID");
        },
        () => {},
        { every: 1, upTo: 1000 },
      ),
    /CERT/,
  );
  assert.equal(tries, 1);

  // It gives up once the time is up, with the network error.
  await assert.rejects(
    () =>
      whenOnline(
        async () => {
          throw new Error("net::ERR_NETWORK_CHANGED");
        },
        () => {},
        { every: 1, upTo: 20 },
      ),
    /NETWORK_CHANGED/,
  );
});
