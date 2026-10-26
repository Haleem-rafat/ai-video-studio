import { brandPaths } from "../brand/brand.ts";
import { ARABIC, karaoke } from "./arena.ts";
import { placeVersus, type VersusScene } from "./versus.ts";
import { FORMATS, type Channel } from "../config.ts";
import type { Product, Project } from "../types.ts";

/**
 * A "pros and cons" video: a review and a comparison at once. Each chapter
 * opens on a chapter card, compares the specs, explains one term on a sticky
 * note, then stamps each product's pros (green) and cons (red) one by one, and
 * ends on the chapter's winner. A ledger at the top counts every pro, con and
 * chapter won; a warning-tape chapter lists the problems reviewers found; the
 * score is counted up; and the verdict says who should buy which.
 */

const esc = (text: unknown) => String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const r = (n: number) => Math.round(n * 1000) / 1000;
/** "وiPhone" draws the و beside a Latin word; a space keeps it legible. */
const unglue = (text: string) => text.replace(/(^|\s)([وب])(?=[A-Za-z0-9$])/g, "$1$2 ");

export type Point = { side: "a" | "b"; good: boolean; text: string };

// A run of English words, numbers and their signs: "A20 Pro", "$50", "2nm", "Tom's".
const LATIN_RUN = /[A-Za-z0-9$€£%](?:[A-Za-z0-9$€£%.,'’+\-/ ]*[A-Za-z0-9$€£%'’])?/g;

/**
 * An Arabic line that mixes in English and numbers, as HTML: always laid out
 * right to left (a line starting "A20 Pro…" would otherwise be laid out as
 * English and scramble the Arabic), each English or number run kept whole and
 * left to right inside it, so "$50" never shows as "50$".
 */
export function arabicLine(text: string): string {
  const line = unglue(text);
  let out = "";
  let last = 0;
  for (const match of line.matchAll(LATIN_RUN)) {
    out += `${esc(line.slice(last, match.index))}<bdi dir="ltr">${esc(match[0])}</bdi>`;
    last = match.index! + match[0].length;
  }
  return `<bdi dir="rtl">${out}${esc(line.slice(last))}</bdi>`;
}

/** A chapter's points in the order they're stamped: the pros of both, then the cons of both, alternating sides. */
export function pointsOf(visual: VersusScene["visual"]): Point[] {
  const weave = (list: { a: string[]; b: string[] } | undefined, good: boolean): Point[] => {
    const out: Point[] = [];
    for (let i = 0; i < Math.max(list?.a.length ?? 0, list?.b.length ?? 0); i++) {
      if (list?.a[i]) out.push({ side: "a", good, text: list.a[i] });
      if (list?.b[i]) out.push({ side: "b", good, text: list.b[i] });
    }
    return out;
  };
  return [...weave(visual.pros, true), ...weave(visual.cons, false)];
}

/** When each part of a chapter lands, in seconds from its start: rows, the term, the points, the winner. */
export function chapterTimes(scene: Pick<VersusScene, "seconds" | "visual">): { rows: number[]; explain: number; points: number[]; verdict: number } {
  const D = scene.seconds;
  const rows = scene.visual.rows.map((_, i) => r(0.3 + i * Math.min(1.2, (D * 0.2) / Math.max(1, scene.visual.rows.length))));
  const explain = r(Math.min(D * 0.22, 6));
  const points = pointsOf(scene.visual);
  const from = D * 0.32;
  const span = D * 0.88 - from;
  return { rows, explain, points: points.map((_, i) => r(from + (span * i) / Math.max(1, points.length))), verdict: r(Math.max(from + span, D - 1.2)) };
}

/** The final count: topic chapters won, and every pro and con, per side. */
export function tallyOf(scenes: Pick<VersusScene, "visual">[]): { wins: { a: number; b: number }; pros: { a: number; b: number }; cons: { a: number; b: number } } {
  const t = { wins: { a: 0, b: 0 }, pros: { a: 0, b: 0 }, cons: { a: 0, b: 0 } };
  for (const scene of scenes) {
    const v = scene.visual;
    // Only topic chapters are won; the problems chapter is weighed in the pros and cons.
    if ((v.kind ?? "chapter") === "chapter" && (v.verdict === "a" || v.verdict === "b")) t.wins[v.verdict]++;
    for (const point of pointsOf(v)) t[point.good ? "pros" : "cons"][point.side]++;
  }
  return t;
}

type Layout = {
  short: boolean;
  ledger: number;
  rows: { top: number; width: number; size: number };
  note: { top: number; width: number; size: number };
  cols: { top: number; width: number; gap: number; size: number };
  caption: { top: number; size: number; words: number };
  card: number;
};

function layoutFor(project: Project): Layout {
  if (project.format === "short") {
    // Shorts keep words out of YouTube's bottom overlay (~380px).
    return {
      short: true,
      ledger: 70,
      rows: { top: 300, width: 980, size: 40 },
      note: { top: 560, width: 900, size: 34 },
      cols: { top: 760, width: 490, gap: 30, size: 32 },
      caption: { top: 1350, size: 50, words: 5 },
      card: 130,
    };
  }
  return {
    short: false,
    ledger: 26,
    rows: { top: 140, width: 1240, size: 34 },
    note: { top: 380, width: 1100, size: 30 },
    cols: { top: 500, width: 780, gap: 60, size: 30 },
    caption: { top: 930, size: 40, words: 8 },
    card: 170,
  };
}

/** Something behind a scene: a product's footage, or a photo. */
export type Backdrop = { path: string; clip: boolean; seconds?: number; fit?: "cover" | "contain" };

/** Both products' footage and photos, taken in turn: two clips, then a photo, so most of the video moves. */
export function mediaPool(a: Pick<Product, "photos" | "clips">, b: Pick<Product, "photos" | "clips">): Backdrop[] {
  const weave = <T>(x: T[], y: T[]) => Array.from({ length: Math.max(x.length, y.length) }, (_, i) => [x[i], y[i]]).flat().filter((item): item is T => item !== undefined);
  const clips = weave(a.clips ?? [], b.clips ?? []).map((clip) => ({ path: clip.path, clip: true, seconds: clip.seconds }));
  const photos = weave((a.photos ?? []).filter((p) => p.path), (b.photos ?? []).filter((p) => p.path)).map((photo) => ({ path: photo.path!, clip: false, fit: photo.fit }));
  const out: Backdrop[] = [];
  while (clips.length || photos.length) out.push(...clips.splice(0, 2), ...photos.splice(0, 1));
  return out;
}

/**
 * What plays behind a scene and when (seconds from its start): the intro is
 * a fast montage of 1.1s cuts; a chapter changes every few seconds, a clip
 * never longer than it lasts. Each scene starts at its own place in the pool.
 */
export function backdropPlan(seconds: number, k: number, pool: Backdrop[], intro: boolean): { item: Backdrop; at: number; len: number }[] {
  if (!pool.length) return [];
  const plan: { item: Backdrop; at: number; len: number }[] = [];
  let t = 0;
  for (let i = intro ? 0 : k * 3; t < seconds + 0.4; i++) {
    const item = pool[i % pool.length];
    const most = item.clip ? Math.max(1, (item.seconds ?? 2) - 1.4) : 6;
    const len = r(intro ? Math.min(1.1, most) : Math.min(6, most));
    plan.push({ item, at: r(t), len });
    t += len;
    if (plan.length > 60) break;
  }
  return plan;
}

export function buildProsCons(project: Project, channel: Channel): string {
  if (!project.versus) throw new Error("This project has no products to compare");
  const { a, b, hook } = project.versus;
  const { width, height } = FORMATS[project.format];
  const L = layoutFor(project);
  const accent = channel.colors.accent;
  const arabic = channel.language === "ar";
  const font = arabic ? "Cairo, 'SF Arabic', sans-serif" : "Inter, -apple-system, sans-serif";
  const { scenes, outro, total } = placeVersus(project);
  const brand = brandPaths(channel);
  const start = arabic ? "right" : "left";
  const line = (text: string) => (arabic ? arabicLine(text) : `<bdi>${esc(unglue(text))}</bdi>`);
  const end = arabic ? "left" : "right";
  const W = {
    chapter: arabic ? "الفصل" : "CHAPTER",
    pros: arabic ? "مميزات" : "PROS",
    cons: arabic ? "عيوب" : "CONS",
    what: arabic ? "يعني إيه" : "What is",
    wins: arabic ? "كسب الفصل" : "wins the chapter",
    tie: arabic ? "تعادل" : "Tie",
    problems: arabic ? "تحذير" : "WARNING",
    score: arabic ? "فصول كسبها" : "chapters won",
    buy: arabic ? "اشتري" : "Buy",
    ifYou: arabic ? "لو" : "if",
  };

  const pool = mediaPool(a, b);

  const tally = tallyOf(scenes);
  const name = (side: "a" | "b") => (side === "a" ? a : b);
  const backgrounds: string[] = [];
  const blocks: string[] = [];
  let chapter = 0;

  const data = scenes.map((scene, k) => {
    const v = scene.visual;
    const kind = k === 0 ? "intro" : (v.kind ?? "chapter");
    const own = (v.gallery ?? []).filter((photo) => photo.path).map((photo) => ({ path: photo.path!, clip: false, fit: photo.fit }));
    const plan = backdropPlan(scene.seconds, k, own.length ? own : pool, k === 0);
    // A clip plays from its first frame for exactly as long as it shows (with the fades around it).
    plan.forEach(({ item, at, len }, j) =>
      backgrounds.push(
        item.clip
          ? `<div class="bgp clip" id="bg${k}_${j}"><video src="${item.path}" muted playsinline data-start="${r(Math.max(0, scene.start + at - 0.5))}" data-duration="${r(Math.min(len + 1.1, (item.seconds ?? len) - 0.05))}" data-media-start="0" data-track-index="3"></video></div>`
          : `<div class="bgp${item.fit === "contain" ? " fit" : ""}" id="bg${k}_${j}"><img src="${item.path}" /></div>`,
      ),
    );
    const times = chapterTimes(scene);
    const points = pointsOf(v);

    if (kind !== "intro") {
      const numbered = kind === "chapter" || kind === "problems";
      if (numbered) chapter++;
      const label = kind === "problems" ? `⚠ ${W.problems}` : numbered ? `${W.chapter} ${chapter}` : "";
      blocks.push(`<div class="card${kind === "problems" ? " warn" : ""}" id="cc${k}">${kind === "problems" ? `<div class="tape t1"></div><div class="tape t2"></div>` : ""}<div class="cn">${esc(label)}</div><div class="ct"><bdi>${esc(v.title)}</bdi></div></div>`);
    }

    if (kind === "chapter" || kind === "problems") {
      const rows = v.rows
        .map(
          (row, j) =>
            `<div class="row" id="rw${k}_${j}"><div class="rv ra${row.winner === "a" ? " won" : ""}"><bdi>${esc(unglue(row.a))}</bdi></div><div class="rl"><bdi>${esc(row.label ?? "")}</bdi></div><div class="rv rb${row.winner === "b" ? " won" : ""}"><bdi>${esc(unglue(row.b))}</bdi></div></div>`,
        )
        .join("");
      const note = v.explain ? `<div class="note" id="nt${k}"><b><bdi>${esc(W.what)} ${esc(v.explain.term)}${arabic ? "؟" : "?"}</bdi></b><span>${line(v.explain.meaning)}</span></div>` : "";
      const column = (side: "a" | "b") =>
        `<div class="col c${side}"><div class="ch"><i style="background:${name(side).color}"></i><bdi>${esc(name(side).short)}</bdi></div>${points
          .map((point, j) => (point.side === side ? `<div class="pt ${point.good ? "good" : "bad"}" id="pt${k}_${j}"><span class="mk">${point.good ? "✓" : "✕"}</span>${line(point.text)}</div>` : ""))
          .join("")}</div>`;
      const winner = v.verdict === "a" || v.verdict === "b" ? `🏆 <bdi>${esc(name(v.verdict).short)}</bdi> ${esc(W.wins)}` : `🤝 ${esc(W.tie)}`;
      const bare = !rows && !note;
      blocks.push(
        `<div class="ch-body${kind === "problems" ? " problems" : ""}${bare ? " bare" : ""}" id="cb${k}"><div class="ctitle">${kind === "problems" ? "⚠ " : ""}<bdi>${esc(v.title)}</bdi></div>${rows ? `<div class="rows">${rows}</div>` : ""}${note}<div class="cols">${column("a")}${column("b")}</div><div class="win${v.verdict === "tie" || !v.verdict ? " tie" : ""}" id="wn${k}">${winner}</div></div>`,
      );
    }

    if (kind === "score") {
      const side = (s: "a" | "b") =>
        `<div class="sc s${s}"><div class="sn" style="color:${name(s).color}"><bdi>${esc(name(s).name)}</bdi></div><div class="big" id="sw${s}${k}">0</div><div class="sl">${esc(W.score)}</div><div class="pc"><span class="g">✓ <b id="sp${s}${k}">0</b></span><span class="x">✕ <b id="sx${s}${k}">0</b></span></div></div>`;
      blocks.push(`<div class="score" id="sc${k}">${side("a")}<div class="dash">–</div>${side("b")}</div>`);
    }

    if (kind === "verdict") {
      const buyer = (s: "a" | "b") =>
        `<div class="buy b${s}" id="by${s}${k}" style="border-color:${name(s).color}">${name(s).image ? `<img src="${name(s).image}" />` : ""}<div class="bt">${esc(W.buy)} <bdi style="color:${name(s).color}">${esc(name(s).short)}</bdi> ${esc(W.ifYou)}…</div><div class="bw">${line(v.buyers?.[s] ?? "")}</div></div>`;
      blocks.push(`<div class="verdict" id="vd${k}">${v.buyers ? buyer("a") + buyer("b") : ""}</div>`);
    }

    const lines = karaoke(scene, L.caption.words);
    lines.forEach((line, j) => blocks.push(`<div class="cl" id="cl${k}_${j}"><div>${line.words.map((word) => `<span class="w"${ARABIC.test(word) ? "" : ' dir="ltr"'}>${esc(word)}</span>`).join(" ")}</div></div>`));

    return {
      kind,
      start: scene.start,
      dur: r(scene.seconds),
      cuts: plan.map((step) => step.at),
      clips: plan.map((step) => step.item.clip),
      rows: times.rows,
      explain: v.explain ? times.explain : -1,
      points: points.map((point, j) => ({ at: times.points[j], side: point.side, good: point.good })),
      verdict: times.verdict,
      winner: v.verdict ?? "",
      lines: lines.map((line) => line.at),
    };
  });

  const audio = scenes.map((scene, k) => `<audio id="a${k}" data-start="${scene.start}" data-duration="${r(scene.seconds)}" data-track-index="2" src="${scene.audio!.path}"></audio>`).join("\n  ");
  const hookWords = String(hook ?? "").split(/\s+/).filter(Boolean);
  const ledger = (s: "a" | "b") =>
    `<div class="lg l${s}"><i style="background:${name(s).color}"></i><bdi class="ln">${esc(name(s).short)}</bdi><span class="g">✓ <b id="lp${s}">0</b></span><span class="x">✕ <b id="lx${s}">0</b></span><span class="t">🏆 <b id="lw${s}">0</b></span></div>`;
  const hero = (s: "a" | "b") => `<div class="hero h${s}">${name(s).image ? `<img src="${name(s).image}" />` : ""}<div class="hn" style="color:${name(s).color}"><bdi>${esc(name(s).name)}</bdi></div></div>`;

  return `<!doctype html>
<html lang="${arabic ? "ar" : "en"}" dir="${arabic ? "rtl" : "ltr"}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=${width}, height=${height}" />
<title>${esc(project.title)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cairo:wght@600;800;900&family=Inter:wght@700;900&display=block" />
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #08080b; }
  #root { position: relative; width: ${width}px; height: ${height}px; overflow: hidden; font-family: ${font}; color: #fff; background: #08080b; }
  .bgp { position: absolute; inset: -4%; opacity: 0; }
  .bgp img, .bgp video { width: 100%; height: 100%; object-fit: cover; display: block; }
  .bgp.fit { background: radial-gradient(circle at 50% 45%, #24242c, #08080b 70%); }
  .bgp.fit img { object-fit: contain; padding: 10%; }
  /* Light enough that the footage is seen; the panels carry their own backgrounds. */
  #shade { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 40%, #08080b55 0%, #08080bad 70%, #08080bdd 100%); }
  /* Darkens the footage while the score and the verdict are read. */
  #veil { position: absolute; inset: 0; background: #08080b; opacity: 0; }
  #grid { position: absolute; inset: 0; opacity: .06; background-image: linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px); background-size: 60px 60px; }

  /* The ledger: every pro, con and chapter won, counted as they land. */
  #ledger { position: absolute; top: ${L.ledger}px; left: ${L.short ? 30 : 40}px; right: ${L.short ? 30 : 40}px; display: flex; justify-content: space-between; z-index: 50; opacity: 0; ${L.short ? "gap: 12px;" : ""} }
  .lg { display: flex; align-items: center; gap: ${L.short ? 12 : 16}px; padding: ${L.short ? "8px 14px" : "10px 20px"}; border-radius: 18px; background: #000000b0; border: 1px solid #ffffff22; font: 800 ${L.short ? 28 : 28}px ${font}; }
  .lg > i { width: 16px; height: 16px; border-radius: 50%; box-shadow: 0 0 12px currentColor; }
  .lg .ln { font-family: Inter, sans-serif; font-weight: 900; direction: ltr; }
  .g { color: #3ddc84; } .x { color: #ff4d5e; } .t { color: #ffd23f; }
  .lg b { display: inline-block; min-width: 1.1em; text-align: center; font-family: Inter, sans-serif; }

  /* The intro. */
  .hero { position: absolute; bottom: ${L.short ? 520 : 70}px; width: ${L.short ? 460 : 560}px; height: ${L.short ? 620 : 640}px; z-index: 20; opacity: 0; text-align: center; }
  .ha { ${start}: ${L.short ? 40 : 160}px; } .hb { ${end}: ${L.short ? 40 : 160}px; }
  .hero img { width: 100%; height: 82%; object-fit: contain; filter: drop-shadow(0 30px 40px #000d); }
  .hn { font: 900 ${L.short ? 44 : 46}px Inter, sans-serif; direction: ltr; text-shadow: 0 4px 0 #000; }
  #hook { position: absolute; left: 60px; right: 60px; top: ${L.short ? 300 : 120}px; text-align: center; z-index: 30; font: 900 ${L.short ? 92 : 96}px/1.2 ${font}; }
  #hook .hw { display: inline-block; opacity: 0; margin: 0 .12em; text-shadow: 0 6px 0 #000, 0 0 40px #000; }
  #hook .hw.hot { color: #ffd23f; }

  /* A chapter card, between chapters. */
  .card { position: absolute; inset: 0; z-index: 60; display: flex; flex-direction: column; align-items: center; justify-content: center; opacity: 0; background: radial-gradient(circle, #15151bf2, #08080bfa 70%); }
  .card .cn { font: 900 ${L.card * 0.36}px Inter, ${font}; letter-spacing: 6px; color: ${accent}; }
  .card .ct { font: 900 ${L.card}px/1.1 ${font}; text-align: center; padding: 0 60px; text-shadow: 0 8px 0 #000; }
  .card.warn .cn { color: #111; background: #ffd23f; padding: 6px 28px; border-radius: 10px; letter-spacing: 2px; }
  .tape { position: absolute; left: -10%; right: -10%; height: 70px; background: repeating-linear-gradient(-45deg, #ffd23f 0 40px, #111 40px 80px); opacity: .9; }
  .tape.t1 { top: 14%; transform: rotate(-4deg); } .tape.t2 { bottom: 14%; transform: rotate(3deg); }

  /* A chapter: specs, the term, the two columns, the winner. */
  .ch-body { position: absolute; inset: 0; z-index: 30; opacity: 0; }
  .rows { position: absolute; top: ${L.rows.top}px; left: 50%; width: ${L.rows.width}px; margin-left: -${L.rows.width / 2}px; display: flex; flex-direction: column; gap: 10px; }
  .row { display: grid; grid-template-columns: 1fr ${L.short ? 260 : 300}px 1fr; align-items: center; padding: 10px 18px; border-radius: 16px; background: #000000b8; border: 1px solid #ffffff1f; opacity: 0; }
  .rl { text-align: center; font: 800 ${L.rows.size * 0.75}px ${font}; color: #ffffffaa; }
  .rv { text-align: center; font: 900 ${L.rows.size}px/1.2 ${font}; unicode-bidi: plaintext; padding: 4px 10px; border-radius: 12px; }
  .ra { color: ${a.color}; } .rb { color: ${b.color}; }
  .rv.won { background: #3ddc8426; box-shadow: inset 0 0 0 2px #3ddc84aa; }
  .note { position: absolute; top: ${L.note.top}px; left: 50%; width: ${L.note.width}px; margin-left: -${L.note.width / 2}px; padding: 14px 24px; background: #ffd23f; color: #111; border-radius: 6px;
    transform: rotate(${arabic ? 1.2 : -1.2}deg); box-shadow: 0 16px 30px #0009; opacity: 0; display: flex; gap: 14px; align-items: baseline; font: 700 ${L.note.size}px/1.35 ${font}; }
  .note b { font-weight: 900; white-space: nowrap; }
  .cols { position: absolute; top: ${L.cols.top}px; left: 50%; width: ${L.cols.width * 2 + L.cols.gap}px; margin-left: -${(L.cols.width * 2 + L.cols.gap) / 2}px; display: grid; grid-template-columns: 1fr 1fr; gap: ${L.cols.gap}px; }
  .col { display: flex; flex-direction: column; gap: 10px; }
  .ch { display: flex; align-items: center; gap: 12px; font: 900 ${L.cols.size * 1.15}px Inter, sans-serif; direction: ltr; justify-content: center; margin-bottom: 4px; text-shadow: 0 3px 0 #000; }
  .ch i { width: 14px; height: 14px; border-radius: 50%; }
  .pt { display: flex; align-items: center; gap: 14px; padding: 10px 16px; border-radius: 14px; font: 800 ${L.cols.size}px/1.3 ${font}; opacity: 0; box-shadow: 0 10px 24px #0008; }
  .pt.good { background: linear-gradient(${arabic ? 270 : 90}deg, #0f3b24f0, #0b1f15e6); border: 2px solid #3ddc84aa; }
  .pt.bad { background: linear-gradient(${arabic ? 270 : 90}deg, #47121af0, #220b0fe6); border: 2px solid #ff4d5eaa; }
  .mk { flex: none; width: ${L.cols.size * 1.3}px; height: ${L.cols.size * 1.3}px; border-radius: 50%; display: grid; place-items: center; font: 900 ${L.cols.size * 0.85}px Inter; color: #000; }
  .good .mk { background: #3ddc84; } .bad .mk { background: #ff4d5e; }
  .problems .pt.bad { border-width: 3px; }
  .ctitle { position: absolute; top: ${L.short ? 160 : 34}px; left: 50%; transform: translateX(-50%); white-space: nowrap; padding: 6px 26px; border-radius: 999px; background: ${accent}; font: 900 ${L.short ? 40 : 34}px ${font}; box-shadow: 0 8px 24px #0008; }
  .problems .ctitle { background: repeating-linear-gradient(-45deg, #ffd23f 0 22px, #111 22px 44px); color: #fff; text-shadow: 0 2px 0 #000, 0 0 10px #000; }
  .bare .cols { top: ${L.rows.top + (L.short ? 40 : 30)}px; }
  .win { position: absolute; left: 50%; top: ${L.short ? 1210 : 860}px; transform: translateX(-50%); white-space: nowrap; padding: 10px 34px; border-radius: 999px; font: 900 ${L.short ? 44 : 38}px ${font};
    background: #ffd23f; color: #111; box-shadow: 0 0 40px #ffd23f88; opacity: 0; }
  .win.tie { background: #ffffffdd; box-shadow: none; }

  /* The score, counted up. */
  .score { position: absolute; inset: 0; z-index: 30; display: flex; align-items: center; justify-content: center; gap: ${L.short ? 10 : 80}px; opacity: 0; ${L.short ? "flex-direction: column; justify-content: flex-start; padding-top: 300px;" : ""} }
  .sc { text-align: center; } .sn { font: 900 ${L.short ? 52 : 50}px Inter, sans-serif; direction: ltr; }
  .sc .big { font: 900 ${L.short ? 150 : 240}px/1 Inter, sans-serif; text-shadow: 0 10px 0 #000; }
  .sl { font: 800 ${L.short ? 38 : 34}px ${font}; color: #ffffffaa; }
  .pc { display: flex; gap: 30px; justify-content: center; margin-top: 14px; font: 900 ${L.short ? 50 : 46}px Inter, sans-serif; }
  .dash { font: 900 ${L.short ? 70 : 120}px/1 Inter; color: #ffffff55; }

  /* Who should buy which. */
  .verdict { position: absolute; inset: 0; z-index: 30; display: flex; align-items: center; justify-content: center; gap: 40px; padding: 0 60px; ${L.short ? "flex-direction: column; justify-content: flex-start; padding-top: 290px;" : "padding-bottom: 120px;"} }
  .buy { flex: ${L.short ? "none" : 1}; width: ${L.short ? "100%" : "auto"}; max-width: ${L.short ? 960 : 820}px; display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 22px 30px; border-radius: 26px; background: #000000c8; border: 3px solid; opacity: 0; }
  .buy img { height: ${L.short ? 170 : 260}px; object-fit: contain; filter: drop-shadow(0 20px 30px #000c); }
  .bt { font: 900 ${L.short ? 46 : 42}px ${font}; } .bt bdi { font-family: Inter, sans-serif; }
  .bw { font: 700 ${L.short ? 38 : 34}px/1.4 ${font}; text-align: center; color: #ffffffdd; }

  /* Karaoke captions. */
  .cl { position: absolute; top: ${L.caption.top}px; left: 60px; right: 60px; min-height: ${L.caption.size * 2.6}px; display: flex; align-items: center; justify-content: center; text-align: center; z-index: 45; opacity: 0; }
  .cl > div { font: 900 ${L.caption.size}px/1.35 ${font}; direction: ${arabic ? "rtl" : "ltr"}; text-shadow: 0 4px 0 #000, 0 0 24px #000; }
  .cl .w { display: inline-block; padding: 0 6px; border-radius: 10px; color: #ffffffcc; }

  #badge { position: absolute; ${L.short ? "top: 1500px" : "bottom: 14px"}; ${end}: 30px; display: flex; align-items: center; gap: 10px; padding: 5px 16px 5px 5px; border-radius: 999px; background: #0009; border: 1px solid #ffffff26; font: 800 22px Inter; direction: ltr; z-index: 52; opacity: .85; }
  #badge img { width: 38px; height: 38px; border-radius: 50%; object-fit: cover; }
  #flash { position: absolute; inset: 0; background: #fff; opacity: 0; z-index: 90; pointer-events: none; }
  #sub { position: absolute; left: 50%; top: ${L.short ? 1150 : 820}px; transform: translateX(-50%); z-index: 70; opacity: 0; display: flex; gap: 18px; align-items: center; white-space: nowrap; }
  #sub .btn { background: #ff0033; color: #fff; padding: 18px 46px; border-radius: 999px; font: 900 44px ${font}; box-shadow: 0 0 40px #ff003399; }
  #sub .btn.done { background: #3a3a40; box-shadow: none; }
  #sub .bell { font-size: 54px; }
  #cursor { position: absolute; left: 50%; top: ${(L.short ? 1150 : 820) + 70}px; width: 54px; z-index: 71; opacity: 0; }
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${total}" data-width="${width}" data-height="${height}">
 <div id="world">
  ${backgrounds.join("\n  ")}
  <div id="shade"></div>
  <div id="veil"></div>
  <div id="grid"></div>
  ${hero("a")}${hero("b")}
  <div id="hook">${hookWords.map((word, i) => `<span class="hw${i === hookWords.length - 1 || /\d|\$/.test(word) ? " hot" : ""}">${esc(unglue(word))}</span>`).join(" ")}</div>
  ${blocks.join("\n  ")}
  <div id="sub"><span class="bell">🔔</span><span class="btn" id="subBtn">${arabic ? "اشترك" : "Subscribe"}</span></div>
  <svg id="cursor" viewBox="0 0 24 24"><path d="M4 2l16 10-7 1.5L9.5 21z" fill="#fff" stroke="#000" stroke-width="1.2"/></svg>
 </div>
 <div id="ledger">${ledger("a")}${ledger("b")}</div>
 <div id="badge">${brand.logo ? `<img src="${brand.logo}" />` : ""}<span>${esc(channel.brand?.handle ?? channel.name)}</span></div>
 <div id="flash"></div>
 ${audio}
</div>
<script>
window.__timelines = window.__timelines || {};
const D = ${JSON.stringify(data)};
const TOTAL = ${total}, OUTRO = ${outro}, DIR = ${arabic ? -1 : 1}, SHORT = ${L.short};
const T = ${JSON.stringify(tally)};
const SUBSCRIBED = ${JSON.stringify(arabic ? "تم الاشتراك ✓" : "Subscribed ✓")};
const tl = gsap.timeline({ paused: true });

// Photos drift behind everything.
D.forEach((s, k) => s.cuts.forEach((c, j) => {
  const id = '#bg' + k + '_' + j;
  const t = s.start + c;
  const next = j + 1 < s.cuts.length ? s.start + s.cuts[j + 1] : (k + 1 < D.length ? D[k + 1].start - .8 : OUTRO + 5);
  const fade = k === 0 ? .15 : .5;
  tl.fromTo(id, { opacity: 0 }, { opacity: 1, duration: fade, immediateRender: false }, Math.max(0, t - fade));
  // Photos drift (Ken Burns); footage already moves, so it only breathes.
  const zoom = s.clips[j] ? [1.02, 1.08] : [j % 2 ? 1.16 : 1.04, j % 2 ? 1.04 : 1.16];
  tl.fromTo(id, { scale: zoom[0], xPercent: s.clips[j] ? 0 : (j % 2 ? 2 : -2) * DIR }, { scale: zoom[1], xPercent: s.clips[j] ? 0 : (j % 2 ? -1 : 2) * DIR, duration: Math.max(1, next - t + 1), ease: 'none', immediateRender: false }, Math.max(0, t - fade));
  if (k === 0 && j > 0) tl.fromTo('#flash', { opacity: .25 }, { opacity: 0, duration: .2, immediateRender: false }, t);
  tl.to(id, { opacity: 0, duration: fade }, next + (k === 0 ? 0 : .2));
}));

// The intro: both products rise in, the hook word by word, then the ledger.
const I = D[0];
tl.fromTo('.ha', { opacity: 0, y: 160 }, { opacity: 1, y: 0, duration: .7, ease: 'power3.out', immediateRender: false }, .2);
tl.fromTo('.hb', { opacity: 0, y: 160 }, { opacity: 1, y: 0, duration: .7, ease: 'power3.out', immediateRender: false }, .45);
document.querySelectorAll('#hook .hw').forEach((w, i) => tl.fromTo(w, { opacity: 0, y: 30, scale: 1.6 }, { opacity: 1, y: 0, scale: 1, duration: .35, ease: 'back.out(2)', immediateRender: false }, .5 + i * .22));
tl.fromTo('#ledger', { opacity: 0, y: -30 }, { opacity: 1, y: 0, duration: .5, ease: 'power2.out', immediateRender: false }, Math.max(1.5, I.start + I.dur * .6));
tl.to(['.hero', '#hook'], { opacity: 0, duration: .4 }, I.start + I.dur + .1);

// Counters in the ledger.
const count = { pa: 0, pb: 0, xa: 0, xb: 0, wa: 0, wb: 0 };
const bump = (id, value, at) => {
  tl.set(id, { textContent: value }, at);
  tl.fromTo(id, { scale: 1.9 }, { scale: 1, duration: .45, ease: 'back.out(3)', immediateRender: false }, at);
};

D.forEach((s, k) => {
  if (k === 0) return;
  const end = s.start + s.dur;
  // The chapter card fills the gap before the voice.
  const card = '#cc' + k;
  tl.fromTo(card, { opacity: 0, scale: 1.25 }, { opacity: 1, scale: 1, duration: .35, ease: 'power3.out', immediateRender: false }, s.start - 1.35);
  tl.fromTo(card + ' .ct', { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: .35, ease: 'back.out(2)', immediateRender: false }, s.start - 1.15);
  tl.to(card, { opacity: 0, scale: .92, duration: .3 }, s.start + .15);

  if (s.kind === 'chapter' || s.kind === 'problems') {
    const body = '#cb' + k;
    tl.fromTo(body, { opacity: 0 }, { opacity: 1, duration: .3, immediateRender: false }, s.start + .1);
    s.rows.forEach((at, j) => tl.fromTo('#rw' + k + '_' + j, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: .35, ease: 'power2.out', immediateRender: false }, s.start + at));
    if (s.explain >= 0) tl.fromTo('#nt' + k, { opacity: 0, scale: .6, rotation: -8 * DIR }, { opacity: 1, scale: 1, rotation: 1.2 * DIR, duration: .45, ease: 'back.out(2.2)', immediateRender: false }, s.start + s.explain);
    s.points.forEach((p, j) => {
      const at = s.start + p.at;
      tl.fromTo('#pt' + k + '_' + j, { opacity: 0, x: (p.side === 'a' ? -60 : 60) * DIR, scale: .9 }, { opacity: 1, x: 0, scale: 1, duration: .35, ease: 'back.out(1.8)', immediateRender: false }, at);
      tl.from('#pt' + k + '_' + j + ' .mk', { scale: 0, rotation: -90, duration: .35, ease: 'back.out(3)' }, at + .12);
      const key = (p.good ? 'p' : 'x') + p.side;
      bump('#l' + (p.good ? 'p' : 'x') + p.side, ++count[key], at + .15);
    });
    tl.fromTo('#wn' + k, { opacity: 0, scale: 2.2 }, { opacity: 1, scale: 1, duration: .4, ease: 'back.out(2)', immediateRender: false }, s.start + s.verdict);
    if (s.kind === 'chapter' && (s.winner === 'a' || s.winner === 'b')) {
      bump('#lw' + s.winner, ++count['w' + s.winner], s.start + s.verdict + .2);
      tl.fromTo('#flash', { opacity: .35 }, { opacity: 0, duration: .4, immediateRender: false }, s.start + s.verdict);
    }
    tl.to(body, { opacity: 0, duration: .3 }, end + .1);
  }

  if (s.kind === 'score' || s.kind === 'verdict') {
    tl.to('#veil', { opacity: .72, duration: .5 }, s.start - .4);
    if (s.kind === 'score') tl.to('#veil', { opacity: 0, duration: .5 }, end + .2);
  }

  if (s.kind === 'score') {
    tl.fromTo('#sc' + k, { opacity: 0 }, { opacity: 1, duration: .4, immediateRender: false }, s.start + .1);
    ['a', 'b'].forEach((side, n) => {
      const counters = [['#sw', T.wins[side]], ['#sp', T.pros[side]], ['#sx', T.cons[side]]];
      // Counted by tweening the text itself: frames are rendered by seeking, which runs no callbacks.
      counters.forEach(([id, value], m) => tl.fromTo(id + side + k, { textContent: 0 }, { textContent: value, snap: { textContent: 1 }, duration: 1.2, ease: 'power2.out', immediateRender: false }, s.start + .5 + n * .3 + m * .4));
    });
    tl.to('#sc' + k, { opacity: 0, duration: .3 }, end + .1);
  }

  if (s.kind === 'verdict') {
    tl.fromTo('#bya' + k, { opacity: 0, y: 60 }, { opacity: 1, y: 0, duration: .5, ease: 'back.out(1.6)', immediateRender: false }, s.start + .4);
    tl.fromTo('#byb' + k, { opacity: 0, y: 60 }, { opacity: 1, y: 0, duration: .5, ease: 'back.out(1.6)', immediateRender: false }, s.start + Math.min(s.dur * .4, 4));
    tl.to('#vd' + k, { opacity: 0, duration: .4 }, OUTRO - .3);
  }
});

// Karaoke captions.
D.forEach((s, k) => s.lines.forEach((at, j) => {
  const line = '#cl' + k + '_' + j;
  const t0 = s.start + at[0];
  const next = j + 1 < s.lines.length ? s.start + s.lines[j + 1][0] : s.start + s.dur + .2;
  tl.fromTo(line, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: .14, immediateRender: false }, t0 - .08);
  tl.to(line, { opacity: 0, duration: .08 }, next - .08);
  const words = document.querySelectorAll(line + ' .w');
  at.forEach((wt, n) => {
    const wEnd = n + 1 < at.length ? s.start + at[n + 1] : next - .1;
    tl.fromTo(words[n], { color: '#ffffffcc', backgroundColor: 'rgba(0,0,0,0)' }, { color: '#000', backgroundColor: '#ffd23f', duration: .08, immediateRender: false }, s.start + wt);
    tl.to(words[n], { color: '#fff', backgroundColor: 'rgba(0,0,0,0)', duration: .1 }, Math.max(s.start + wt + .1, wEnd));
  });
}));

// Subscribe.
tl.fromTo('#sub', { opacity: 0, scale: .6 }, { opacity: 1, scale: 1, duration: .45, ease: 'back.out(2)', immediateRender: false }, OUTRO);
tl.fromTo('#cursor', { opacity: 0, x: 200, y: 140 }, { opacity: 1, x: 60, y: 0, duration: .7, ease: 'power2.out', immediateRender: false }, OUTRO + .5);
tl.to('#subBtn', { scale: .92, duration: .08, yoyo: true, repeat: 1 }, OUTRO + 1.25);
tl.set('#subBtn', { textContent: SUBSCRIBED, className: 'btn done' }, OUTRO + 1.35);
tl.fromTo('.bell', { rotation: -25 }, { rotation: 25, duration: .12, yoyo: true, repeat: 5, immediateRender: false }, OUTRO + 1.5);
tl.to({}, { duration: .01 }, TOTAL - .01);
window.__timelines.main = tl;
</script>
</body>
</html>
`;
}
