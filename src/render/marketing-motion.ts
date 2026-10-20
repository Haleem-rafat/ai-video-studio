import { alignWords } from "./align.ts";
import { ARABIC } from "./arena.ts";
import { postPictures, socialBadge, bdi, esc, iconByWord, ICONS, itemTimes, r, saidAt, seeded, type Beat, type Box, type Ctx, type MarketingScene } from "./marketing-kit.ts";

/**
 * The motion-graphics beats of a marketing video: no screenshots, only the
 * brand's colours (the CSS variables), its fonts and its logo. A creative or
 * bold video is made mostly of these. Each returns its HTML and the GSAP
 * lines that animate it, timed from the scene's start (t) and length (D).
 */

/** When each word of a sentence is said, from the narration's word timings. */
function wordTimes(s: MarketingScene, words: string[]): number[] {
  const said = s.narration.split(/\s+/).filter(Boolean);
  const times = alignWords(said, s.audio?.words ?? [], s.seconds);
  const result: number[] = [];
  let from = 0;
  words.forEach((word, i) => {
    const found = saidAt(s, word, times, said, from);
    const index = found === null ? -1 : times.indexOf(found, from);
    if (index >= 0) from = index + 1;
    const fallback = 0.15 + (i * Math.min(0.35, (s.seconds * 0.6) / Math.max(1, words.length)));
    result.push(r(Math.min(s.seconds - 0.4, Math.max(i ? result[i - 1] + 0.1 : 0.05, (found ?? fallback) - 0.08))));
  });
  return result;
}

/**
 * Kinetic typography: the narration itself, a few words at a time, punched
 * in as they are spoken; each phrase slides away for the next, and the key
 * words (the scene's items, or the headline's last word) get a highlight bar.
 */
function kinetic({ s, k, B, brand }: Ctx): Beat {
  const said = s.narration.split(/\s+/).filter(Boolean);
  const times = alignWords(said, s.audio?.words ?? [], s.seconds);
  const clean = (word: string) => word.replace(/[^\p{L}\p{N}]/gu, "");
  const hot = new Set([...s.visual.items.map((item) => clean(item.label)), clean(s.visual.headline.split(/\s+/).at(-1) ?? "")].filter(Boolean));
  // Phrases of up to 4 words, broken after punctuation.
  const phrases: { words: string[]; at: number[] }[] = [];
  let current: { words: string[]; at: number[] } = { words: [], at: [] };
  said.forEach((word, i) => {
    current.words.push(word);
    current.at.push(r(Math.max(0, times[i] - 0.06)));
    if (current.words.length >= 4 || (/[.,،؟?!…:]$/.test(word) && current.words.length >= 2)) {
      phrases.push(current);
      current = { words: [], at: [] };
    }
  });
  if (current.words.length) phrases.push(current);
  const size = B.short ? 128 : 136;
  const html = `${phrases
    .map(
      (phrase, j) =>
        `<div class="kin" id="kp${k}_${j}" style="font-size:${phrase.words.join(" ").length > 22 ? size * 0.8 : size}px">${phrase.words
          .map((word, i) => {
            const isHot = hot.has(clean(word));
            return `<span class="kw${isHot ? " hot" : ""}"${ARABIC.test(word) ? "" : ' dir="ltr"'}><span class="kwi" id="kw${k}_${j}_${i}">${esc(word)}</span>${isHot ? `<i class="hl" id="hl${k}_${j}_${i}"></i>` : ""}</span>`;
          })
          .join(" ")}</div>`,
    )
    .join("")}`;
  const js = `{
  const t = ${s.start}, D = ${r(s.seconds)}, P = ${JSON.stringify(phrases.map((phrase) => phrase.at))};
  P.forEach((at, j) => {
    const box = '#kp${k}_' + j;
    tl.set(box, { opacity: 1 }, t + at[0] - .02);
    at.forEach((when, i) => {
      const id = '#kw${k}_' + j + '_' + i, kind = (i + j) % 3;
      if (kind === 0) tl.fromTo(id, { yPercent: 110, opacity: 1 }, { yPercent: 0, duration: .35, ease: 'power4.out', immediateRender: false }, t + when);
      else if (kind === 1) tl.fromTo(id, { scale: 1.7, opacity: 0, filter: 'blur(8px)' }, { scale: 1, opacity: 1, filter: 'blur(0px)', duration: .3, ease: 'power3.out', immediateRender: false }, t + when);
      else tl.fromTo(id, { x: ${B.dir * -90}, opacity: 0 }, { x: 0, opacity: 1, duration: .35, ease: 'back.out(1.8)', immediateRender: false }, t + when);
      const hl = document.querySelector('#hl${k}_' + j + '_' + i);
      if (hl) {
        tl.fromTo(hl, { scaleX: 0 }, { scaleX: 1, duration: .35, ease: 'power2.inOut', immediateRender: false }, t + when + .2);
        tl.to(id, { color: BG, duration: .15 }, t + when + .32);
      }
    });
    // The phrase holds until the next one starts, then slides up and away.
    if (j < P.length - 1) tl.to(box, { yPercent: -60, opacity: 0, duration: .25, ease: 'power2.in' }, t + P[j + 1][0] - .22);
    tl.fromTo(box, { scale: .96 }, { scale: 1.03, duration: Math.max(.5, (j < P.length - 1 ? P[j + 1][0] : D) - at[0]), ease: 'none', immediateRender: false }, t + at[0]);
  });
}`;
  return { html, js };
}

/** Chaos to order: scattered pieces drift, then fly into one neat card. */
function chaos({ s, k, B, brand, arabic }: Ctx): Beat {
  const items = s.visual.items.slice(0, 7);
  const rnd = seeded(k + 3);
  const cx = B.W / 2;
  const cy = B.stageH / 2;
  const cardW = B.short ? 760 : 820;
  const pieces = items.map((item, i) => {
    // Around the edges of the stage, never over the card in the middle.
    const angle = (i / Math.max(1, items.length)) * Math.PI * 2 + rnd() * 0.6;
    const rx = (B.short ? 0.36 : 0.38) * B.W;
    const ry = (B.short ? 0.4 : 0.36) * B.stageH;
    const x = cx + Math.cos(angle) * rx - 150;
    const y = cy + Math.sin(angle) * ry - 40;
    return { item, x: r(x), y: r(y), rot: r((rnd() - 0.5) * 24), dx: r(cx - (x + 150)), dy: r(cy - (y + 40)) };
  });
  const html = `${pieces
    .map(({ item, x, y, rot }, i) => `<div class="piece" id="pz${k}_${i}" style="left:${x}px;top:${y}px;transform:rotate(${rot}deg)"><span class="pic">${iconByWord(item.value)}</span>${bdi(item.label)}</div>`)
    .join("")}
  <div class="order" id="or${k}" style="left:${cx - cardW / 2}px;top:${cy - 190}px;width:${cardW}px">
    <div class="ohead">${brand.logo ? `<img src="${brand.logo}" />` : ""}<b>${esc(brand.name)}</b><span class="ock">${ICONS.check}</span></div>
    <div class="otitle">${bdi(arabic ? "كله في مكان واحد" : "All in one place")}</div>
    <div class="olines"><i></i><i></i><i></i></div>
  </div>`;
  const js = `{
  const t = ${s.start}, D = ${r(s.seconds)}, P = ${JSON.stringify(pieces.map(({ dx, dy, rot }) => [dx, dy, rot]))};
  let seed = ${k + 5}; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const gather = t + D * .58;
  P.forEach(([dx, dy, rot], i) => {
    const id = '#pz${k}_' + i;
    tl.fromTo(id, { opacity: 0, scale: .3 }, { opacity: 1, scale: 1, duration: .35, ease: 'back.out(2.2)', immediateRender: false }, t + .1 + i * Math.min(.35, D * .3 / P.length));
    for (let at = t + .5 + i * .1, n = 0; at < gather - .6; at += .7, n++) tl.to(id, { x: (rnd() - .5) * 60, y: (rnd() - .5) * 50, rotation: rot + (rnd() - .5) * 16, duration: .7, ease: 'sine.inOut' }, at);
    tl.to(id, { x: dx, y: dy, rotation: 0, scale: .25, opacity: 0, duration: .55, ease: 'power3.in' }, gather + i * .05);
  });
  tl.fromTo('#or${k}', { opacity: 0, scale: .6, rotation: -4 }, { opacity: 1, scale: 1, rotation: 0, duration: .6, ease: 'back.out(1.6)', immediateRender: false }, gather + .45);
  tl.fromTo('#or${k} .olines i', { scaleX: 0 }, { scaleX: 1, duration: .4, stagger: .12, ease: 'power2.out', immediateRender: false }, gather + .8);
  tl.fromTo('#or${k} .ock', { scale: 0 }, { scale: 1, duration: .45, ease: 'back.out(3)', immediateRender: false }, gather + 1.1);
}`;
  return { html, js };
}

/** A path: a dot travels through stations that light up as it reaches them. */
function path({ s, k, B, arabic }: Ctx): Beat {
  const items = s.visual.items.slice(0, 5);
  const n = Math.max(2, items.length);
  const margin = B.short ? 170 : 180;
  // A zig-zag through the stage, in reading order.
  const points = items.map((_, i) => {
    if (B.short) {
      const y = 110 + (i * (B.stageH - 260)) / (n - 1);
      const x = i % 2 === 0 ? B.W * 0.3 : B.W * 0.7;
      return { x: r(arabic ? B.W - x : x), y: r(y) };
    }
    const x = margin + (i * (B.W - margin * 2)) / (n - 1);
    const y = i % 2 === 0 ? B.stageH * 0.38 : B.stageH * 0.62;
    return { x: r(arabic ? B.W - x : x), y: r(y) };
  });
  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
  const total = lengths.reduce((sum, length) => sum + length, 0) || 1;
  const reach = points.map((_, i) => r(lengths.slice(0, i).reduce((sum, length) => sum + length, 0) / total));
  const times = itemTimes(s, 0.1, 0.8);
  const d = points.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ");
  const html = `<svg class="pathsvg" viewBox="0 0 ${B.W} ${B.stageH}" width="${B.W}" height="${B.stageH}">
    <path d="${d}" class="ptrack" />
    <path d="${d}" class="pdraw" id="pd${k}" pathLength="1" />
  </svg>
  <i class="pdot" id="pdt${k}" style="left:${points[0]?.x ?? 0}px;top:${points[0]?.y ?? 0}px"></i>
  ${items
    .map(
      (item, i) =>
        `<div class="station" id="st${k}_${i}" style="left:${points[i].x}px;top:${points[i].y}px"><span class="sic">${iconByWord(item.value)}</span><span class="slb ${B.short || i % 2 === 1 ? "below" : "above"}">${bdi(item.label)}</span></div>`,
    )
    .join("")}`;
  const js = `{
  const t = ${s.start}, D = ${r(s.seconds)}, T = ${JSON.stringify(times)}, P = ${JSON.stringify(points)}, R = ${JSON.stringify(reach)};
  tl.fromTo('#pdt${k}', { opacity: 0, scale: 0 }, { opacity: 1, scale: 1, duration: .3, immediateRender: false }, t + Math.max(0, T[0] - .3));
  T.forEach((at, i) => {
    if (i > 0) {
      tl.to('#pdt${k}', { x: P[i].x - P[0].x, y: P[i].y - P[0].y, duration: Math.max(.35, at - T[i - 1] - .1), ease: 'power1.inOut' }, t + T[i - 1] + .1);
      tl.to('#pd${k}', { strokeDashoffset: 1 - R[i], duration: Math.max(.35, at - T[i - 1] - .1), ease: 'power1.inOut' }, t + T[i - 1] + .1);
    }
    tl.fromTo('#st${k}_' + i, { scale: .5, opacity: .25 }, { scale: 1, opacity: 1, duration: .45, ease: 'back.out(2.4)', immediateRender: false }, t + at);
    tl.fromTo('#st${k}_' + i + ' .sic', { boxShadow: '0 0 0 0 var(--accent)' }, { boxShadow: '0 0 0 18px transparent', duration: .7, immediateRender: false }, t + at);
    tl.set('#st${k}_' + i, { className: 'station lit' }, t + at);
  });
}`;
  return { html, js };
}

/** One big number counting up inside a ring. */
function stat({ s, k, B, arabic }: Ctx): Beat {
  const item = s.visual.items[0] ?? { label: s.visual.headline || "1", value: "" };
  const number = Number(item.label.replace(/[^\d.]/g, ""));
  const counts = Number.isFinite(number) && number > 0;
  const size = B.short ? 620 : 520;
  const ring = 2 * Math.PI * 46;
  const html = `<div class="statw">
    ${s.visual.headline ? `<div class="stitle">${bdi(s.visual.headline)}</div>` : ""}
    <div class="ringbox" style="width:${size}px;height:${size}px">
      <svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" class="rtrack" /><circle cx="50" cy="50" r="46" class="rfill" id="rf${k}" style="stroke-dasharray:${r(ring)};stroke-dashoffset:${r(ring)}" /></svg>
      <div class="snum" id="sn${k}" dir="ltr">${counts ? "0" : esc(item.label)}</div>
    </div>
    ${item.value ? `<div class="sunit" id="su${k}">${bdi(item.value)}</div>` : ""}
    ${Array.from({ length: 10 }, (_, i) => `<i class="spark" id="sk${k}_${i}"></i>`).join("")}
  </div>`;
  const steps = 24;
  const js = `{
  const t = ${s.start}, D = ${r(s.seconds)}, N = ${counts ? number : 0}, L = ${r(ring)};
  const end = t + Math.min(D * .55, 2.2);
  tl.fromTo('#sc${k} .ringbox', { scale: .6, opacity: 0 }, { scale: 1, opacity: 1, duration: .5, ease: 'back.out(1.6)', immediateRender: false }, t - .1);
  tl.fromTo('#rf${k}', { strokeDashoffset: L }, { strokeDashoffset: 0, duration: end - t, ease: 'power2.out', immediateRender: false }, t);
  if (N) for (let i = 1; i <= ${steps}; i++) { const v = i === ${steps} ? N : Math.round(N * (1 - Math.pow(1 - i / ${steps}, 2))); tl.set('#sn${k}', { textContent: ${arabic ? "String(v)" : "String(v)"} }, t + (end - t) * i / ${steps}); }
  tl.fromTo('#sn${k}', { scale: 1 }, { scale: 1.12, duration: .18, yoyo: true, repeat: 1, ease: 'power2.out', immediateRender: false }, end);
  tl.fromTo('#su${k}', { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: .45, immediateRender: false }, end - .2);
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2;
    tl.fromTo('#sk${k}_' + i, { x: 0, y: 0, opacity: 1, scale: 1 }, { x: Math.cos(a) * ${size * 0.62}, y: Math.sin(a) * ${size * 0.62}, opacity: 0, scale: .3, duration: .8, ease: 'power3.out', immediateRender: false }, end);
  }
}`;
  return { html, js };
}

/** Before and after: a wipe turns the messy side into the clean one. */
function split({ s, k, B, arabic }: Ctx): Beat {
  const rows = s.visual.items.slice(0, 4);
  const w = B.short ? 900 : 1500;
  const h = B.short ? 860 : 620;
  const panel = (side: "before" | "after") =>
    `<div class="sp ${side}" id="${side === "before" ? "sb" : "sa"}${k}">
      <div class="sph">${side === "before" ? (arabic ? "قبل" : "Before") : arabic ? "بعد" : "After"}</div>
      ${rows
        .map(
          (row, i) =>
            `<div class="spr" id="${side === "before" ? "rb" : "ra"}${k}_${i}"><span class="spi">${side === "before" ? ICONS.x : ICONS.check}</span><span class="spt">${bdi(side === "before" ? row.label : (row.value ?? row.label))}${side === "before" ? `<i class="strike" id="sx${k}_${i}"></i>` : ""}</span></div>`,
        )
        .join("")}
    </div>`;
  const html = `<div class="splitw${B.short ? " col" : ""}" style="width:${w}px;height:${h}px;left:${(B.W - w) / 2}px;top:${(B.stageH - h) / 2}px">
    ${panel("before")}${panel("after")}
    <i class="divider" id="dv${k}"></i>
  </div>`;
  const js = `{
  const t = ${s.start}, D = ${r(s.seconds)}, N = ${rows.length}, COL = ${B.short};
  for (let i = 0; i < N; i++) tl.fromTo('#rb${k}_' + i, { opacity: 0, x: ${B.dir * -30} }, { opacity: 1, x: 0, duration: .3, immediateRender: false }, t + .1 + i * Math.min(.45, D * .3 / N));
  for (let i = 0; i < N; i++) tl.fromTo('#sx${k}_' + i, { scaleX: 0 }, { scaleX: 1, duration: .3, ease: 'power2.in', immediateRender: false }, t + D * .38 + i * .12);
  const wipe = t + D * .5;
  tl.fromTo('#dv${k}', COL ? { top: '0%', opacity: 1 } : { left: '${arabic ? "100%" : "0%"}', opacity: 1 }, Object.assign(COL ? { top: '50%' } : { left: '50%' }, { duration: .55, ease: 'power3.inOut', immediateRender: false }), wipe);
  tl.fromTo('#sa${k}', { clipPath: COL ? 'inset(0 0 100% 0)' : '${arabic ? "inset(0 0 0 100%)" : "inset(0 100% 0 0)"}' }, { clipPath: 'inset(0 0 0 0)', duration: .55, ease: 'power3.inOut', immediateRender: false }, wipe);
  tl.to('#sb${k}', { opacity: .45, filter: 'grayscale(1)', duration: .5 }, wipe);
  for (let i = 0; i < N; i++) tl.fromTo('#ra${k}_' + i + ' .spi', { scale: 0 }, { scale: 1, duration: .35, ease: 'back.out(3)', immediateRender: false }, wipe + .5 + i * Math.min(.4, D * .3 / N));
}`;
  return { html, js };
}

/** A lock screen collecting notifications. */
function notify({ s, k, B, brand, arabic, locale }: Ctx): Beat {
  const items = s.visual.items.slice(0, 4);
  const pw = B.short ? 600 : 470;
  const ph = B.short ? Math.min(B.stageH - 20, 1000) : B.stageH - 10;
  const times = itemTimes(s, 0.15, 0.75);
  const now = new Date(2026, 0, 1, 9, 41);
  const clock = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(now).replace(/\s?[AP]M|ص|م/g, "").trim();
  const date = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  const html = `<div class="lock" id="lk${k}" style="width:${pw}px;height:${ph}px;left:${(B.W - pw) / 2}px;top:${(B.stageH - ph) / 2}px">
    <div class="lglow"></div>
    <div class="ldate">${esc(date)}</div>
    <div class="lclock" dir="ltr">${esc(clock)}</div>
    ${items
      .map(
        (item, i) =>
          `<div class="note" id="nt${k}_${i}" style="top:${(B.short ? 330 : 250) + i * (B.short ? 150 : 128)}px">
            <span class="napp">${brand.logo ? `<img src="${brand.logo}" />` : ICONS.bell}</span>
            <div class="ntext"><div class="nrow"><b>${esc(brand.name)}</b><small>${arabic ? "الآن" : "now"}</small></div><div class="ntitle">${bdi(item.label)}</div>${item.value ? `<div class="ndetail">${bdi(item.value)}</div>` : ""}</div>
          </div>`,
      )
      .join("")}
  </div>`;
  const js = `{
  const t = ${s.start}, D = ${r(s.seconds)}, T = ${JSON.stringify(times)};
  tl.fromTo('#lk${k}', { y: 80, rotation: ${B.dir * 3}, opacity: 0 }, { y: 0, rotation: 0, opacity: 1, duration: .7, ease: 'power3.out', immediateRender: false }, t - .3);
  tl.to('#lk${k}', { y: -12, duration: 1.6, yoyo: true, repeat: Math.max(1, Math.floor(D / 1.6)), ease: 'sine.inOut' }, t + .5);
  T.forEach((at, i) => {
    tl.fromTo('#nt${k}_' + i, { opacity: 0, y: -50, scale: .92 }, { opacity: 1, y: 0, scale: 1, duration: .45, ease: 'back.out(1.8)', immediateRender: false }, t + at);
    tl.fromTo('#lk${k} .lglow', { opacity: .9 }, { opacity: .35, duration: .8, immediateRender: false }, t + at);
  });
}`;
  return { html, js };
}

/** The parts circle the logo, then are pulled into it. */
function orbit({ s, k, B, brand }: Ctx): Beat {
  const items = s.visual.items.slice(0, 6);
  const radius = B.short ? 330 : 300;
  const html = `<div class="orb" style="left:${B.W / 2}px;top:${B.stageH / 2}px">
    <i class="oring r1"></i><i class="oring r2"></i>
    <div class="ospin" id="os${k}">${items
      .map((item, i) => {
        const angle = r((360 / Math.max(1, items.length)) * i);
        return `<div class="ochip" id="oc${k}_${i}" style="--r:${radius}px;--a:${angle}deg"><span class="oin">${socialBadge(item.label)}${bdi(item.label)}</span></div>`;
      })
      .join("")}</div>
    <div class="ocore" id="ok${k}">${brand.logo ? `<img src="${brand.logo}" />` : `<b>${esc(brand.name.slice(0, 1))}</b>`}</div>
  </div>`;
  const js = `{
  const t = ${s.start}, D = ${r(s.seconds)}, N = ${items.length};
  const pull = t + D * .68;
  tl.fromTo('#ok${k}', { scale: 0 }, { scale: 1, duration: .6, ease: 'back.out(2)', immediateRender: false }, t - .1);
  tl.fromTo('#sc${k} .oring', { scale: .3, opacity: 0 }, { scale: 1, opacity: 1, duration: .8, stagger: .15, ease: 'power2.out', immediateRender: false }, t);
  for (let i = 0; i < N; i++) tl.fromTo('#oc${k}_' + i, { opacity: 0, '--r': '0px' }, { opacity: 1, '--r': '${radius}px', duration: .6, ease: 'back.out(1.4)', immediateRender: false }, t + .2 + i * Math.min(.3, D * .3 / N));
  // The ring turns; each chip turns back the same amount so its words stay upright.
  tl.fromTo('#os${k}', { rotation: 0 }, { rotation: 100, duration: pull - t + .6, ease: 'none', immediateRender: false }, t);
  tl.fromTo('#os${k} .oin', { rotation: 0 }, { rotation: -100, duration: pull - t + .6, ease: 'none', immediateRender: false }, t);
  for (let i = 0; i < N; i++) {
    tl.to('#oc${k}_' + i, { '--r': '0px', opacity: 0, duration: .5, ease: 'power3.in' }, pull + i * .06);
    tl.to('#oc${k}_' + i + ' .oin', { scale: .3, duration: .5, ease: 'power3.in' }, pull + i * .06);
  }
  tl.to('#ok${k}', { scale: 1.35, duration: .25, ease: 'power2.out' }, pull + .5);
  tl.to('#ok${k}', { scale: 1, duration: .5, ease: 'elastic.out(1, .4)' }, pull + .75);
  tl.fromTo('#sc${k} .r2', { scale: 1, opacity: 1 }, { scale: 2.2, opacity: 0, duration: .8, immediateRender: false }, pull + .5);
}`;
  return { html, js };
}

/** The logo built from the brand's shapes, a light sweep and a tagline. */
function sting({ s, k, B, brand }: Ctx): Beat {
  const rnd = seeded(k + 17);
  const shapes = Array.from({ length: 12 }, (_, i) => {
    const angle = (i / 12) * Math.PI * 2;
    const far = B.W * 0.9;
    return {
      kind: i % 3,
      color: ["var(--accent)", "var(--cta)", "var(--text)"][i % 3],
      size: r(30 + rnd() * 60),
      from: [r(Math.cos(angle) * far), r(Math.sin(angle) * far)],
      ring: [r(Math.cos(angle) * 230), r(Math.sin(angle) * 230)],
    };
  });
  const chars = [...brand.name];
  const html = `<div class="stingw">
    ${shapes.map((shape, i) => `<i class="shape k${shape.kind}" id="sh${k}_${i}" style="width:${shape.size}px;height:${shape.size}px;background:${shape.color};margin:-${shape.size / 2}px 0 0 -${shape.size / 2}px"></i>`).join("")}
    <div class="slogo" id="sl${k}">${brand.logo ? `<img src="${brand.logo}" />` : ""}<i class="sweep" id="sw${k}"></i></div>
    <div class="sname" dir="auto">${chars.map((char, i) => `<span id="sg${k}_${i}">${char === " " ? "&nbsp;" : esc(char)}</span>`).join("")}</div>
    ${s.visual.headline ? `<div class="stag" id="stg${k}">${bdi(s.visual.headline)}</div>` : ""}
  </div>`;
  const js = `{
  const t = ${s.start}, D = ${r(s.seconds)}, S = ${JSON.stringify(shapes.map((shape) => [shape.from, shape.ring]))}, C = ${chars.length};
  S.forEach(([from, ring], i) => {
    const id = '#sh${k}_' + i;
    tl.fromTo(id, { x: from[0], y: from[1], rotation: -180, opacity: 0 }, { x: ring[0], y: ring[1], rotation: 0, opacity: 1, duration: .7, ease: 'power3.out', immediateRender: false }, t - .2 + i * .03);
    tl.to(id, { x: 0, y: 0, scale: .2, duration: .4, ease: 'power3.in' }, t + .75);
    tl.to(id, { x: ring[0] * 2.4, y: ring[1] * 2.4, scale: .6, opacity: .25, duration: D - 1.2, ease: 'power1.out' }, t + 1.15);
  });
  tl.fromTo('#sl${k}', { scale: 0, rotation: -30 }, { scale: 1, rotation: 0, duration: .6, ease: 'back.out(2.2)', immediateRender: false }, t + 1.05);
  tl.fromTo('#sw${k}', { xPercent: -160 }, { xPercent: 260, duration: .9, ease: 'power2.inOut', immediateRender: false }, t + 1.5);
  for (let i = 0; i < C; i++) tl.fromTo('#sg${k}_' + i, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: .3, ease: 'power3.out', immediateRender: false }, t + 1.4 + i * .05);
  tl.fromTo('#stg${k}', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: .5, immediateRender: false }, t + 1.6 + C * .05);
}`;
  return { html, js };
}

/**
 * A customer asks; you answer with link after link, each opening a
 * different preview that piles up beside the chat: too much to take in.
 */
function links({ s, k, B, brand, arabic, m }: Ctx): Beat {
  const items = s.visual.items.slice(0, 5);
  const rnd = seeded(k + 29);
  const pictures = postPictures(m);
  const chatW = B.short ? 900 : 900;
  const chatX = B.short ? (B.W - chatW) / 2 : arabic ? B.W - 140 - chatW : 140;
  const pile = B.short ? { x: B.W / 2, y: B.stageH * 0.78 } : { x: arabic ? 560 : B.W - 560, y: B.stageH * 0.5 };
  const times = itemTimes(s, 0.25, 0.85);
  const cards = items.map((_, i) => ({ x: r(pile.x - 160 + (rnd() - 0.5) * (B.short ? 380 : 300)), y: r(pile.y - 120 + (rnd() - 0.5) * (B.short ? 150 : 320)), rot: r((rnd() - 0.5) * 22) }));
  const html = `<div class="lchat" id="lc${k}" style="left:${chatX}px;width:${chatW}px">
    <div class="lmsg in" id="lq${k}"><span class="typing" id="lt${k}"><b></b><b></b><b></b></span><span class="txt" id="lqt${k}">${bdi(s.visual.headline || (arabic ? "ممكن أعرف الأسعار والخدمات؟" : "Can I see your prices and services?"))}</span></div>
    ${items
      .map((item, i) => `<div class="lmsg out" id="lm${k}_${i}">${socialBadge(`${item.label} ${item.value ?? ""}`, "licon") || `<span class="licon">${ICONS.link}</span>`}<div><b>${bdi(item.label)}</b>${item.value ? `<small dir="ltr">${esc(item.value)}</small>` : ""}</div></div>`)
      .join("")}
    <div class="lmsg in last" id="lz${k}"><span class="txt">؟</span></div>
  </div>
  ${cards
    .map(
      (card, i) =>
        `<div class="lcard" id="lp${k}_${i}" style="left:${card.x}px;top:${card.y}px;transform:rotate(${card.rot}deg)"><div class="lpic" style="background-image:url('${pictures[i % Math.max(1, pictures.length)] ?? ""}')"></div><div class="lcap">${bdi(items[i].label)}</div></div>`,
    )
    .join("")}`;
  const js = `{
  const t = ${s.start}, D = ${r(s.seconds)}, T = ${JSON.stringify(times)};
  tl.fromTo('#lq${k}', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: .3, immediateRender: false }, t);
  tl.fromTo('#lt${k} b', { y: 0 }, { y: -8, duration: .18, yoyo: true, repeat: 3, stagger: .09, immediateRender: false }, t + .1);
  tl.set('#lt${k}', { display: 'none' }, t + Math.min(1, D * .15));
  tl.fromTo('#lqt${k}', { opacity: 0 }, { opacity: 1, duration: .2, immediateRender: false }, t + Math.min(1, D * .15));
  T.forEach((at, i) => {
    tl.fromTo('#lm${k}_' + i, { opacity: 0, x: ${B.dir * 40}, scale: .9 }, { opacity: 1, x: 0, scale: 1, duration: .3, ease: 'back.out(2)', immediateRender: false }, t + at);
    tl.fromTo('#lp${k}_' + i, { opacity: 0, scale: .3, x: ${B.short ? 0 : B.dir * 260}, y: ${B.short ? -260 : 0} }, { opacity: 1, scale: 1, x: 0, y: 0, duration: .5, ease: 'back.out(1.5)', immediateRender: false }, t + at + .15);
  });
  tl.fromTo('#lz${k}', { opacity: 0, scale: .5 }, { opacity: 1, scale: 1, duration: .4, ease: 'back.out(3)', immediateRender: false }, t + D * .9);
}`;
  return { html, js };
}

/** A week fills with appointments, and the last two collide. */
function conflict({ s, k, B, arabic, locale }: Ctx): Beat {
  const items = s.visual.items.slice(0, 5);
  const w = B.short ? 940 : 1400;
  const h = B.short ? 760 : 680;
  const days = Array.from({ length: 5 }, (_, i) => new Intl.DateTimeFormat(locale, { weekday: "short" }).format(new Date(2026, 9, 18 + i)));
  const hours = ["10", "11", "12", "1", "2"];
  // The grid sits inside 40px side padding, after a 70px hour column; rows start under the header and day names.
  const colW = (w - 80 - 70) / 5;
  const rowH = (h - 150) / 5;
  const gridTop = 28 + 60 + 10 + 40;
  // Spread out, except the last two, which land on the same slot.
  const slots = items.map((_, i) => (i === items.length - 1 && i > 0 ? { day: (i - 1) * 2 % 5, hour: (i - 1) % 5, clash: true } : { day: (i * 2) % 5, hour: i % 5, clash: i === items.length - 2 }));
  const html = `<div class="week" id="wk${k}" style="width:${w}px;height:${h}px;left:${(B.W - w) / 2}px;top:${(B.stageH - h) / 2}px">
    <div class="whead">${ICONS.calendar}<b>${bdi(s.visual.headline || (arabic ? "مواعيد الأسبوع" : "This week"))}</b><span class="wbad" id="wb${k}">${ICONS.x}${arabic ? "تعارض" : "Conflict"}</span></div>
    <div class="wgrid" style="grid-template-columns:70px repeat(5, 1fr);grid-template-rows:40px repeat(5, ${r(rowH)}px)">
      <i></i>${days.map((day) => `<span class="wday">${esc(day)}</span>`).join("")}
      ${hours.map((hour) => `<span class="whour">${hour}</span>${days.map(() => "<i class=\"wcell\"></i>").join("")}`).join("")}
    </div>
    ${items
      .map((item, i) => {
        const slot = slots[i];
        const x = 40 + 70 + slot.day * colW + 7 + (i === items.length - 1 && i > 0 ? colW * 0.22 : 0);
        const y = gridTop + slot.hour * rowH + 5 + (i === items.length - 1 && i > 0 ? rowH * 0.25 : 0);
        return `<div class="wev${slot.clash ? " clash" : ""}" id="we${k}_${i}" style="${arabic ? "right" : "left"}:${r(x)}px;top:${r(y)}px;width:${r(colW - 14)}px;height:${r(rowH - 10)}px">${bdi(item.label)}</div>`;
      })
      .join("")}
  </div>`;
  const js = `{
  const t = ${s.start}, D = ${r(s.seconds)}, N = ${items.length};
  tl.fromTo('#wk${k}', { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: .5, ease: 'power3.out', immediateRender: false }, t - .2);
  for (let i = 0; i < N; i++) tl.fromTo('#we${k}_' + i, { opacity: 0, scaleY: 0 }, { opacity: 1, scaleY: 1, duration: .35, ease: 'back.out(2)', immediateRender: false }, t + .3 + i * Math.min(.6, D * .55 / N));
  const clash = t + .3 + (N - 1) * Math.min(.6, D * .55 / N) + .2;
  tl.to('#wk${k} .clash', { x: 8, duration: .05, yoyo: true, repeat: 9, ease: 'none' }, clash);
  tl.fromTo('#wk${k} .clash', { boxShadow: '0 0 0 0 var(--cta)' }, { boxShadow: '0 0 0 6px var(--cta), 0 0 40px var(--cta)', duration: .3, immediateRender: false }, clash);
  tl.fromTo('#wb${k}', { opacity: 0, scale: .4 }, { opacity: 1, scale: 1, duration: .4, ease: 'back.out(3)', immediateRender: false }, clash + .15);
}`;
  return { html, js };
}

/**
 * The page as an infographic: a page drawn in the brand's colours (grey and
 * generic at first, then made its own), whose parts light up one by one
 * with a labelled callout — about you, services, work, reviews, booking.
 * Explains what the page holds without showing a screenshot.
 */
function pagemap({ s, k, B, brand, arabic }: Ctx): Beat {
  const items = s.visual.items.slice(0, 5);
  const cardW = B.short ? 480 : 780;
  const cardH = B.short ? 760 : B.stageH - 50;
  const cx = B.W / 2;
  const x0 = cx - cardW / 2;
  const y0 = (B.stageH - cardH) / 2;
  // The page's parts, top to bottom, as fractions of its height.
  const parts = [
    { id: "hero", top: 0.11, height: 0.27 },
    { id: "services", top: 0.41, height: 0.17 },
    { id: "work", top: 0.61, height: 0.14 },
    { id: "reviews", top: 0.78, height: 0.08 },
    { id: "book", top: 0.89, height: 0.07 },
  ];
  const calloutW = B.short ? 230 : 330;
  const gap = B.short ? 22 : 70;
  const callouts = items.map((item, i) => {
    const part = parts[i];
    const py = y0 + (part.top + part.height / 2) * cardH;
    const left = i % 2 === (arabic ? 1 : 0);
    const x = left ? x0 - gap - calloutW : x0 + cardW + gap;
    return { item, part, left, x: r(x), y: r(py - 34), from: [r(left ? x + calloutW : x), r(py)], to: [r(left ? x0 + 14 : x0 + cardW - 14), r(py)] };
  });
  const times = itemTimes(s, 0.3, 0.85);
  const html = `<div class="pmap" id="pm${k}" style="left:${x0}px;top:${y0}px;width:${cardW}px;height:${cardH}px">
    <div class="pmhead">${brand.logo ? `<img src="${brand.logo}" />` : "<i></i>"}<b>${esc(brand.name)}</b><i class="pmnav"></i></div>
    ${parts
      .map((part) => {
        const style = `top:${r(part.top * cardH)}px;height:${r(part.height * cardH)}px`;
        if (part.id === "hero") return `<div class="pmp hero" id="pp${k}_hero" style="${style}"><i class="l1"></i><i class="l2"></i><i class="btn"></i><i class="pic"></i></div>`;
        if (part.id === "services") return `<div class="pmp services" id="pp${k}_services" style="${style}"><i></i><i></i><i></i></div>`;
        if (part.id === "work") return `<div class="pmp work" id="pp${k}_work" style="${style}"><i></i><i></i><i></i><i></i></div>`;
        if (part.id === "reviews") return `<div class="pmp reviews" id="pp${k}_reviews" style="${style}"><span>★★★★★</span><i></i></div>`;
        return `<div class="pmp book" id="pp${k}_book" style="${style}"></div>`;
      })
      .join("")}
    <div class="pmgen" id="pg${k}">${arabic ? "تمبليت جاهزة؟" : "A template?"}<i class="pmx"></i></div>
  </div>
  <svg class="pmlines" viewBox="0 0 ${B.W} ${B.stageH}" width="${B.W}" height="${B.stageH}">${callouts
    .map((c, i) => `<path id="pl${k}_${i}" d="M${c.from[0]} ${c.from[1]} L${c.to[0]} ${c.to[1]}" pathLength="1" /><circle id="pd${k}_${i}" cx="${c.to[0]}" cy="${c.to[1]}" r="9" />`)
    .join("")}</svg>
  ${callouts
    .map((c, i) => `<div class="pmc${c.left ? " left" : ""}" id="pc${k}_${i}" style="left:${c.x}px;top:${c.y}px;width:${calloutW}px"><span class="pmi">${iconByWord(c.item.value)}</span>${bdi(c.item.label)}</div>`)
    .join("")}`;
  const js = `{
  const t = ${s.start}, D = ${r(s.seconds)}, T = ${JSON.stringify(times)}, P = ${JSON.stringify(callouts.map((c) => c.part.id))};
  tl.fromTo('#pm${k}', { y: 60, scale: .92, rotationY: ${B.dir * -14}, transformPerspective: 1600 }, { y: 0, scale: 1, rotationY: 0, duration: .8, ease: 'power3.out', immediateRender: false }, t - .3);
  tl.fromTo('#pm${k} .pmp, #pm${k} .pmhead', { opacity: 0, scaleX: .6 }, { opacity: 1, scaleX: 1, duration: .35, stagger: .07, ease: 'power2.out', immediateRender: false }, t);
  // Generic first, then the brand's own.
  tl.fromTo('#pg${k}', { opacity: 0, scale: .7 }, { opacity: 1, scale: 1, duration: .3, ease: 'back.out(2)', immediateRender: false }, t + D * .08);
  tl.fromTo('#pg${k} .pmx', { scaleX: 0 }, { scaleX: 1, duration: .25, immediateRender: false }, t + D * .16);
  tl.to('#pg${k}', { opacity: 0, scale: 1.2, duration: .3 }, t + D * .2);
  tl.to('#pm${k}', { '--fill': 1, duration: .6, ease: 'power2.inOut' }, t + D * .2);
  T.forEach((at, i) => {
    tl.fromTo('#pp${k}_' + P[i], { boxShadow: '0 0 0 0 transparent' }, { boxShadow: '0 0 0 4px var(--accent), 0 0 40px color-mix(in srgb, var(--accent) 60%, transparent)', duration: .35, immediateRender: false }, t + at);
    tl.fromTo('#pp${k}_' + P[i], { scale: 1 }, { scale: 1.04, duration: .2, yoyo: true, repeat: 1, ease: 'power2.out', immediateRender: false }, t + at);
    tl.fromTo('#pl${k}_' + i, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: .35, ease: 'power2.out', immediateRender: false }, t + at + .05);
    tl.fromTo('#pd${k}_' + i, { opacity: 0, scale: 0, transformOrigin: 'center' }, { opacity: 1, scale: 1, duration: .25, immediateRender: false }, t + at);
    tl.fromTo('#pc${k}_' + i, { opacity: 0, x: (i % 2 ? 1 : -1) * 30 }, { opacity: 1, x: 0, duration: .35, ease: 'back.out(1.8)', immediateRender: false }, t + at + .2);
    if (i > 0) tl.to('#pp${k}_' + P[i - 1], { boxShadow: '0 0 0 1.5px color-mix(in srgb, var(--accent) 35%, transparent)', duration: .3 }, t + at);
  });
}`;
  return { html, js };
}

export const MOTION = { kinetic, chaos, path, stat, split, notify, orbit, sting, links, conflict, page: pagemap };

/** The motion beats that fill the whole frame and show their own headline. */
export const FULL_FRAME = ["kinetic", "stat", "sting"];

/** CSS for the motion beats, in the brand's variables. */
export function motionCss(B: Box, arabic: boolean): string {
  return `
  /* kinetic */
  .b-kinetic .stage, .b-stat .stage, .b-sting .stage { top: 0; height: ${B.H}px; display: flex; align-items: center; justify-content: center; }
  .kin { position: absolute; left: 50%; top: 50%; width: ${B.short ? 960 : 1600}px; margin-left: -${B.short ? 480 : 800}px; translate: 0 -50%; text-align: center; font-family: var(--head); font-weight: 800; line-height: 1.15; opacity: 0; }
  .kw { position: relative; display: inline-block; overflow: hidden; padding: 0 .06em .08em; vertical-align: bottom; }
  .kwi { display: inline-block; opacity: 0; }
  .kw.hot .kwi { color: var(--accent); position: relative; z-index: 1; }
  .hl { position: absolute; left: 0; right: 0; top: 12%; bottom: 6%; background: var(--accent); border-radius: .12em; transform: scaleX(0); transform-origin: ${arabic ? "right" : "left"}; }

  /* chaos */
  .piece { position: absolute; width: 300px; opacity: 0; display: flex; align-items: center; gap: 12px; padding: 16px 20px; border-radius: 20px; background: var(--panel); border: 1.5px solid color-mix(in srgb, var(--muted) 30%, transparent); font: 600 ${B.short ? 30 : 26}px var(--body); box-shadow: 0 20px 50px #0007; }
  .pic { flex: none; width: 46px; height: 46px; border-radius: 14px; display: grid; place-items: center; background: color-mix(in srgb, var(--cta) 22%, transparent); color: var(--cta); }
  .pic svg { width: 26px; height: 26px; }
  .order { position: absolute; opacity: 0; border-radius: 34px; padding: 34px 40px; background: var(--panel); border: 2px solid var(--accent); box-shadow: 0 40px 100px #000a, 0 0 80px color-mix(in srgb, var(--accent) 35%, transparent); }
  .ohead { display: flex; align-items: center; gap: 16px; font: 700 ${B.short ? 40 : 34}px var(--head); } .ohead img { width: 64px; height: 64px; border-radius: 16px; object-fit: contain; background: var(--bg); }
  .ock { margin-inline-start: auto; width: 60px; height: 60px; border-radius: 50%; background: var(--accent); color: var(--bg); display: grid; place-items: center; transform: scale(0); } .ock svg { width: 36px; height: 36px; stroke-width: 3; }
  .otitle { margin: 22px 0 20px; font: 800 ${B.short ? 64 : 58}px/1.2 var(--head); }
  .olines { display: grid; gap: 12px; } .olines i { display: block; height: 16px; border-radius: 8px; background: color-mix(in srgb, var(--accent) 35%, var(--panel)); transform: scaleX(0); transform-origin: ${arabic ? "right" : "left"}; }
  .olines i:nth-child(2) { width: 80%; } .olines i:nth-child(3) { width: 55%; background: var(--cta); }

  /* path */
  .pathsvg { position: absolute; left: 0; top: 0; overflow: visible; }
  .ptrack { fill: none; stroke: color-mix(in srgb, var(--muted) 28%, transparent); stroke-width: 6; stroke-dasharray: 2 16; stroke-linecap: round; stroke-linejoin: round; }
  .pdraw { fill: none; stroke: var(--accent); stroke-width: 8; stroke-dasharray: 1; stroke-dashoffset: 1; stroke-linecap: round; stroke-linejoin: round; filter: drop-shadow(0 0 12px var(--accent)); }
  .pdot { position: absolute; width: 34px; height: 34px; margin: -17px 0 0 -17px; border-radius: 50%; background: var(--cta); box-shadow: 0 0 30px var(--cta), 0 0 0 8px color-mix(in srgb, var(--cta) 25%, transparent); opacity: 0; z-index: 3; }
  .station { position: absolute; width: 0; height: 0; opacity: .25; }
  .sic { position: absolute; width: 100px; height: 100px; margin: -50px 0 0 -50px; border-radius: 50%; display: grid; place-items: center; background: var(--panel); border: 3px solid color-mix(in srgb, var(--muted) 40%, transparent); color: var(--muted); }
  .sic svg { width: 48px; height: 48px; }
  .station.lit .sic { background: var(--accent); border-color: var(--accent); color: var(--bg); }
  .slb { position: absolute; white-space: nowrap; font: 700 ${B.short ? 38 : 32}px var(--head); transform: translateX(-50%); }
  .slb.above { bottom: 66px; } .slb.below { top: 66px; }

  /* stat */
  .statw { position: relative; display: flex; flex-direction: column; align-items: center; gap: 26px; }
  .stitle { font: 700 ${B.short ? 56 : 48}px var(--head); text-align: center; padding: 0 40px; }
  .ringbox { position: relative; display: grid; place-items: center; }
  .ringbox svg { position: absolute; inset: 0; transform: rotate(-90deg); }
  .rtrack { fill: none; stroke: color-mix(in srgb, var(--muted) 20%, transparent); stroke-width: 5; }
  .rfill { fill: none; stroke: var(--accent); stroke-width: 5; stroke-linecap: round; filter: drop-shadow(0 0 8px var(--accent)); }
  .snum { position: relative; font: 800 ${B.short ? 250 : 210}px/1 var(--head); }
  .sunit { font: 700 ${B.short ? 52 : 44}px var(--head); color: var(--accent); text-align: center; padding: 0 40px; opacity: 0; }
  .spark { position: absolute; top: 50%; left: 50%; width: 22px; height: 22px; margin: -11px; border-radius: 50%; background: var(--cta); opacity: 0; }
  .spark:nth-child(odd) { background: var(--accent); }

  /* split */
  .splitw { position: absolute; display: grid; grid-template-columns: 1fr 1fr; gap: 0; border-radius: 30px; overflow: hidden; box-shadow: 0 40px 100px #000a; }
  .splitw.col { grid-template-columns: 1fr; grid-template-rows: 1fr 1fr; }
  .sp { position: relative; padding: 30px 36px; display: flex; flex-direction: column; gap: 18px; justify-content: center; }
  .sp.before { background: color-mix(in srgb, var(--panel) 70%, var(--bg)); color: var(--muted); }
  .sp.after { background: var(--panel); box-shadow: inset 0 0 0 2px var(--accent); clip-path: inset(0 100% 0 0); }
  .sph { font: 800 ${B.short ? 34 : 30}px var(--head); text-transform: uppercase; letter-spacing: 2px; opacity: .8; }
  .sp.after .sph { color: var(--accent); }
  .spr { display: flex; align-items: center; gap: 16px; font: 600 ${B.short ? 36 : 32}px var(--body); }
  .sp.before .spr { opacity: 0; }
  .spi { flex: none; width: 48px; height: 48px; border-radius: 50%; display: grid; place-items: center; background: color-mix(in srgb, var(--muted) 25%, transparent); }
  .sp.after .spi { background: var(--accent); color: var(--bg); transform: scale(0); }
  .spi svg { width: 28px; height: 28px; stroke-width: 3; }
  .spt { position: relative; }
  .strike { position: absolute; left: -4px; right: -4px; top: 52%; height: 4px; background: var(--cta); transform: scaleX(0); transform-origin: ${arabic ? "right" : "left"}; }
  .divider { position: absolute; z-index: 2; background: var(--cta); box-shadow: 0 0 40px var(--cta); opacity: 0; }
  .splitw:not(.col) .divider { top: 0; bottom: 0; width: 8px; margin-left: -4px; }
  .splitw.col .divider { left: 0; right: 0; height: 8px; margin-top: -4px; }

  /* notify */
  .lock { position: absolute; opacity: 0; border-radius: 64px; overflow: hidden; background: linear-gradient(160deg, var(--panel), var(--bg)); border: 2px solid color-mix(in srgb, var(--muted) 25%, transparent); box-shadow: 0 50px 120px #000b; }
  .lglow { position: absolute; width: 140%; height: 60%; left: -20%; top: -20%; background: radial-gradient(circle, color-mix(in srgb, var(--accent) 45%, transparent), transparent 65%); opacity: .35; }
  .ldate { position: relative; margin-top: ${B.short ? 70 : 46}px; text-align: center; font: 500 ${B.short ? 30 : 24}px var(--body); color: var(--muted); }
  .lclock { position: relative; text-align: center; font: 700 ${B.short ? 150 : 120}px/1.1 var(--head); }
  .note { position: absolute; left: 22px; right: 22px; opacity: 0; display: flex; gap: 16px; align-items: center; padding: 18px 20px; border-radius: 26px; background: color-mix(in srgb, var(--text) 10%, var(--panel)); backdrop-filter: blur(10px); box-shadow: 0 16px 40px #0006; }
  .napp { flex: none; width: 62px; height: 62px; border-radius: 16px; overflow: hidden; display: grid; place-items: center; background: var(--bg); color: var(--accent); }
  .napp img { width: 100%; height: 100%; object-fit: contain; } .napp svg { width: 34px; height: 34px; }
  .ntext { min-width: 0; flex: 1; } .nrow { display: flex; justify-content: space-between; font: 600 ${B.short ? 22 : 18}px var(--body); color: var(--muted); }
  .ntitle { font: 700 ${B.short ? 30 : 25}px var(--body); } .ndetail { font: 400 ${B.short ? 25 : 21}px var(--body); color: var(--muted); }

  /* orbit */
  .orb { position: absolute; width: 0; height: 0; }
  .oring { position: absolute; border-radius: 50%; border: 2px solid color-mix(in srgb, var(--accent) 40%, transparent); opacity: 0; }
  .oring.r1 { width: ${B.short ? 660 : 600}px; height: ${B.short ? 660 : 600}px; margin: -${B.short ? 330 : 300}px; border-style: dashed; }
  .oring.r2 { width: 260px; height: 260px; margin: -130px; border-color: var(--cta); }
  .ospin { position: absolute; width: 0; height: 0; }
  .ochip { position: absolute; width: 0; height: 0; opacity: 0; transform: rotate(var(--a)) translateX(var(--r)) rotate(calc(-1 * var(--a))); }
  .oin { position: absolute; left: 0; top: 0; translate: -50% -50%; white-space: nowrap; font: 700 ${B.short ? 34 : 30}px var(--head); padding: 14px 28px; border-radius: 999px; background: var(--panel); border: 2px solid color-mix(in srgb, var(--accent) 50%, transparent); box-shadow: 0 16px 40px #0007; }
  .ocore { position: absolute; width: 200px; height: 200px; margin: -100px; border-radius: 50%; display: grid; place-items: center; overflow: hidden; background: var(--panel); border: 3px solid var(--accent); box-shadow: 0 0 80px color-mix(in srgb, var(--accent) 50%, transparent); }
  .ocore img { width: 70%; height: 70%; object-fit: contain; } .ocore b { font: 800 100px var(--head); color: var(--accent); }

  /* sting */
  .stingw { position: relative; display: flex; flex-direction: column; align-items: center; gap: 24px; }
  .shape { position: absolute; top: 50%; left: 50%; opacity: 0; }
  .shape.k0 { border-radius: 50%; } .shape.k1 { border-radius: 22%; } .shape.k2 { border-radius: 50%; width: 18px !important; height: 18px !important; }
  .slogo { position: relative; width: ${B.short ? 260 : 220}px; height: ${B.short ? 260 : 220}px; border-radius: 56px; overflow: hidden; background: var(--panel); display: grid; place-items: center; box-shadow: 0 0 100px color-mix(in srgb, var(--accent) 50%, transparent); transform: scale(0); }
  .slogo img { width: 80%; height: 80%; object-fit: contain; }
  .sweep { position: absolute; top: -20%; bottom: -20%; width: 40%; left: 0; background: linear-gradient(100deg, transparent, #ffffffaa, transparent); transform: translateX(-160%) skewX(-18deg); }
  .sname { font: 800 ${B.short ? 120 : 110}px/1 var(--head); direction: ltr; } .sname span { display: inline-block; opacity: 0; }
  .stag { font: 600 ${B.short ? 46 : 40}px var(--body); color: var(--accent); text-align: center; padding: 0 50px; opacity: 0; }

  /* links */
  .lchat { position: absolute; top: 0; display: flex; flex-direction: column; gap: 14px; }
  .lmsg { display: flex; align-items: center; gap: 14px; max-width: 82%; padding: 16px 22px; border-radius: 26px; font: 500 ${B.short ? 34 : 34}px/1.35 var(--body); opacity: 0; }
  .lmsg.in { align-self: flex-start; background: color-mix(in srgb, var(--text) 10%, var(--panel)); border-end-start-radius: 8px; }
  .lmsg.out { align-self: flex-end; background: color-mix(in srgb, var(--accent) 22%, var(--panel)); border: 1.5px solid color-mix(in srgb, var(--accent) 50%, transparent); border-end-end-radius: 8px; }
  .lmsg.out small { display: block; font: 500 ${B.short ? 22 : 18}px 'IBM Plex Mono', monospace; color: var(--accent); }
  .lmsg.last .txt { font: 800 ${B.short ? 60 : 50}px var(--head); color: var(--cta); }
  .licon { flex: none; width: 44px; height: 44px; border-radius: 12px; display: grid; place-items: center; background: var(--accent); color: var(--bg); } .licon svg { width: 26px; height: 26px; }
  .lcard { position: absolute; width: ${B.short ? 320 : 380}px; opacity: 0; border-radius: 20px; overflow: hidden; background: var(--panel); box-shadow: 0 24px 60px #000a; border: 1.5px solid color-mix(in srgb, var(--muted) 30%, transparent); }
  .lpic { height: ${B.short ? 190 : 230}px; background: center top / cover; }
  .lcap { padding: 12px 16px; font: 600 ${B.short ? 26 : 22}px var(--body); }

  /* conflict */
  .week { position: absolute; opacity: 0; border-radius: 30px; padding: 28px 40px; background: var(--panel); border: 1.5px solid color-mix(in srgb, var(--muted) 25%, transparent); box-shadow: 0 40px 100px #000a; }
  .whead { display: flex; align-items: center; gap: 14px; height: 60px; font: 700 ${B.short ? 40 : 34}px var(--head); } .whead svg { width: 40px; height: 40px; color: var(--accent); }
  .wbad { margin-inline-start: auto; display: flex; align-items: center; gap: 8px; padding: 8px 18px; border-radius: 999px; background: var(--cta); color: var(--bg); font: 700 ${B.short ? 28 : 24}px var(--body); opacity: 0; } .wbad svg { width: 24px; height: 24px; stroke-width: 3; }
  .wgrid { display: grid; margin-top: 10px; direction: ${arabic ? "rtl" : "ltr"}; }
  .wday { text-align: center; font: 600 ${B.short ? 24 : 26}px var(--body); color: var(--muted); }
  .whour { font: 500 ${B.short ? 22 : 22}px var(--body); color: var(--muted); padding-top: 4px; }
  .wcell { border-top: 1.5px solid color-mix(in srgb, var(--muted) 20%, transparent); }
  .wev { position: absolute; opacity: 0; transform-origin: top; border-radius: 12px; padding: 8px 12px; font: 600 ${B.short ? 24 : 26}px var(--body); background: color-mix(in srgb, var(--accent) 35%, var(--panel)); border: 1.5px solid var(--accent); overflow: hidden; }
  .wev.clash { background: color-mix(in srgb, var(--cta) 35%, var(--panel)); border-color: var(--cta); }

  /* the page as an infographic */
  .pmap { position: absolute; opacity: 1; border-radius: 26px; overflow: hidden; --fill: 0; box-shadow: 0 40px 100px #000a;
    background: color-mix(in srgb, #eceef2 calc(100% - var(--fill) * 100%), var(--bg)); border: 2px solid color-mix(in srgb, #d5d7de calc(100% - var(--fill) * 100%), color-mix(in srgb, var(--accent) 40%, transparent)); }
  .pmhead { position: absolute; left: 0; right: 0; top: 0; height: 9%; display: flex; align-items: center; gap: 12px; padding: 0 22px; transform-origin: ${arabic ? "right" : "left"};
    color: color-mix(in srgb, #9a9ca6 calc(100% - var(--fill) * 100%), var(--text)); font: 700 ${B.short ? 26 : 26}px var(--head); }
  .pmhead img, .pmhead > i:first-child { width: 36px; height: 36px; border-radius: 10px; object-fit: contain; background: var(--panel); filter: grayscale(calc(1 - var(--fill))); }
  .pmnav { margin-inline-start: auto; width: 110px; height: 30px; border-radius: 999px; background: color-mix(in srgb, #c9cad3 calc(100% - var(--fill) * 100%), var(--cta)); }
  .pmp { position: absolute; left: 22px; right: 22px; border-radius: 16px; transform-origin: ${arabic ? "right" : "left"}; }
  .pmp i { display: block; border-radius: 10px; background: color-mix(in srgb, #c9cad3 calc(100% - var(--fill) * 100%), var(--c, var(--panel))); }
  .pmp.hero { background: color-mix(in srgb, #dfe0e6 calc(100% - var(--fill) * 100%), color-mix(in srgb, var(--accent) 22%, var(--panel))); padding: 22px; display: grid; grid-template-columns: 1.3fr 1fr; grid-template-rows: auto auto 1fr; gap: 12px; }
  .pmp.hero .l1 { height: 22%; min-height: 18px; --c: var(--text); } .pmp.hero .l2 { width: 70%; height: 16%; min-height: 14px; --c: var(--muted); }
  .pmp.hero .btn { width: 55%; height: 22%; min-height: 20px; border-radius: 999px; --c: var(--cta); align-self: end; }
  .pmp.hero .pic { grid-column: 2; grid-row: 1 / 4; --c: color-mix(in srgb, var(--accent) 60%, var(--cta)); border-radius: 18px; }
  .pmp.services { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; } .pmp.services i { --c: var(--panel); border: 1.5px solid color-mix(in srgb, var(--accent) calc(var(--fill) * 45%), transparent); }
  .pmp.work { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; } .pmp.work i:nth-child(odd) { --c: color-mix(in srgb, var(--accent) 45%, var(--panel)); } .pmp.work i:nth-child(even) { --c: color-mix(in srgb, var(--cta) 45%, var(--panel)); }
  .pmp.reviews { display: flex; align-items: center; gap: 14px; } .pmp.reviews span { color: color-mix(in srgb, #b9bbc4 calc(100% - var(--fill) * 100%), var(--cta)); font-size: ${B.short ? 26 : 28}px; letter-spacing: 2px; } .pmp.reviews i { flex: 1; height: 40%; --c: var(--panel); }
  .pmp.book { left: 25%; right: 25%; border-radius: 999px; background: color-mix(in srgb, #c9cad3 calc(100% - var(--fill) * 100%), var(--cta)); }
  .pmgen { position: absolute; left: 50%; top: 45%; translate: -50% -50%; z-index: 3; opacity: 0; white-space: nowrap; font: 800 ${B.short ? 40 : 44}px var(--head); color: #3a3c46; background: #fff; border: 4px dashed #9a9ca6; padding: 10px 30px; border-radius: 18px; }
  .pmx { position: absolute; left: -6%; right: -6%; top: 50%; height: 7px; background: var(--cta); transform: scaleX(0) rotate(-6deg); }
  .pmlines { position: absolute; left: 0; top: 0; overflow: visible; pointer-events: none; }
  .pmlines path { fill: none; stroke: var(--accent); stroke-width: 3; stroke-dasharray: 1; stroke-dashoffset: 1; }
  .pmlines circle { fill: var(--accent); opacity: 0; }
  .pmc { position: absolute; opacity: 0; display: flex; align-items: center; gap: 12px; padding: 12px 18px; border-radius: 18px; background: var(--panel); border: 1.5px solid color-mix(in srgb, var(--accent) 45%, transparent); box-shadow: 0 16px 40px #0008; font: 700 ${B.short ? 26 : 30}px var(--head); }
  .pmc.left { flex-direction: row-reverse; text-align: end; }
  .pmi { flex: none; width: ${B.short ? 40 : 46}px; height: ${B.short ? 40 : 46}px; border-radius: 12px; display: grid; place-items: center; background: color-mix(in srgb, var(--accent) 22%, transparent); color: var(--accent); } .pmi svg { width: 26px; height: 26px; }

  /* transitions between scenes */
  #wipe { position: absolute; top: -10%; bottom: -10%; left: -15%; width: 130%; z-index: 90; background: linear-gradient(90deg, var(--accent), var(--cta)); transform: translateX(-120%); }
  #iris { position: absolute; inset: 0; z-index: 90; background: var(--accent); clip-path: circle(0% at 50% 50%); }
  #slices { position: absolute; inset: 0; z-index: 91; pointer-events: none; overflow: hidden; }
  #slices i { position: absolute; left: 0; width: 100%; height: ${100 / 6}%; transform: translateX(-110%) skewX(-20deg); }
  #slices i:nth-child(odd) { background: var(--accent); } #slices i:nth-child(even) { background: var(--cta); }
  ${Array.from({ length: 6 }, (_, i) => `#slices i:nth-child(${i + 1}) { top: ${((100 / 6) * i).toFixed(3)}%; }`).join(" ")}
  `;
}
