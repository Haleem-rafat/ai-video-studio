# Instagram Clients Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Inside Marketing mode, save client businesses, suggest 5 Instagram post ideas per client every day from fresh niche trends, and make any idea into an infographic carousel, a single image or a reel with caption and hashtags.

**Architecture:** A new `src/clients/` module owns clients, ideas and posts as JSON files under `output/.clients/<id>/`. Carousels are typed slides rendered as HTML and screenshotted in Chrome (`src/render/carousel.ts`). Reels are ordinary marketing projects written by the existing `writeMarketing` and built by the existing `build`. Server routes live in `src/server/clients.ts`, which `src/server/index.ts` calls with one line. The screen gets one new page, `ClientView`.

**Tech Stack:** Node 25 (runs .ts directly), AI SDK `ai@7` through the Vercel AI Gateway (`generateText`, `Output.object`, `generateImage`), zod 4, puppeteer-core with the installed Google Chrome, React 19 + shadcn/ui, `node:test`.

**Spec:** `docs/superpowers/specs/2026-10-20-instagram-clients-design.md`

## Global Constraints

- **The current Marketing mode does not change.** No edits to `src/marketing/*`, `src/render/marketing*.ts`, `app/components/MarketingChat.tsx` or how marketing videos are written and rendered. Allowed edits to existing files are additions only: `src/pipeline.ts` (export `MARKETING_STYLE`), `src/server/index.ts` (one delegating call + start the schedule), `package.json` (`test` script), `app/router.ts`, `app/api.ts`, `app/App.tsx`, `app/components/Sidebar.tsx`, `app/components/MarketingPanel.tsx`.
- No new npm dependencies. Tests use `node --test`.
- Data lives in `output/.clients/<id>/` (`client.json`, `shots/`, `ideas/YYYY-MM-DD.json`, `posts/<postId>/`).
- Text model: `anthropic/claude-sonnet-5.5` (the writer `write.ts` uses). Trend search: `perplexity/sonar`. Pictures: `bfl/flux-3-image`, aspect `1:1`.
- Carousel slides are 1080×1350 PNG, 5–8 slides; a single image is 1 cover slide.
- Caption ≤ 2,200 characters including hashtags; ≤ 30 hashtags, stored without `#`.
- Daily ideas: exactly 5; ≥ 1 reel; ≥ 2 carousels; every goal (`awareness`, `details`, `offer`) at least once; no repeated angle in a batch; hook ≤ 120 characters and not a repeat of the last 14 days.
- The schedule makes a client's ideas once the local time is ≥ 08:00 and today's file is missing; it checks 10 s after start and every hour.
- Arabic clients write Egyptian colloquial Arabic, and slides use `dir="rtl"`.
- Light branding only: brand colours, brand fonts, small logo, `@handle`, slide counter. Never website screenshots or photos on slides.
- Numbers not in the brief are labelled as examples (`مثال` / `example`).

## Review Focus

1. **A client with no Instagram handle or no logo** should render slides without the handle or the logo and never print "@undefined" or a broken image. Test in Task 5.
2. **Very long Arabic text in a slide field** must shrink to fit, then truncate with "…", never spill off the 1350 px slide. Tests in Tasks 3 and 5.
3. **The trend search failing** (no Perplexity access, bad JSON) must still produce 5 ideas. Test in Task 4.
4. **Two "make" clicks on the same idea**, or a make while that client's ideas job runs, must not create two posts. The idea's `making` status blocks the second click. Test in Task 7.
5. **The Mac waking after 08:00 with the studio already open** must make today's ideas once, not every hour. Test in Task 7.

---

### Task 1: Client types, storage and `npm test`

**Files:**
- Create: `src/clients/types.ts`
- Create: `src/clients/store.ts`
- Create: `src/clients/store.test.ts`
- Modify: `package.json` (add a `test` script)

**Interfaces:**
- Produces: the types `Client`, `Idea`, `IdeaDay`, `Trend`, `Slide`, `Post`, `IdeaFormat`, `IdeaGoal`, `IdeaAngle`; the constants `IDEA_FORMATS`, `IDEA_GOALS`, `IDEA_ANGLES`; the functions `clientsDir()`, `clientDir(id)`, `loadClient`, `saveClient`, `listClients`, `ideasPath(id, date)`, `loadIdeas(id, date): Promise<IdeaDay | null>`, `saveIdeas(id, day)`, `recentIdeas(id, today, days): Promise<Idea[]>`, `postDir(clientId, postId)`, `loadPost`, `savePost`, `listPosts`, `localDate(date?)`, `slugify(text)`, `clientFromProject(project, now?)`.

- [ ] **Step 1: Write the types**

```ts
// src/clients/types.ts
import type { MarketingBrief, SiteBrand } from "../types.ts";

/**
 * A business whose Instagram the studio makes posts for. Its brand and brief
 * come from a marketing project or from reading its website once.
 */
export type Client = {
  id: string;
  name: string;
  url: string;
  /** Shown on slides, without "@". */
  instagramHandle?: string;
  language: "en" | "ar";
  /** Paths in it (logo, shots) are relative to the client's folder. */
  brand: SiteBrand;
  brief: MarketingBrief;
  /** The niche ideas are researched in, e.g. "booking pages for coaches". */
  niche: string;
  /** Claims or topics never to use. */
  avoid: string;
  dailyIdeas: boolean;
  createdAt: string;
  updatedAt: string;
};

export const IDEA_FORMATS = ["carousel", "single", "reel"] as const;
export const IDEA_GOALS = ["awareness", "details", "offer"] as const;
export const IDEA_ANGLES = ["myth", "mistakes", "list", "before-after", "trend", "how-to", "story", "stat", "question"] as const;

export type IdeaFormat = (typeof IDEA_FORMATS)[number];
export type IdeaGoal = (typeof IDEA_GOALS)[number];
export type IdeaAngle = (typeof IDEA_ANGLES)[number];

export type Trend = { title: string; summary: string; url: string };

export type Idea = {
  /** "<date>-<n>", n counting from 1 across the day's batches. */
  id: string;
  format: IdeaFormat;
  goal: IdeaGoal;
  angle: IdeaAngle;
  hook: string;
  outline: string[];
  why: string;
  trend?: string;
  status: "new" | "making" | "made" | "skipped";
  postId?: string;
};

export type IdeaDay = { date: string; trends: Trend[]; ideas: Idea[] };

/** A picture on a slide: the prompt it was drawn from and, once drawn, its file in the post folder. */
export type SlideArt = { prompt: string; file?: string };

export type Slide =
  | { layout: "cover"; title: string; subtitle?: string; art?: SlideArt }
  | { layout: "stat"; value: string; label: string; note?: string; art?: SlideArt }
  | { layout: "list"; title: string; items: string[]; art?: SlideArt }
  | { layout: "myth-fact"; myth: string; fact: string; art?: SlideArt }
  | { layout: "before-after"; before: string[]; after: string[]; art?: SlideArt }
  | { layout: "steps"; title: string; steps: string[]; art?: SlideArt }
  | { layout: "quote"; text: string; by?: string; art?: SlideArt }
  | { layout: "chart"; title: string; bars: { label: string; value: number }[]; unit?: string; art?: SlideArt }
  | { layout: "cta"; title: string; button: string; url: string; art?: SlideArt };

export type SlideLayout = Slide["layout"];

export type Post = {
  id: string;
  clientId: string;
  ideaId?: string;
  kind: "carousel" | "single" | "reel";
  slides?: Slide[];
  /** A reel: the marketing project that renders it. */
  projectId?: string;
  caption: string;
  /** Without "#". */
  hashtags: string[];
  status: "writing" | "drawing" | "rendering" | "done" | "failed";
  error?: string;
  createdAt: string;
  updatedAt: string;
};
```

- [ ] **Step 2: Write the failing tests**

```ts
// src/clients/store.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.CLIENTS_DIR = mkdtempSync(join(tmpdir(), "clients-"));
const store = await import("./store.ts");

const project = {
  id: "202610182235-marketing-short-risero-v2",
  marketing: {
    brand: { url: "https://diaaeziada.risero.io/", name: "Risero", language: "ar", logo: "shots/logo.png" },
    brief: { business: "Risero: صفحة شخصية", notes: "أرقام الداشبورد أمثلة", cta: { label: "احجز", url: "https://x" } },
  },
} as never;

test("clientFromProject copies brand and brief, and starts avoid from the notes", () => {
  const client = store.clientFromProject(project, "2026-10-20T08:00:00.000Z");
  assert.equal(client.id, "risero");
  assert.equal(client.name, "Risero");
  assert.equal(client.language, "ar");
  assert.equal(client.brand.logo, "shots/logo.png");
  assert.equal(client.avoid, "أرقام الداشبورد أمثلة");
  assert.equal(client.dailyIdeas, true);
});

test("a client round-trips through its folder", async () => {
  const client = store.clientFromProject(project, "2026-10-20T08:00:00.000Z");
  await store.saveClient(client);
  assert.equal((await store.loadClient("risero")).name, "Risero");
  assert.deepEqual((await store.listClients()).map((c) => c.id), ["risero"]);
});

test("ideas: a missing day is null, and recentIdeas reads the last days only", async () => {
  assert.equal(await store.loadIdeas("risero", "2026-10-20"), null);
  const idea = (id: string, hook: string) => ({ id, format: "carousel", goal: "awareness", angle: "list", hook, outline: [], why: "", status: "new" }) as const;
  await store.saveIdeas("risero", { date: "2026-10-01", trends: [], ideas: [idea("2026-10-01-1", "old")] });
  await store.saveIdeas("risero", { date: "2026-10-15", trends: [], ideas: [idea("2026-10-15-1", "recent")] });
  const recent = await store.recentIdeas("risero", "2026-10-20", 14);
  assert.deepEqual(recent.map((i) => i.hook), ["recent"]);
});

test("localDate uses the local calendar day", () => {
  assert.equal(store.localDate(new Date(2026, 9, 20, 23, 30)), "2026-10-20");
});

test("bad ids are refused", () => {
  assert.throws(() => store.clientDir("../etc"));
});
```

- [ ] **Step 3: Add the test script and run the tests to see them fail**

In `package.json` `scripts`, after `"typecheck"`, add:

```json
"test": "node --test \"src/**/*.test.ts\""
```

Run: `npm test`
Expected: FAIL with `Cannot find module '.../src/clients/store.ts'`.

- [ ] **Step 4: Write the store**

```ts
// src/clients/store.ts
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { OUTPUT_DIR } from "../config.ts";
import type { MarketingBrief, Project } from "../types.ts";
import type { Client, Idea, IdeaDay, Post } from "./types.ts";

/** output/.clients, or CLIENTS_DIR in tests. */
export function clientsDir(): string {
  return process.env.CLIENTS_DIR ?? join(OUTPUT_DIR, ".clients");
}

const ID = /^[a-z0-9-]+$/;

export function clientDir(id: string): string {
  if (!ID.test(id)) throw new Error(`Bad client id "${id}".`);
  return join(clientsDir(), id);
}

export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40).replace(/-$/, "");
}

/** YYYY-MM-DD on this Mac's calendar. */
export function localDate(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Writes through a temp file so a crash never leaves half a JSON file. */
async function writeJson(path: string, data: unknown): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(`${path}.tmp`, JSON.stringify(data, null, 2));
  await rename(`${path}.tmp`, path);
}

export async function loadClient(id: string): Promise<Client> {
  return JSON.parse(await readFile(join(clientDir(id), "client.json"), "utf8")) as Client;
}

export async function saveClient(client: Client): Promise<void> {
  client.updatedAt = new Date().toISOString();
  await writeJson(join(clientDir(client.id), "client.json"), client);
}

export async function listClients(): Promise<Client[]> {
  if (!existsSync(clientsDir())) return [];
  const entries = await readdir(clientsDir(), { withFileTypes: true });
  const clients = await Promise.all(entries.filter((e) => e.isDirectory() && ID.test(e.name)).map((e) => loadClient(e.name).catch(() => null)));
  return clients.filter((c): c is Client => c !== null).sort((a, b) => a.name.localeCompare(b.name));
}

export function ideasPath(id: string, date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Bad date "${date}".`);
  return join(clientDir(id), "ideas", `${date}.json`);
}

export async function loadIdeas(id: string, date: string): Promise<IdeaDay | null> {
  const path = ideasPath(id, date);
  return existsSync(path) ? (JSON.parse(await readFile(path, "utf8")) as IdeaDay) : null;
}

export async function saveIdeas(id: string, day: IdeaDay): Promise<void> {
  await writeJson(ideasPath(id, day.date), day);
}

/** Every idea of the `days` days before `today` (today included), oldest first. */
export async function recentIdeas(id: string, today: string, days: number): Promise<Idea[]> {
  const dir = join(clientDir(id), "ideas");
  if (!existsSync(dir)) return [];
  const from = new Date(`${today}T00:00:00`);
  from.setDate(from.getDate() - (days - 1));
  const first = localDate(from);
  const files = (await readdir(dir)).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f) && f.slice(0, 10) >= first && f.slice(0, 10) <= today).sort();
  const daysRead = await Promise.all(files.map(async (f) => JSON.parse(await readFile(join(dir, f), "utf8")) as IdeaDay));
  return daysRead.flatMap((day) => day.ideas);
}

export function postDir(clientId: string, postId: string): string {
  if (!ID.test(postId)) throw new Error(`Bad post id "${postId}".`);
  return join(clientDir(clientId), "posts", postId);
}

export async function loadPost(clientId: string, postId: string): Promise<Post> {
  return JSON.parse(await readFile(join(postDir(clientId, postId), "post.json"), "utf8")) as Post;
}

export async function savePost(post: Post): Promise<void> {
  post.updatedAt = new Date().toISOString();
  await writeJson(join(postDir(post.clientId, post.id), "post.json"), post);
}

export async function listPosts(clientId: string): Promise<Post[]> {
  const dir = join(clientDir(clientId), "posts");
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const posts = await Promise.all(entries.filter((e) => e.isDirectory()).map((e) => loadPost(clientId, e.name).catch(() => null)));
  return posts.filter((p): p is Post => p !== null).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** A client from a marketing project: its brand, brief and screenshots, no website read. The niche is filled in later. */
export function clientFromProject(project: Project, now = new Date().toISOString()): Client {
  const m = project.marketing;
  if (!m) throw new Error(`${project.id} is not a marketing project.`);
  const brief: MarketingBrief = m.brief;
  return {
    id: slugify(m.brand.name) || `client-${Date.now().toString(36)}`,
    name: m.brand.name,
    url: m.brand.url,
    language: m.brand.language === "en" ? "en" : "ar",
    brand: m.brand,
    brief,
    niche: "",
    avoid: brief.notes ?? "",
    dailyIdeas: true,
    createdAt: now,
    updatedAt: now,
  };
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npm test`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add src/clients/types.ts src/clients/store.ts src/clients/store.test.ts package.json
git commit -m "Clients: types and storage under output/.clients"
```

(If `package.json` holds other uncommitted changes, commit only the new files and leave `package.json` to the final commit.)

---

### Task 2: Idea rules and captions (pure)

**Files:**
- Create: `src/clients/rules.ts`
- Create: `src/clients/rules.test.ts`

**Interfaces:**
- Consumes: `Idea`, `IDEA_GOALS` from Task 1.
- Produces: `normalizeHook(text): string`, `ideaProblems(ideas: Pick<Idea, "format" | "goal" | "angle" | "hook">[], pastHooks: string[]): string[]`, `cleanHashtags(tags: string[]): string[]`, `captionText(caption: string, hashtags: string[]): string` (always ≤ 2,200 characters).

- [ ] **Step 1: Write the failing tests**

```ts
// src/clients/rules.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

import { captionText, cleanHashtags, ideaProblems, normalizeHook } from "./rules.ts";

const good = [
  { format: "reel", goal: "awareness", angle: "myth", hook: "بتنشر كل يوم وجدولك فاضي؟" },
  { format: "carousel", goal: "details", angle: "how-to", hook: "إزاي العميل يحجز لوحده" },
  { format: "carousel", goal: "offer", angle: "before-after", hook: "قبل وبعد صفحة الحجز" },
  { format: "single", goal: "awareness", angle: "stat", hook: "٣ رسايل قبل كل حجز" },
  { format: "carousel", goal: "details", angle: "mistakes", hook: "٥ غلطات في لينك البايو" },
] as const;

test("a good batch has no problems", () => {
  assert.deepEqual(ideaProblems([...good], []), []);
});

test("counts, reels, carousels and goals are checked", () => {
  const noReel = good.map((i) => ({ ...i, format: "carousel" as const }));
  assert.match(ideaProblems(noReel, []).join("\n"), /reel/);
  const noOffer = good.map((i) => ({ ...i, goal: "awareness" as const }));
  assert.match(ideaProblems(noOffer, []).join("\n"), /offer/);
  assert.match(ideaProblems(good.slice(0, 4), []).join("\n"), /exactly 5/);
});

test("repeated angles and old hooks are caught, whatever the punctuation", () => {
  const twice = [...good.slice(0, 4), { ...good[4], angle: "myth" as const }];
  assert.match(ideaProblems(twice, []).join("\n"), /angle "myth"/);
  assert.match(ideaProblems([...good], ["بتنشر كل يوم، وجدولك فاضي!"]).join("\n"), /already used/);
});

test("hooks over 120 characters are too long", () => {
  const long = [{ ...good[0], hook: "ا".repeat(121) }, ...good.slice(1)];
  assert.match(ideaProblems(long, []).join("\n"), /120/);
});

test("normalizeHook drops Arabic diacritics, punctuation and case", () => {
  assert.equal(normalizeHook("  Hello, World!  "), "hello world");
  assert.equal(normalizeHook("مَرْحَبًا؟"), "مرحبا");
});

test("hashtags lose # and spaces, are unique and at most 30", () => {
  const tags = cleanHashtags(["#Risero", "حجز مواعيد", "risero", ...Array.from({ length: 40 }, (_, i) => `t${i}`)]);
  assert.equal(tags[0], "Risero");
  assert.equal(tags[1], "حجز_مواعيد");
  assert.equal(tags.length, 30);
});

test("captionText keeps the whole post within 2,200 characters", () => {
  const text = captionText("x".repeat(3000), ["a", "b"]);
  assert.ok(text.length <= 2200);
  assert.ok(text.endsWith("#a #b"));
  assert.ok(text.includes("…"));
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test src/clients/rules.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the rules**

```ts
// src/clients/rules.ts
import { IDEA_GOALS, type Idea } from "./types.ts";

const CAPTION_LIMIT = 2200;
const MAX_HASHTAGS = 30;

/** Compares hooks: no case, punctuation, Arabic diacritics or extra spaces. */
export function normalizeHook(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** What a day's batch of ideas breaks of the rules, as sentences the writer can fix. Empty when it's fine. */
export function ideaProblems(ideas: Pick<Idea, "format" | "goal" | "angle" | "hook">[], pastHooks: string[]): string[] {
  const problems: string[] = [];
  if (ideas.length !== 5) problems.push(`Write exactly 5 ideas (you wrote ${ideas.length}).`);
  if (!ideas.some((i) => i.format === "reel")) problems.push("At least 1 idea must be a reel.");
  if (ideas.filter((i) => i.format === "carousel").length < 2) problems.push("At least 2 ideas must be carousels.");
  for (const goal of IDEA_GOALS) if (!ideas.some((i) => i.goal === goal)) problems.push(`At least 1 idea must have the goal "${goal}".`);

  const angles = new Map<string, number>();
  for (const idea of ideas) angles.set(idea.angle, (angles.get(idea.angle) ?? 0) + 1);
  for (const [angle, count] of angles) if (count > 1) problems.push(`The angle "${angle}" is used ${count} times; use each angle once.`);

  const past = new Set(pastHooks.map(normalizeHook));
  for (const idea of ideas) {
    if (idea.hook.length > 120) problems.push(`The hook "${idea.hook.slice(0, 40)}…" is over 120 characters.`);
    if (past.has(normalizeHook(idea.hook))) problems.push(`The hook "${idea.hook}" was already used in the last 14 days.`);
  }
  return problems;
}

/** Instagram hashtags: no "#", spaces become "_", no repeats (ignoring case), at most 30. */
export function cleanHashtags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.replace(/^#+/, "").trim().replace(/\s+/g, "_");
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    out.push(tag);
    if (out.length === MAX_HASHTAGS) break;
  }
  return out;
}

/** The text to paste into Instagram: caption, a blank line, hashtags; the caption is cut to fit 2,200 characters. */
export function captionText(caption: string, hashtags: string[]): string {
  const tags = cleanHashtags(hashtags).map((tag) => `#${tag}`).join(" ");
  const room = CAPTION_LIMIT - (tags ? tags.length + 2 : 0);
  const body = caption.trim().length > room ? `${caption.trim().slice(0, room - 1)}…` : caption.trim();
  return tags ? `${body}\n\n${tags}` : body;
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `node --test src/clients/rules.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/clients/rules.ts src/clients/rules.test.ts
git commit -m "Clients: idea rules and Instagram caption limits"
```

---

### Task 3: Slides: the writer's flat shape, typed slides and their limits (pure)

**Files:**
- Create: `src/clients/slides.ts`
- Create: `src/clients/slides.test.ts`

**Interfaces:**
- Consumes: `Slide`, `SlideLayout` from Task 1.
- Produces: `FLAT_SLIDE` (zod schema for the writer), `type FlatSlide`, `toSlide(flat: FlatSlide, cta: { label: string; url: string }): Slide | null`, `slideProblems(slides: Slide[], kind: "carousel" | "single"): string[]`, `fitSlides(slides: Slide[]): Slide[]` (truncates over-limit text with "…"), `LIMITS`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/clients/slides.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

import { fitSlides, LIMITS, slideProblems, toSlide, type FlatSlide } from "./slides.ts";
import type { Slide } from "./types.ts";

const flat = (over: Partial<FlatSlide>): FlatSlide => ({
  layout: "list", title: "", subtitle: "", value: "", label: "", note: "", items: [], myth: "", fact: "",
  before: [], after: [], text: "", by: "", bars: [], unit: "", button: "", art: "", ...over,
});
const cta = { label: "احجز مكالمة مجانية", url: "https://diaaeziada.risero.io/#booking-link" };

test("toSlide keeps only its layout's fields and drops empty ones", () => {
  assert.deepEqual(toSlide(flat({ layout: "cover", title: "عنوان", art: "a calendar" }), cta), { layout: "cover", title: "عنوان", art: { prompt: "a calendar" } });
  assert.deepEqual(toSlide(flat({ layout: "list", title: "t", items: ["a", " ", "b"] }), cta), { layout: "list", title: "t", items: ["a", "b"] });
});

test("a cta slide always takes the client's link, and its label when the button is empty", () => {
  assert.deepEqual(toSlide(flat({ layout: "cta", title: "يلا", url: "https://evil.example" } as never), cta), { layout: "cta", title: "يلا", button: cta.label, url: cta.url });
});

test("a slide missing what its layout needs is dropped", () => {
  assert.equal(toSlide(flat({ layout: "stat", value: "" }), cta), null);
  assert.equal(toSlide(flat({ layout: "chart", title: "t", bars: [{ label: "a", value: 1 }] }), cta), null);
});

const cover: Slide = { layout: "cover", title: "t" };
const end: Slide = { layout: "cta", title: "t", button: "b", url: "u" };
const list: Slide = { layout: "list", title: "t", items: ["a", "b"] };

test("a carousel opens on a cover, ends on a cta and has 5-8 slides", () => {
  assert.deepEqual(slideProblems([cover, list, list, list, end], "carousel"), []);
  assert.match(slideProblems([list, list, list, list, end], "carousel").join("\n"), /cover/);
  assert.match(slideProblems([cover, list, list, list, list], "carousel").join("\n"), /cta/);
  assert.match(slideProblems([cover, list, end], "carousel").join("\n"), /5-8/);
});

test("a single image is one cover", () => {
  assert.deepEqual(slideProblems([cover], "single"), []);
  assert.match(slideProblems([cover, end], "single").join("\n"), /exactly 1/);
});

test("over-long text is reported, then cut with an ellipsis", () => {
  const long: Slide = { layout: "list", title: "ع".repeat(LIMITS.title + 10), items: ["a", "b"] };
  assert.match(slideProblems([cover, long, list, list, end], "carousel").join("\n"), /title/);
  const [fitted] = fitSlides([long]) as [{ title: string }];
  assert.equal(fitted.title.length, LIMITS.title);
  assert.ok(fitted.title.endsWith("…"));
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test src/clients/slides.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the slides module**

```ts
// src/clients/slides.ts
import { z } from "zod";

import type { Slide, SlideLayout } from "./types.ts";

/** Characters per field before the slide gets crowded at 1080×1350. */
export const LIMITS = {
  title: 70, subtitle: 110, value: 12, label: 80, note: 90, item: 70, myth: 140, fact: 140,
  side: 60, step: 80, text: 180, by: 40, bar: 24, button: 30,
} as const;

const LAYOUTS = ["cover", "stat", "list", "myth-fact", "before-after", "steps", "quote", "chart", "cta"] as const satisfies readonly SlideLayout[];

/**
 * What the writer returns per slide: one flat shape, every field present and
 * empty when its layout doesn't use it (structured output handles this better
 * than a union). `toSlide` turns it into the typed slide.
 */
export const FLAT_SLIDE = z.object({
  layout: z.enum(LAYOUTS).describe(
    "cover: the hook (title) and a short promise (subtitle). stat: one big number (value, digits) with what it means (label) and an optional note. " +
      "list: a title and 2-5 short items. myth-fact: a common belief and the truth. before-after: 2-4 short lines each. steps: a title and 2-4 steps. " +
      "quote: one line someone would say, optional by. chart: a title and 2-5 bars (label, value number) with a unit. cta: the closing ask (title) and button text",
  ),
  title: z.string(), subtitle: z.string(), value: z.string(), label: z.string(), note: z.string(),
  items: z.array(z.string()).describe("list: the items. steps: the steps"), myth: z.string(), fact: z.string(), before: z.array(z.string()), after: z.array(z.string()),
  text: z.string(), by: z.string(), bars: z.array(z.object({ label: z.string(), value: z.number() })), unit: z.string(), button: z.string(),
  art: z.string().describe("An illustration for this slide, as a picture prompt in English (a subject, no text in it), or empty. Only the cover and at most 2 others"),
});

export type FlatSlide = z.infer<typeof FLAT_SLIDE>;

const clean = (text: string) => text.trim();
const lines = (list: string[]) => list.map(clean).filter(Boolean);
const optional = <K extends string>(key: K, text: string): Partial<Record<K, string>> => (clean(text) ? ({ [key]: clean(text) } as Record<K, string>) : {});

/** The typed slide, or null when the writer left out what the layout needs. The cta always points at the client's own link. */
export function toSlide(flat: FlatSlide, cta: { label: string; url: string }): Slide | null {
  const art = clean(flat.art) ? { art: { prompt: clean(flat.art) } } : {};
  switch (flat.layout) {
    case "cover":
      return clean(flat.title) ? { layout: "cover", title: clean(flat.title), ...optional("subtitle", flat.subtitle), ...art } : null;
    case "stat":
      return clean(flat.value) && clean(flat.label) ? { layout: "stat", value: clean(flat.value), label: clean(flat.label), ...optional("note", flat.note), ...art } : null;
    case "list":
      return clean(flat.title) && lines(flat.items).length >= 2 ? { layout: "list", title: clean(flat.title), items: lines(flat.items).slice(0, 5), ...art } : null;
    case "myth-fact":
      return clean(flat.myth) && clean(flat.fact) ? { layout: "myth-fact", myth: clean(flat.myth), fact: clean(flat.fact), ...art } : null;
    case "before-after":
      return lines(flat.before).length && lines(flat.after).length ? { layout: "before-after", before: lines(flat.before).slice(0, 4), after: lines(flat.after).slice(0, 4), ...art } : null;
    case "steps":
      return clean(flat.title) && lines(flat.items).length >= 2 ? { layout: "steps", title: clean(flat.title), steps: lines(flat.items).slice(0, 4), ...art } : null;
    case "quote":
      return clean(flat.text) ? { layout: "quote", text: clean(flat.text), ...optional("by", flat.by), ...art } : null;
    case "chart": {
      const bars = flat.bars.filter((bar) => clean(bar.label) && Number.isFinite(bar.value) && bar.value >= 0).slice(0, 5).map((bar) => ({ label: clean(bar.label), value: bar.value }));
      return clean(flat.title) && bars.length >= 2 ? { layout: "chart", title: clean(flat.title), bars, ...optional("unit", flat.unit), ...art } : null;
    }
    case "cta":
      return { layout: "cta", title: clean(flat.title) || cta.label, button: clean(flat.button) || cta.label, url: cta.url, ...art };
  }
}

/** Every text field of a slide with its limit name, for checking and cutting. */
function fields(slide: Slide): { key: keyof typeof LIMITS; get: () => string; set: (text: string) => void }[] {
  const s = slide as Record<string, unknown>;
  const one = (key: string, limit: keyof typeof LIMITS) =>
    typeof s[key] === "string" ? [{ key: limit, get: () => s[key] as string, set: (text: string) => void (s[key] = text) }] : [];
  const many = (key: string, limit: keyof typeof LIMITS) =>
    Array.isArray(s[key]) ? (s[key] as string[]).map((_, i) => ({ key: limit, get: () => (s[key] as string[])[i], set: (text: string) => void ((s[key] as string[])[i] = text) })) : [];
  const bars = slide.layout === "chart" ? slide.bars.map((bar) => ({ key: "bar" as const, get: () => bar.label, set: (text: string) => void (bar.label = text) })) : [];
  return [
    ...one("title", "title"), ...one("subtitle", "subtitle"), ...one("value", "value"), ...one("label", "label"), ...one("note", "note"),
    ...many("items", "item"), ...one("myth", "myth"), ...one("fact", "fact"), ...many("before", "side"), ...many("after", "side"),
    ...many("steps", "step"), ...one("text", "text"), ...one("by", "by"), ...one("button", "button"), ...bars,
  ];
}

/** What a set of slides breaks, as sentences the writer can fix. Empty when it's fine. */
export function slideProblems(slides: Slide[], kind: "carousel" | "single"): string[] {
  const problems: string[] = [];
  if (kind === "single") {
    if (slides.length !== 1) problems.push(`A single image has exactly 1 slide (you wrote ${slides.length}).`);
  } else if (slides.length < 5 || slides.length > 8) problems.push(`A carousel has 5-8 slides (you wrote ${slides.length}).`);
  if (slides[0]?.layout !== "cover") problems.push("The first slide must be a cover.");
  if (kind === "carousel" && slides.at(-1)?.layout !== "cta") problems.push("The last slide must be a cta.");
  if (slides.filter((slide) => slide.art).length > 3) problems.push("At most 3 slides have art.");
  slides.forEach((slide, index) => {
    for (const field of fields(slide)) {
      if (field.get().length > LIMITS[field.key]) problems.push(`Slide ${index + 1} (${slide.layout}): a ${field.key} is ${field.get().length} characters; keep it under ${LIMITS[field.key]}.`);
    }
  });
  return problems;
}

/** Copies of the slides with every over-limit text cut to its limit, ending in "…". */
export function fitSlides(slides: Slide[]): Slide[] {
  return slides.map((original) => {
    const slide = structuredClone(original);
    for (const field of fields(slide)) {
      const text = field.get();
      if (text.length > LIMITS[field.key]) field.set(`${text.slice(0, LIMITS[field.key] - 1).trimEnd()}…`);
    }
    return slide;
  });
}
```

Steps travel in the flat shape's `items`. If a title is cut to exactly `LIMITS.title` characters, the test asserts `fitted.title.length === LIMITS.title`. The `trimEnd()` can make it shorter when the cut lands on a space. The test uses a run of one letter, so it holds.

- [ ] **Step 4: Run them to see them pass**

Run: `node --test src/clients/slides.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/clients/slides.ts src/clients/slides.test.ts
git commit -m "Clients: slide layouts, writer shape and text limits"
```

---

### Task 4: Trends and daily ideas

**Files:**
- Create: `src/clients/ideas.ts`
- Create: `src/clients/ideas.test.ts`

**Interfaces:**
- Consumes: Task 1 store functions, Task 2 `ideaProblems`, `extractJson` from `src/llm.ts`.
- Produces: `parseTrends(reply: string): Trend[]` (never throws), `numberIdeas(date, existing, drafts): Idea[]`, `findTrends(client, log): Promise<Trend[]>`, `writeIdeas(client, trends, pastHooks, log): Promise<IdeaDraft[]>`, `makeIdeas(clientId, log, date?): Promise<IdeaDay>`.

- [ ] **Step 1: Write the failing tests (the pure parts)**

```ts
// src/clients/ideas.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

import { numberIdeas, parseTrends } from "./ideas.ts";

test("parseTrends reads a JSON reply with fences and drops entries without a url", () => {
  const reply = "Here you go:\n```json\n{\"trends\":[{\"title\":\"A\",\"summary\":\"s\",\"url\":\"https://a\"},{\"title\":\"B\",\"summary\":\"s\",\"url\":\"\"}]}\n```";
  assert.deepEqual(parseTrends(reply), [{ title: "A", summary: "s", url: "https://a" }]);
});

test("parseTrends returns no trends for a reply that is not JSON", () => {
  assert.deepEqual(parseTrends("sorry, I can't search right now"), []);
});

test("numberIdeas continues the day's numbering and starts every idea as new", () => {
  const draft = { format: "reel", goal: "offer", angle: "story", hook: "h", outline: ["a"], why: "w", trend: "" } as const;
  const ideas = numberIdeas("2026-10-20", 5, [draft, draft]);
  assert.deepEqual(ideas.map((i) => i.id), ["2026-10-20-6", "2026-10-20-7"]);
  assert.equal(ideas[0].status, "new");
  assert.equal("trend" in ideas[0], false);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test src/clients/ideas.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the ideas module**

```ts
// src/clients/ideas.ts
import { generateText, Output } from "ai";
import { z } from "zod";

import { extractJson } from "../llm.ts";
import { ideaProblems } from "./rules.ts";
import { loadClient, loadIdeas, localDate, recentIdeas, saveIdeas } from "./store.ts";
import { IDEA_ANGLES, IDEA_FORMATS, IDEA_GOALS, type Client, type Idea, type IdeaDay, type Trend } from "./types.ts";

const WRITER_MODEL = "anthropic/claude-sonnet-5.5";
// Searches the web as it answers, and cites what it found.
const SEARCH_MODEL = "perplexity/sonar";
const HISTORY_DAYS = 14;

const TRENDS = z.object({ trends: z.array(z.object({ title: z.string(), summary: z.string(), url: z.string() })) });

const IDEA = z.object({
  format: z.enum(IDEA_FORMATS).describe("carousel: 5-8 swipeable infographic slides. single: one strong image. reel: a 30-60s vertical video"),
  goal: z.enum(IDEA_GOALS).describe("awareness: reach new people who don't know the brand. details: explain one feature or how it works. offer: sell, ending on the call to action"),
  angle: z.enum(IDEA_ANGLES),
  hook: z.string().describe("The first line the viewer reads or hears, in the client's language, under 120 characters"),
  outline: z.array(z.string()).describe("3-7 beats: the slides of a carousel or the scenes of a reel, one short line each"),
  why: z.string().describe("One sentence: why this reaches the niche and can travel (saves, shares, comments)"),
  trend: z.string().describe("The url of the trend it rides, or empty"),
});
const IDEAS = z.object({ ideas: z.array(IDEA) });

export type IdeaDraft = z.infer<typeof IDEA>;

/** The trends in a search reply; none when the reply has no usable JSON. */
export function parseTrends(reply: string): Trend[] {
  try {
    const parsed = TRENDS.safeParse(extractJson(reply));
    if (!parsed.success) return [];
    return parsed.data.trends.filter((t) => t.title.trim() && /^https?:\/\//.test(t.url.trim())).slice(0, 8).map((t) => ({ title: t.title.trim(), summary: t.summary.trim(), url: t.url.trim() }));
  } catch {
    return [];
  }
}

/** Drafts as stored ideas, numbered after the `existing` ideas of that day. */
export function numberIdeas(date: string, existing: number, drafts: IdeaDraft[]): Idea[] {
  return drafts.map((draft, index) => ({
    id: `${date}-${existing + index + 1}`,
    format: draft.format,
    goal: draft.goal,
    angle: draft.angle,
    hook: draft.hook.trim(),
    outline: draft.outline.map((line) => line.trim()).filter(Boolean),
    why: draft.why.trim(),
    ...(draft.trend.trim() ? { trend: draft.trend.trim() } : {}),
    status: "new" as const,
  }));
}

/** This week's news, debates and formats in the client's niche. A failed search gives no trends rather than no ideas. */
export async function findTrends(client: Client, log: (message: string) => void): Promise<Trend[]> {
  log(`trends: searching what's new for ${client.niche || client.brief.business} ...`);
  try {
    const { text } = await generateText({
      telemetry: { functionId: "trends" },
      model: SEARCH_MODEL,
      prompt: `Find the 5-8 freshest news items, debates and trending Instagram post formats of the last 7 days for this niche: ${client.niche || client.brief.business}.
The audience: ${client.brief.audience}. Market: ${client.language === "ar" ? "Egypt and the Arab world" : "global, English-speaking"}.
Answer ONLY with JSON: {"trends":[{"title":"...","summary":"one sentence","url":"the source"}]}`,
    });
    const trends = parseTrends(text);
    log(`trends: ${trends.length} found`);
    return trends;
  } catch (error) {
    log(`trends: search failed, writing ideas without trends (${error instanceof Error ? error.message : error})`);
    return [];
  }
}

/** 5 ideas that follow the rules; one retry with what broke them. */
export async function writeIdeas(client: Client, trends: Trend[], pastHooks: string[], log: (message: string) => void): Promise<IdeaDraft[]> {
  const arabic = client.language === "ar";
  const prompt = `You are the Instagram content strategist of ${client.name} (${client.url}). Suggest today's 5 post ideas: niche, reach and shareable, never generic.

THE CLIENT
Niche: ${client.niche || client.brief.business}
Offer: ${client.brand.summary}
Business: ${client.brief.business}
Audience: ${client.brief.audience}
Their problems: ${client.brief.problems.join(" | ")}
Result they want: ${client.brief.result}
Features: ${client.brief.features.join(" | ")}
Call to action: "${client.brief.cta.label}" → ${client.brief.cta.url}
Tone: ${client.brief.tone}
Never: ${client.avoid || "nothing extra"}; never invent prices, testimonials, client counts or guarantees.

THIS WEEK'S TRENDS (ride one where it fits; cite its url in "trend")
${trends.length ? trends.map((t) => `- ${t.title}: ${t.summary} (${t.url})`).join("\n") : "none found today: use evergreen angles"}

HOOKS ALREADY USED IN THE LAST ${HISTORY_DAYS} DAYS (do not repeat or paraphrase)
${pastHooks.length ? pastHooks.map((h) => `- ${h}`).join("\n") : "none"}

RULES
- Exactly 5 ideas: at least 1 reel and at least 2 carousels; the goals awareness, details and offer each at least once; every idea a different angle.
- Language of hook and outline: ${arabic ? "Egyptian colloquial Arabic, natural, like talking to a business owner. Brand and platform names in Latin script" : "simple, natural English"}.
- Hooks stop the scroll: a pain the audience recognises, a surprising number, a bold claim or a direct question. Under 120 characters.
- Carousels are infographic: each outline line is one slide (cover first, call to action last). Reels: each line is a scene; the hook is said in the first 2 seconds.`;

  const write = (extra = "") => generateText({ telemetry: { functionId: "ideas" }, model: WRITER_MODEL, output: Output.object({ schema: IDEAS }), prompt: prompt + extra });
  log(`ideas: writing 5 ideas for ${client.name} ...`);
  let { output } = await write();
  const problems = ideaProblems(output.ideas, pastHooks);
  if (problems.length) {
    log(`ideas: fixing ${problems.length} problem(s) ...`);
    ({ output } = await write(`\n\nYOUR FIRST ANSWER BROKE THESE RULES:\n${problems.map((p) => `- ${p}`).join("\n")}\nWrite the 5 ideas again so none are broken.`));
    const still = ideaProblems(output.ideas, pastHooks);
    if (still.length) log(`ideas: still ${still.join(" ")}`);
  }
  return output.ideas.slice(0, 5);
}

/** Today's ideas for a client: trends, 5 ideas, appended to the day's file. */
export async function makeIdeas(clientId: string, log: (message: string) => void = console.log, date = localDate()): Promise<IdeaDay> {
  const client = await loadClient(clientId);
  const day = (await loadIdeas(clientId, date)) ?? { date, trends: [], ideas: [] };
  const trends = await findTrends(client, log);
  const pastHooks = (await recentIdeas(clientId, date, HISTORY_DAYS)).map((idea) => idea.hook);
  const drafts = await writeIdeas(client, trends, pastHooks, log);
  day.trends = [...day.trends, ...trends.filter((t) => !day.trends.some((old) => old.url === t.url))];
  day.ideas = [...day.ideas, ...numberIdeas(date, day.ideas.length, drafts)];
  await saveIdeas(clientId, day);
  log(`ideas: ${drafts.length} ideas saved for ${date}`);
  return day;
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `node --test src/clients/ideas.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Check that the gateway serves the search model**

Run: `node -e "import('ai').then(async ({generateText}) => { process.loadEnvFile('.env'); const r = await generateText({ model: 'perplexity/sonar', prompt: 'One news headline about Instagram this week, one line.' }); console.log(r.text.slice(0, 200)); })"`
Expected: one line of text. If the gateway refuses the model, change `SEARCH_MODEL` to `"google/gemini-3.5-flash"` and add `tools: { google_search: google.tools.googleSearch({}) }` (import `google` from `@ai-sdk/google`, already a dependency of `ai`'s gateway). Record which one works in the commit message.

- [ ] **Step 6: Commit**

```bash
git add src/clients/ideas.ts src/clients/ideas.test.ts
git commit -m "Clients: daily ideas from niche trends (perplexity/sonar via the gateway)"
```

---

### Task 5: The infographic carousel renderer

**Files:**
- Create: `src/render/carousel.ts`
- Create: `src/render/carousel.test.ts`

**Interfaces:**
- Consumes: `Client`, `Slide` from Task 1.
- Produces: `slideHtml(slide: Slide, ctx: SlideContext): string`, `type SlideContext = { client: Pick<Client, "language" | "instagramHandle" | "brand">; index: number; total: number; logo?: string; art?: string }` (logo and art are data: URLs), `renderSlides(dir: string, client: Client, clientFolder: string, slides: Slide[], log): Promise<string[]>` (writes `slides/01.png …` into `dir`, returns their relative paths).

- [ ] **Step 1: Write the failing tests**

```ts
// src/render/carousel.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { renderSlides, slideHtml } from "./carousel.ts";
import type { Client, Slide } from "../clients/types.ts";

const brand = {
  url: "https://diaaeziada.risero.io/", name: "Risero", summary: "", services: [], language: "ar", photos: [], shots: [], text: "",
  colors: { background: "#0e1130", panel: "#161a42", text: "#f2f1fb", accent: "#b8b3ff", cta: "#ff7a59", muted: "#a9abd0" },
  fonts: { heading: "El Messiri", body: "Readex Pro" }, googleFonts: ["El Messiri", "Readex Pro"],
} as Client["brand"];
const client = { language: "ar", brand } as Client;

test("Arabic slides are right-to-left and escape their text", () => {
  const html = slideHtml({ layout: "cover", title: "<b>صفحة</b> واحدة" }, { client, index: 0, total: 5 });
  assert.match(html, /dir="rtl"/);
  assert.match(html, /&lt;b&gt;صفحة/);
  assert.match(html, /1 \/ 5/);
});

test("no handle and no logo: no '@undefined' and no empty image", () => {
  const html = slideHtml({ layout: "list", title: "t", items: ["a", "b"] }, { client, index: 1, total: 5 });
  assert.doesNotMatch(html, /@undefined|@<|src=""/);
});

test("the chart scales bars to the largest value", () => {
  const html = slideHtml({ layout: "chart", title: "t", bars: [{ label: "a", value: 50 }, { label: "b", value: 100 }], unit: "%" }, { client, index: 2, total: 5 });
  assert.match(html, /width:50%/);
  assert.match(html, /width:100%/);
});

const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

test("renders 1080×1350 PNGs, even with very long Arabic text", { skip: !existsSync(chrome) && "needs Google Chrome" }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "carousel-"));
  const slides: Slide[] = [
    { layout: "cover", title: "صفحة واحدة تخلي العميل يحجز", subtitle: "من غير رسايل كتير" },
    { layout: "list", title: "ليه العميل بيختفي؟ ".repeat(4), items: ["رد متأخر على الرسايل ".repeat(3), "لينك بايو مفيهوش تجربة", "مواعيد بتتداخل"] },
    { layout: "cta", title: "احجز مكالمة مجانية", button: "احجز دلوقتي", url: "https://diaaeziada.risero.io/#booking-link" },
  ];
  const files = await renderSlides(dir, { ...client, instagramHandle: "risero" } as Client, dir, slides, () => {});
  assert.deepEqual(files, ["slides/01.png", "slides/02.png", "slides/03.png"]);
  for (const file of files) {
    const png = readFileSync(join(dir, file));
    assert.equal(png.readUInt32BE(16), 1080);
    assert.equal(png.readUInt32BE(20), 1350);
  }
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test src/render/carousel.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the renderer**

```ts
// src/render/carousel.ts
import { existsSync } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import { extname, join } from "node:path";

import puppeteer from "puppeteer-core";

import type { Client, Slide } from "../clients/types.ts";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const WIDTH = 1080;
const HEIGHT = 1350;

export type SlideContext = { client: Pick<Client, "language" | "instagramHandle" | "brand">; index: number; total: number; logo?: string; art?: string };

const WORDS = {
  ar: { myth: "خرافة", fact: "الحقيقة", before: "قبل", after: "بعد" },
  en: { myth: "Myth", fact: "Fact", before: "Before", after: "After" },
};

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The slide's own content; `data-fit` marks text that may shrink, with its smallest size. */
function body(slide: Slide, ctx: SlideContext): string {
  const w = WORDS[ctx.client.language];
  const art = ctx.art ? `<img class="art${slide.layout === "cover" ? " art-cover" : ""}" src="${ctx.art}" alt="">` : "";
  switch (slide.layout) {
    case "cover":
      return `${art}<h1 data-fit="44">${escape(slide.title)}</h1>${slide.subtitle ? `<p class="sub" data-fit="26">${escape(slide.subtitle)}</p>` : ""}`;
    case "stat":
      return `${art}<div class="stat">${escape(slide.value)}</div><h2 data-fit="32">${escape(slide.label)}</h2>${slide.note ? `<p class="sub" data-fit="24">${escape(slide.note)}</p>` : ""}`;
    case "list":
      return `${art}<h2 data-fit="36">${escape(slide.title)}</h2><ol class="list">${slide.items.map((item, i) => `<li><span class="num">${i + 1}</span><span data-fit="26">${escape(item)}</span></li>`).join("")}</ol>`;
    case "myth-fact":
      return `${art}<div class="card muted"><span class="tag">✕ ${w.myth}</span><p data-fit="28">${escape(slide.myth)}</p></div><div class="card hot"><span class="tag">✓ ${w.fact}</span><p data-fit="28">${escape(slide.fact)}</p></div>`;
    case "before-after":
      return `${art}<div class="cols"><div class="card muted"><span class="tag">${w.before}</span>${slide.before.map((l) => `<p data-fit="24">${escape(l)}</p>`).join("")}</div><div class="card hot"><span class="tag">${w.after}</span>${slide.after.map((l) => `<p data-fit="24">${escape(l)}</p>`).join("")}</div></div>`;
    case "steps":
      return `${art}<h2 data-fit="36">${escape(slide.title)}</h2><div class="steps">${slide.steps.map((step, i) => `<div class="step"><span class="num">${i + 1}</span><span data-fit="26">${escape(step)}</span></div>`).join("")}</div>`;
    case "quote":
      return `${art}<div class="mark">“</div><blockquote data-fit="34">${escape(slide.text)}</blockquote>${slide.by ? `<p class="sub">— ${escape(slide.by)}</p>` : ""}`;
    case "chart": {
      const max = Math.max(...slide.bars.map((bar) => bar.value), 1);
      return `${art}<h2 data-fit="36">${escape(slide.title)}</h2><div class="bars">${slide.bars
        .map((bar) => `<div class="bar"><span class="bar-label" data-fit="22">${escape(bar.label)}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round((bar.value / max) * 100)}%"></div></div><span class="bar-value">${bar.value}${escape(slide.unit ?? "")}</span></div>`)
        .join("")}</div>`;
    }
    case "cta":
      return `${art}${ctx.logo ? `<img class="cta-logo" src="${ctx.logo}" alt="">` : ""}<h1 data-fit="44">${escape(slide.title)}</h1><div class="button">${escape(slide.button)}</div><p class="sub link">${escape(slide.url.replace(/^https?:\/\//, ""))}</p>`;
  }
}

/** One slide as a whole HTML page at 1080×1350, in the client's colours and fonts. */
export function slideHtml(slide: Slide, ctx: SlideContext): string {
  const { colors, fonts, googleFonts } = ctx.client.brand;
  const arabic = ctx.client.language === "ar";
  const fallback = arabic ? "'SF Arabic', 'Geeza Pro', sans-serif" : "'SF Pro Display', 'Helvetica Neue', sans-serif";
  const families = googleFonts.filter((family) => family === fonts.heading || family === fonts.body);
  const link = families.length ? `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${families.map((f) => `family=${f.replace(/ /g, "+")}:wght@400;600;700;800`).join("&")}&display=block">` : "";
  const handle = ctx.client.instagramHandle?.trim().replace(/^@/, "");
  return `<!doctype html><html lang="${ctx.client.language}" dir="${arabic ? "rtl" : "ltr"}"><head><meta charset="utf-8">${link}<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${WIDTH}px;height:${HEIGHT}px;overflow:hidden}
body{background:radial-gradient(circle at ${arabic ? "15%" : "85%"} 8%, ${colors.accent}33, transparent 55%),radial-gradient(circle at ${arabic ? "90%" : "10%"} 95%, ${colors.cta}1f, transparent 50%),${colors.background};
  color:${colors.text};font-family:'${fonts.body}',${fallback};line-height:${arabic ? 1.55 : 1.3};display:flex;flex-direction:column;padding:72px 84px}
h1,h2,.stat,.button,.tag,.num{font-family:'${fonts.heading}','${fonts.body}',${fallback};font-weight:800}
header{display:flex;align-items:center;height:64px}
header img{height:56px;width:auto;max-width:220px;object-fit:contain}
.content{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center;gap:36px;overflow:hidden}
footer{display:flex;justify-content:space-between;align-items:center;height:48px;font-size:26px;color:${colors.muted}}
h1{font-size:88px;line-height:1.15}
h2{font-size:60px;line-height:1.2}
.sub{font-size:36px;color:${colors.muted}}
.art{width:340px;height:340px;object-fit:cover;border-radius:36px;align-self:center}
.art-cover{width:600px;height:600px}
.stat{font-size:220px;line-height:1;color:${colors.cta}}
.list,.steps{list-style:none;display:flex;flex-direction:column;gap:22px}
.list li,.step{display:flex;gap:24px;align-items:center;background:${colors.panel};border-radius:28px;padding:26px 30px;font-size:38px}
.num{flex:none;width:64px;height:64px;border-radius:50%;display:grid;place-items:center;background:${colors.cta};color:${colors.background};font-size:34px}
.card{background:${colors.panel};border-radius:32px;padding:34px 38px;display:flex;flex-direction:column;gap:16px;font-size:40px;flex:1}
.card.muted p{color:${colors.muted};text-decoration:line-through;text-decoration-color:${colors.muted}88}
.card.hot{outline:4px solid ${colors.cta}}
.tag{font-size:30px;color:${colors.accent}}
.card.hot .tag{color:${colors.cta}}
.cols{display:flex;gap:28px}
.cols .card{font-size:34px}
.mark{font-size:220px;line-height:.6;color:${colors.accent};height:110px}
blockquote{font-size:62px;line-height:1.35;font-weight:600}
.bars{display:flex;flex-direction:column;gap:30px}
.bar{display:grid;grid-template-columns:260px 1fr 140px;gap:20px;align-items:center;font-size:32px}
.bar-track{height:44px;border-radius:22px;background:${colors.panel};overflow:hidden}
.bar-fill{height:100%;border-radius:22px;background:linear-gradient(90deg,${colors.accent},${colors.cta})}
.bar-value{font-weight:700;color:${colors.cta}}
.cta-logo{height:120px;width:auto;max-width:360px;object-fit:contain;align-self:center}
.content:has(.button){text-align:center;align-items:center}
.button{background:${colors.cta};color:${colors.background};font-size:52px;padding:30px 64px;border-radius:999px}
.link{direction:ltr}
</style></head><body>
<header>${ctx.logo && slide.layout !== "cta" ? `<img src="${ctx.logo}" alt="">` : ""}</header>
<main class="content">${body(slide, ctx)}</main>
<footer><span>${handle ? `@${escape(handle)}` : ""}</span><span>${ctx.index + 1} / ${ctx.total}</span></footer>
</body></html>`;
}

/** Shrinks every [data-fit] text in steps until the content fits, never below its floor. */
function fitScript(): void {
  const box = document.querySelector(".content") as HTMLElement;
  const texts = [...document.querySelectorAll<HTMLElement>("[data-fit]")].map((el) => ({ el, base: parseFloat(getComputedStyle(el).fontSize), floor: Number(el.dataset.fit) }));
  for (let scale = 1; scale >= 0.3 && box.scrollHeight > box.clientHeight + 1; scale -= 0.05) {
    for (const t of texts) t.el.style.fontSize = `${Math.max(t.floor, t.base * scale)}px`;
  }
}

async function dataUrl(path: string): Promise<string | undefined> {
  if (!existsSync(path)) return undefined;
  const type = extname(path) === ".png" ? "image/png" : extname(path) === ".webp" ? "image/webp" : "image/jpeg";
  return `data:${type};base64,${(await readFile(path)).toString("base64")}`;
}

/**
 * Renders the slides to `dir`/slides/NN.png. Art files are read from `dir`
 * and the logo from `clientFolder` (the brand's paths are relative to it).
 */
export async function renderSlides(dir: string, client: Client, clientFolder: string, slides: Slide[], log: (message: string) => void = console.log): Promise<string[]> {
  if (!existsSync(CHROME)) throw new Error("Google Chrome is needed to render slides");
  // Slides left from a longer earlier version would end up in the zip.
  await rm(join(dir, "slides"), { recursive: true, force: true });
  await mkdir(join(dir, "slides"), { recursive: true });
  const logo = client.brand.logo ? await dataUrl(join(clientFolder, client.brand.logo)) : undefined;
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  const files: string[] = [];
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
    for (const [index, slide] of slides.entries()) {
      const art = slide.art?.file ? await dataUrl(join(dir, slide.art.file)) : undefined;
      await page.setContent(slideHtml(slide, { client, index, total: slides.length, logo, art }), { waitUntil: "networkidle0", timeout: 30000 });
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(fitScript);
      const file = `slides/${String(index + 1).padStart(2, "0")}.png`;
      await page.screenshot({ path: join(dir, file) as `${string}.png`, clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
      files.push(file);
      log(`slides: ${index + 1}/${slides.length}`);
    }
  } finally {
    await browser.close();
  }
  return files;
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `node --test src/render/carousel.test.ts`
Expected: PASS, 4 tests (the PNG one takes about 10 s).

- [ ] **Step 5: Look at the PNGs**

Temporarily add `console.log(dir)` after `mkdtempSync` in the PNG test, run it, open that folder and look at all 3 slides: Arabic right-to-left, nothing cut off at the bottom, the handle and the counter in the footer. Remove any debug line before committing.

- [ ] **Step 6: Commit**

```bash
git add src/render/carousel.ts src/render/carousel.test.ts
git commit -m "Carousel renderer: 1080x1350 infographic slides in the client's brand"
```

---

### Task 6: Making posts: carousel writer, art, reels

**Files:**
- Create: `src/clients/carousel.ts`
- Create: `src/clients/reel.ts`
- Create: `src/clients/make.ts`
- Create: `src/clients/make.test.ts`
- Modify: `src/pipeline.ts:42` (add `export` to `const MARKETING_STYLE`)

**Interfaces:**
- Consumes: Tasks 1–5; `writeMarketing` (`src/marketing/write.ts`), `build`, `MARKETING_VOICES`, `MARKETING_STYLE`, `MARKETING_OWNER` (`src/pipeline.ts`), `newProjectId`, `saveProject`, `projectDir`, `loadProject` (`src/project.ts`), `recordImage` (`src/usage.ts`).
- Produces: `writeCarousel(client, idea, log): Promise<{ slides: Slide[]; caption: string; hashtags: string[] }>`, `drawSlideArt(dir, client, slides, log): Promise<Slide[]>`, `reelBrief(client, idea): MarketingBrief`, `reelScript(idea): string`, `createReel(client, idea, log): Promise<string>` (project id), `postIdFor(idea): string`, `claimIdea(clientId, date, ideaId): Promise<Idea>` (throws when not `new`), `makePost(clientId, ideaId, log): Promise<Post>`, `rerenderPost(clientId, postId, edits, log): Promise<Post>`.

- [ ] **Step 1: Write the failing tests (pure parts and the double-click guard)**

```ts
// src/clients/make.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.CLIENTS_DIR = mkdtempSync(join(tmpdir(), "clients-"));
const { reelBrief, reelScript } = await import("./reel.ts");
const { claimIdea, postIdFor } = await import("./make.ts");
const store = await import("./store.ts");

const client = {
  id: "risero", name: "Risero", language: "ar",
  brief: { business: "b", audience: "a", problems: ["p"], result: "r", features: ["f"], proof: "", data: "example", cta: { label: "احجز", url: "https://x" }, tone: "t", voice: "male", seconds: 45, platforms: ["TikTok"], captions: false, notes: "old notes" },
  avoid: "لا أسعار",
} as never;
const idea = { id: "2026-10-20-1", format: "reel", goal: "details", angle: "how-to", hook: "إزاي العميل يحجز لوحده", outline: ["العميل يفتح الصفحة", "يختار ميعاد", "يوصله تأكيد"], why: "", status: "new" } as const;

test("a reel's brief is the client's, sized for Instagram Reels, with the idea in the notes", () => {
  const brief = reelBrief(client, idea);
  assert.equal(brief.seconds, 45);
  assert.deepEqual(brief.platforms, ["Instagram Reels"]);
  assert.match(brief.notes, /details/);
  assert.match(brief.notes, /إزاي العميل يحجز لوحده/);
  assert.match(brief.notes, /لا أسعار/);
  assert.equal(brief.cta.url, "https://x");
});

test("a reel's script opens on the hook and lists the outline", () => {
  const script = reelScript(idea);
  assert.ok(script.startsWith("Hook (first 2 seconds): إزاي العميل يحجز لوحده"));
  assert.match(script, /2\. يختار ميعاد/);
});

test("post ids are the date and a slug, unique per idea", () => {
  assert.equal(postIdFor(idea), "2026-10-20-1-reel");
});

test("an idea can be claimed once: a second make is refused", async () => {
  await store.saveIdeas("risero", { date: "2026-10-20", trends: [], ideas: [{ ...idea }] });
  const claimed = await claimIdea("risero", "2026-10-20", idea.id);
  assert.equal(claimed.status, "making");
  await assert.rejects(claimIdea("risero", "2026-10-20", idea.id), /already being made/);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test src/clients/make.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Export `MARKETING_STYLE`**

In `src/pipeline.ts` line 42, change `const MARKETING_STYLE = {` to `export const MARKETING_STYLE = {`. Nothing else in that file changes.

- [ ] **Step 4: Write the carousel writer and art**

```ts
// src/clients/carousel.ts
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { generateImage, generateText, Output } from "ai";
import { z } from "zod";

import { recordImage } from "../usage.ts";
import { FLAT_SLIDE, fitSlides, slideProblems, toSlide } from "./slides.ts";
import type { Client, Idea, Slide } from "./types.ts";

const WRITER_MODEL = "anthropic/claude-sonnet-5.5";
const ART_MODEL = "bfl/flux-3-image";

const CAROUSEL = z.object({
  slides: z.array(FLAT_SLIDE),
  caption: z.string().describe("The Instagram caption: the hook line, 2-4 short lines of value, a question that invites comments, the call to action. No hashtags in it"),
  hashtags: z.array(z.string()).describe("12-20 hashtags without #: 3-5 broad, the rest niche and local"),
});

/** The slides and caption of a carousel (5-8 slides) or a single image (1 cover), checked and fitted to the limits. */
export async function writeCarousel(client: Client, idea: Idea, log: (message: string) => void): Promise<{ slides: Slide[]; caption: string; hashtags: string[] }> {
  const kind = idea.format === "single" ? "single" : "carousel";
  const arabic = client.language === "ar";
  const prompt = `You design Instagram ${kind === "single" ? "single-image posts" : "infographic carousels"} for ${client.name} (${client.url}).

THE IDEA (goal: ${idea.goal}, angle: ${idea.angle})
Hook: ${idea.hook}
Outline: ${idea.outline.map((line, i) => `${i + 1}. ${line}`).join("  ")}

THE CLIENT
Offer: ${client.brand.summary}
Audience: ${client.brief.audience}
Problems: ${client.brief.problems.join(" | ")}
Features: ${client.brief.features.join(" | ")}
Call to action: "${client.brief.cta.label}" → ${client.brief.cta.url}
Tone: ${client.brief.tone}
Never: ${client.avoid || "nothing extra"}; never invent prices, testimonials, client counts or guarantees.

RULES
- ${kind === "single" ? "Exactly 1 slide: a cover whose title is the hook, sharpened, and a subtitle with the one takeaway." : "5-8 slides. Slide 1 is the cover (the hook as a title that makes people swipe). The last slide is the cta. Between them, one idea per slide, using the layouts that fit the content: stat, list, myth-fact, before-after, steps, quote, chart."}
- Very short text: a title under 70 characters, list items under 70, a stat value like "3x" or "15".
- Numbers not given in the client's facts are examples: put "${arabic ? "مثال" : "example"}" in the note or the chart unit.
- Art: an English picture prompt for the cover and at most 2 other slides; flat editorial illustration subjects (a phone with a calendar, a tangle of chat bubbles), never text, never logos.
- Language: ${arabic ? "Egyptian colloquial Arabic, natural; brand and platform names in Latin script" : "simple, natural English"}.`;

  const write = (extra = "") => generateText({ telemetry: { functionId: "carousel" }, model: WRITER_MODEL, output: Output.object({ schema: CAROUSEL }), prompt: prompt + extra });
  log(`carousel: writing "${idea.hook}" ...`);
  const toSlides = (output: z.infer<typeof CAROUSEL>) => output.slides.map((flat) => toSlide(flat, client.brief.cta)).filter((slide): slide is Slide => slide !== null);
  let { output } = await write();
  let slides = toSlides(output);
  const problems = slideProblems(slides, kind);
  if (problems.length) {
    log(`carousel: fixing ${problems.length} problem(s) ...`);
    ({ output } = await write(`\n\nYOUR FIRST ANSWER HAD THESE PROBLEMS:\n${problems.map((p) => `- ${p}`).join("\n")}\nWrite the slides again without them.`));
    slides = toSlides(output);
  }
  if (kind === "single") slides = slides.filter((slide) => slide.layout === "cover").slice(0, 1);
  if (!slides.length || slides[0].layout !== "cover") slides = [{ layout: "cover", title: idea.hook }, ...slides.filter((slide) => slide.layout !== "cover")];
  if (kind === "carousel" && slides.at(-1)?.layout !== "cta") slides.push({ layout: "cta", title: client.brief.cta.label, button: client.brief.cta.label, url: client.brief.cta.url });
  // At most 3 pictures: the cover's, then the first others that asked for one.
  let pictures = 0;
  slides = slides.map((slide) => (slide.art && pictures++ >= 3 ? { ...slide, art: undefined } : slide));
  return { slides: fitSlides(slides), caption: output.caption.trim(), hashtags: output.hashtags };
}

/** Draws every slide picture that has no file yet, in one style, into `dir`/art/. */
export async function drawSlideArt(dir: string, client: Client, slides: Slide[], log: (message: string) => void): Promise<Slide[]> {
  const { colors } = client.brand;
  const style = `Flat editorial vector illustration, soft grain, rounded shapes, a palette of ${colors.accent}, ${colors.cta} and ${colors.panel} on a plain ${colors.background} background, generous empty space, no text, no letters, no logos, no watermark. Subject: `;
  const out = structuredClone(slides);
  await mkdir(join(dir, "art"), { recursive: true });
  for (const [index, slide] of out.entries()) {
    if (!slide.art || slide.art.file) continue;
    log(`art: slide ${index + 1} ...`);
    const result = await generateImage({ model: ART_MODEL, prompt: style + slide.art.prompt, aspectRatio: "1:1" });
    recordImage(ART_MODEL, result, "pictures");
    const file = `art/${String(index + 1).padStart(2, "0")}.${result.image.mediaType === "image/png" ? "png" : "jpg"}`;
    await writeFile(join(dir, file), result.image.uint8Array);
    slide.art.file = file;
  }
  return out;
}
```

- [ ] **Step 5: Write the reel maker**

```ts
// src/clients/reel.ts
import { cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { MARKETING_OWNER, MARKETING_STYLE, MARKETING_VOICES } from "../pipeline.ts";
import { writeMarketing } from "../marketing/write.ts";
import { newProjectId, projectDir, saveProject } from "../project.ts";
import type { MarketingBrief, Project } from "../types.ts";
import { clientDir } from "./store.ts";
import type { Client, Idea } from "./types.ts";

/** The client's brief, sized and aimed for one Instagram Reel. */
export function reelBrief(client: Client, idea: Idea): MarketingBrief {
  return {
    ...client.brief,
    seconds: 45,
    platforms: ["Instagram Reels"],
    notes: [
      `Goal of this reel: ${idea.goal} (${idea.goal === "awareness" ? "reach people who don't know the brand yet; lead with their pain, mention the brand late" : idea.goal === "details" ? "show how one feature works, step by step" : "sell: the result, then a clear call to action"}).`,
      `Say the hook in the first 2 seconds: ${idea.hook}`,
      `Beats: ${idea.outline.join(" → ")}`,
      client.avoid ? `Never: ${client.avoid}` : "",
    ].filter(Boolean).join("\n"),
  };
}

/** The idea as the script the marketing writer follows. */
export function reelScript(idea: Idea): string {
  return [`Hook (first 2 seconds): ${idea.hook}`, ...idea.outline.map((line, i) => `${i + 1}. ${line}`)].join("\n");
}

/** Writes a reel as an ordinary 9:16 marketing project (same writer as Marketing mode) and returns its id. */
export async function createReel(client: Client, idea: Idea, log: (message: string) => void): Promise<string> {
  const brief = reelBrief(client, idea);
  const draft = await writeMarketing({ brand: client.brand, brief, script: reelScript(idea), language: client.language, format: "short", creativity: "creative" }, log);
  const now = new Date().toISOString();
  const project: Project = {
    id: newProjectId(MARKETING_OWNER, "short", `${client.name} reel ${idea.goal}`),
    channel: MARKETING_OWNER,
    format: "short",
    style: "marketing",
    topic: `Instagram reel for ${client.name}: ${idea.hook}`,
    title: draft.title,
    description: `${draft.caption}\n\n${draft.hashtags.map((tag) => `#${tag}`).join(" ")}`.trim(),
    tags: draft.hashtags,
    marketing: {
      brand: client.brand,
      brief,
      creativity: "creative",
      language: client.language,
      narrator: { voice: MARKETING_VOICES[brief.voice || "male"], style: MARKETING_STYLE[client.language] },
      captions: Boolean(brief.captions),
      post: { caption: draft.caption, hashtags: draft.hashtags },
    },
    scenes: draft.scenes,
    createdAt: now,
    updatedAt: now,
  };
  // The renderer finds the logo and screenshots next to index.html, as for any marketing video.
  if (existsSync(join(clientDir(client.id), "shots"))) await cp(join(clientDir(client.id), "shots"), join(projectDir(project.id), "shots"), { recursive: true });
  await saveProject(project);
  log(`script: reel saved as ${project.id}`);
  return project.id;
}
```

- [ ] **Step 6: Write `make.ts`**

```ts
// src/clients/make.ts
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { build } from "../pipeline.ts";
import { loadProject } from "../project.ts";
import { renderSlides } from "../render/carousel.ts";
import { drawSlideArt, writeCarousel } from "./carousel.ts";
import { createReel } from "./reel.ts";
import { captionText, cleanHashtags } from "./rules.ts";
import { clientDir, loadClient, loadIdeas, loadPost, postDir, saveIdeas, savePost, slugify } from "./store.ts";
import type { Idea, Post, Slide } from "./types.ts";

/** "<idea id>-<format>", so one idea has one post folder. */
export function postIdFor(idea: Idea): string {
  return `${idea.id}-${slugify(idea.format)}`;
}

const dateOf = (ideaId: string) => ideaId.slice(0, 10);

async function setIdea(clientId: string, ideaId: string, change: (idea: Idea) => void): Promise<Idea> {
  const day = await loadIdeas(clientId, dateOf(ideaId));
  const idea = day?.ideas.find((i) => i.id === ideaId);
  if (!day || !idea) throw new Error(`No idea ${ideaId}`);
  change(idea);
  await saveIdeas(clientId, day);
  return idea;
}

/** Marks an idea as being made; a second make of the same idea is refused. */
export async function claimIdea(clientId: string, date: string, ideaId: string): Promise<Idea> {
  if (dateOf(ideaId) !== date) throw new Error(`Idea ${ideaId} is not from ${date}`);
  return setIdea(clientId, ideaId, (idea) => {
    if (idea.status === "making") throw new Error("This idea is already being made.");
    if (idea.status === "made") throw new Error("This idea was already made; open its post.");
    idea.status = "making";
  });
}

/** Makes the idea into a post. The idea must have been claimed first (see `claimIdea`). */
export async function makePost(clientId: string, ideaId: string, log: (message: string) => void = console.log): Promise<Post> {
  const client = await loadClient(clientId);
  const idea = (await loadIdeas(clientId, dateOf(ideaId)))?.ideas.find((i) => i.id === ideaId);
  if (!idea) throw new Error(`No idea ${ideaId}`);
  const now = new Date().toISOString();
  const post: Post = { id: postIdFor(idea), clientId, ideaId, kind: idea.format, caption: "", hashtags: [], status: "writing", createdAt: now, updatedAt: now };
  await savePost(post);
  try {
    if (idea.format === "reel") {
      post.projectId = await createReel(client, idea, log);
      post.status = "rendering";
      await savePost(post);
      await build(post.projectId, { quality: "standard" }, log);
      const project = await loadProject(post.projectId);
      post.caption = project.marketing?.post?.caption ?? project.description;
      post.hashtags = cleanHashtags(project.marketing?.post?.hashtags ?? project.tags);
    } else {
      const written = await writeCarousel(client, idea, log);
      post.caption = written.caption;
      post.hashtags = cleanHashtags(written.hashtags);
      post.status = "drawing";
      await savePost(post);
      const dir = postDir(clientId, post.id);
      post.slides = await drawSlideArt(dir, client, written.slides, log);
      post.status = "rendering";
      await savePost(post);
      await renderSlides(dir, client, clientDir(clientId), post.slides, log);
    }
    await writeFile(join(postDir(clientId, post.id), "caption.txt"), captionText(post.caption, post.hashtags));
    post.status = "done";
    await savePost(post);
    await setIdea(clientId, ideaId, (i) => {
      i.status = "made";
      i.postId = post.id;
    });
    return post;
  } catch (error) {
    post.status = "failed";
    post.error = error instanceof Error ? error.message : String(error);
    await savePost(post);
    // The idea can be made again.
    await setIdea(clientId, ideaId, (i) => void (i.status = "new"));
    throw error;
  }
}

/** Saves edited slides or caption and renders the slides again; art is redrawn only where its prompt changed. */
export async function rerenderPost(clientId: string, postId: string, edits: { slides?: Slide[]; caption?: string; hashtags?: string[] }, log: (message: string) => void = console.log): Promise<Post> {
  const client = await loadClient(clientId);
  const post = await loadPost(clientId, postId);
  if (edits.caption !== undefined) post.caption = edits.caption;
  if (edits.hashtags) post.hashtags = cleanHashtags(edits.hashtags);
  const dir = postDir(clientId, postId);
  if (edits.slides && post.kind !== "reel") {
    const before = post.slides ?? [];
    const slides = edits.slides.map((slide, i) => (slide.art && slide.art.prompt !== before[i]?.art?.prompt ? { ...slide, art: { prompt: slide.art.prompt } } : slide));
    post.slides = await drawSlideArt(dir, client, slides, log);
    await renderSlides(dir, client, clientDir(clientId), post.slides, log);
  }
  await writeFile(join(dir, "caption.txt"), captionText(post.caption, post.hashtags));
  await savePost(post);
  return post;
}
```

- [ ] **Step 7: Run the tests to see them pass**

Run: `node --test src/clients/make.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 8: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add src/clients/carousel.ts src/clients/reel.ts src/clients/make.ts src/clients/make.test.ts src/render/carousel.ts
git commit -m "Clients: make ideas into carousels, single images and reels"
```

(`src/pipeline.ts` has other uncommitted work: commit its one-word change together with that work, not here.)

---

### Task 7: Server routes and the morning schedule

**Files:**
- Create: `src/clients/schedule.ts`
- Create: `src/clients/schedule.test.ts`
- Create: `src/server/clients.ts`
- Create: `src/clients/onboard.ts`
- Modify: `src/server/index.ts` (one call at the top of `route`, one `startSchedule` call where the server starts listening)

**Interfaces:**
- Consumes: Tasks 1–6, `enqueue`, `recentJobs` (`src/server/jobs.ts`), `readSite` (`src/marketing/site.ts`), `loadProject`.
- Produces: `dueClients(clients, now, hasToday): Client[]`, `startSchedule(run: (client: Client) => void, busy: (client: Client) => boolean): void`, `startClientSchedule(): void`, `clientFromUrl(url, log)`, `nicheFor(client)`, `handleClients(ctx): Promise<boolean>`, where `ctx = { path, method, url, request, response, json, body, sendFile, inside, HttpError }`.

- [ ] **Step 1: Write the failing schedule tests**

```ts
// src/clients/schedule.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

import { dueClients } from "./schedule.ts";

const client = (id: string, dailyIdeas = true) => ({ id, dailyIdeas }) as never;

test("nobody is due before 08:00", () => {
  assert.deepEqual(dueClients([client("a")], new Date(2026, 9, 20, 7, 59), () => false), []);
});

test("after 08:00 a client is due once: when today's file exists, it is not", () => {
  const now = new Date(2026, 9, 20, 9, 0);
  assert.deepEqual(dueClients([client("a"), client("b")], now, (id) => id === "b").map((c: { id: string }) => c.id), ["a"]);
});

test("clients with daily ideas off are never due", () => {
  assert.deepEqual(dueClients([client("a", false)], new Date(2026, 9, 20, 9, 0), () => false), []);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test src/clients/schedule.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the schedule**

```ts
// src/clients/schedule.ts
import { existsSync } from "node:fs";

import { ideasPath, listClients, localDate } from "./store.ts";
import type { Client } from "./types.ts";

const MORNING = 8;
const HOUR = 60 * 60 * 1000;

/** The clients whose ideas for today are due: daily ideas on, past 08:00, no file for today yet. */
export function dueClients(clients: Client[], now: Date, hasToday: (clientId: string) => boolean): Client[] {
  if (now.getHours() < MORNING) return [];
  return clients.filter((client) => client.dailyIdeas && !hasToday(client.id));
}

/**
 * Checks 10 s after the server starts and every hour. A Mac that slept
 * through 08:00 catches up on its first check. A client whose job is already
 * queued (`busy`) is skipped, so a slow job is never queued twice.
 */
export function startSchedule(run: (client: Client) => void, busy: (client: Client) => boolean): void {
  const check = async () => {
    try {
      const today = localDate();
      for (const client of dueClients(await listClients(), new Date(), (id) => existsSync(ideasPath(id, today)))) {
        if (!busy(client)) run(client);
      }
    } catch (error) {
      console.error(`ideas schedule: ${error instanceof Error ? error.message : error}`);
    }
  };
  setTimeout(check, 10_000);
  setInterval(check, HOUR);
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `node --test src/clients/schedule.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Write onboarding (niche, client from a URL)**

```ts
// src/clients/onboard.ts
import { cp, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { generateText, Output } from "ai";
import { z } from "zod";

import { readSite } from "../marketing/site.ts";
import { EMPTY_BRIEF } from "../marketing/session.ts";
import { loadProject, projectDir } from "../project.ts";
import { clientDir, clientFromProject, listClients, saveClient, slugify } from "./store.ts";
import type { Client } from "./types.ts";

const WRITER_MODEL = "anthropic/claude-sonnet-5.5";

/** A free id: "risero", then "risero-2", … */
async function freeId(name: string): Promise<string> {
  const taken = new Set((await listClients()).map((c) => c.id));
  const base = slugify(name) || "client";
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

/** The niche to research, in a few words, from what the client sells and to whom. */
export async function nicheFor(client: Client): Promise<string> {
  const { output } = await generateText({
    telemetry: { functionId: "niche" },
    model: WRITER_MODEL,
    output: Output.object({ schema: z.object({ niche: z.string().describe("3-8 words in English, e.g. 'booking pages for coaches and service providers in Egypt'") }) }),
    prompt: `Name the Instagram niche of this business.\nOffer: ${client.brand.summary}\nBusiness: ${client.brief.business}\nAudience: ${client.brief.audience}`,
  });
  return output.niche.trim();
}

/** A client from a marketing project: its brand, brief and screenshots. */
export async function clientFromMarketingProject(projectId: string): Promise<Client> {
  const project = await loadProject(projectId);
  const client = clientFromProject(project);
  client.id = await freeId(client.name);
  await mkdir(clientDir(client.id), { recursive: true });
  if (existsSync(join(projectDir(projectId), "shots"))) await cp(join(projectDir(projectId), "shots"), join(clientDir(client.id), "shots"), { recursive: true });
  client.niche = await nicheFor(client);
  await saveClient(client);
  return client;
}

const BRIEF = z.object({
  business: z.string(), audience: z.string(), problems: z.array(z.string()), result: z.string(), features: z.array(z.string()),
  cta: z.object({ label: z.string(), url: z.string() }), tone: z.string(), niche: z.string().describe("3-8 words in English"),
});

/** A client from its website: the site is read once, then the brief and niche are filled from it. */
export async function clientFromUrl(url: string, log: (message: string) => void): Promise<Client> {
  const id = await freeId(new URL(/^https?:\/\//.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "").split(".")[0]);
  const brand = await readSite(url, clientDir(id), log);
  log("brief: filling the client's brief from the website ...");
  const { output } = await generateText({
    telemetry: { functionId: "brief" },
    model: WRITER_MODEL,
    output: Output.object({ schema: BRIEF }),
    prompt: `From this website, fill a marketing brief in ${brand.language === "ar" ? "Egyptian Arabic" : "English"} (niche in English).\nName: ${brand.name}\nOffer: ${brand.summary}\nServices: ${brand.services.join(" | ")}\nMain call to action: ${brand.cta ? `${brand.cta.label} → ${brand.cta.url}` : "none found"}\nPage text:\n${brand.text.slice(0, 6000)}`,
  });
  const now = new Date().toISOString();
  const { niche, ...brief } = output;
  const client: Client = {
    id, name: brand.name, url: brand.url, language: brand.language, brand,
    brief: { ...EMPTY_BRIEF, ...brief, cta: brand.cta ?? brief.cta, voice: "male", seconds: 45, platforms: ["Instagram Reels"] },
    niche: niche.trim(), avoid: "", dailyIdeas: true, createdAt: now, updatedAt: now,
  };
  await saveClient(client);
  return client;
}
```

- [ ] **Step 6: Write the routes**

```ts
// src/server/clients.ts
import { spawn } from "node:child_process";
import type { IncomingMessage, ServerResponse } from "node:http";

import { makeIdeas } from "../clients/ideas.ts";
import { claimIdea, makePost, rerenderPost } from "../clients/make.ts";
import { clientFromMarketingProject, clientFromUrl } from "../clients/onboard.ts";
import { startSchedule } from "../clients/schedule.ts";
import { clientDir, listClients, listPosts, loadClient, loadIdeas, loadPost, localDate, postDir, saveClient, saveIdeas } from "../clients/store.ts";
import type { Client, Slide } from "../clients/types.ts";
import { projectDir } from "../project.ts";
import { enqueue, recentJobs } from "./jobs.ts";

type Ctx = {
  path: string;
  method: string;
  url: URL;
  request: IncomingMessage;
  response: ServerResponse;
  json: (response: ServerResponse, status: number, data: unknown) => void;
  body: <T>(request: IncomingMessage) => Promise<T>;
  sendFile: (request: IncomingMessage, response: ServerResponse, path: string) => Promise<void>;
  inside: (base: string, relative: string) => string;
  fail: (status: number, message: string) => Error;
};

const ideasLabel = (client: Pick<Client, "name">) => `Ideas: ${client.name}`;

/** Queues a client's ideas job: by the morning schedule or "Get 5 more". */
function queueIdeas(client: Pick<Client, "id" | "name">) {
  return enqueue(ideasLabel(client), async (log) => (await makeIdeas(client.id, log)).date, undefined, () => clientDir(client.id));
}

/** Whether a client's ideas job is already waiting or running. */
function ideasBusy(client: Pick<Client, "name">): boolean {
  return recentJobs().some((job) => job.label === ideasLabel(client) && (job.status === "queued" || job.status === "running"));
}

export function startClientSchedule(): void {
  startSchedule(queueIdeas, ideasBusy);
}

/** Handles /api/clients… and /client-files/…; false when the path is not one of them. */
export async function handleClients(ctx: Ctx): Promise<boolean> {
  const { path, method, url, request, response, json, body, fail } = ctx;
  let match: RegExpMatchArray | null;

  if (path === "/api/clients" && method === "GET") return json(response, 200, await listClients()), true;

  if (path === "/api/clients" && method === "POST") {
    const input = await body<{ fromProject?: string; url?: string }>(request);
    if (input.fromProject) {
      const job = enqueue("New client from a marketing project", async () => (await clientFromMarketingProject(input.fromProject!)).id, undefined, () => null);
      return json(response, 202, job), true;
    }
    const site = String(input.url ?? "").trim();
    if (!/^(https?:\/\/)?[\w-]+(\.[\w-]+)+/i.test(site)) throw fail(400, "Add the client's website, e.g. https://example.com");
    const job = enqueue(`New client: ${site.replace(/^https?:\/\//, "")}`, async (log) => (await clientFromUrl(site, log)).id, undefined, () => null);
    return json(response, 202, job), true;
  }

  if ((match = path.match(/^\/api\/clients\/([a-z0-9-]+)$/))) {
    const client = await loadClient(match[1]);
    if (method === "GET") return json(response, 200, client), true;
    if (method === "PUT") {
      const edits = await body<Partial<Pick<Client, "name" | "instagramHandle" | "language" | "niche" | "avoid" | "dailyIdeas" | "brief">>>(request);
      if (typeof edits.name === "string" && edits.name.trim()) client.name = edits.name.trim();
      if (typeof edits.instagramHandle === "string") client.instagramHandle = edits.instagramHandle.trim().replace(/^@/, "") || undefined;
      if (edits.language === "ar" || edits.language === "en") client.language = edits.language;
      if (typeof edits.niche === "string") client.niche = edits.niche.trim();
      if (typeof edits.avoid === "string") client.avoid = edits.avoid.trim();
      if (typeof edits.dailyIdeas === "boolean") client.dailyIdeas = edits.dailyIdeas;
      if (edits.brief) client.brief = { ...client.brief, ...edits.brief, cta: { ...client.brief.cta, ...(edits.brief.cta ?? {}) } };
      await saveClient(client);
      return json(response, 200, client), true;
    }
  }

  if ((match = path.match(/^\/api\/clients\/([a-z0-9-]+)\/ideas$/))) {
    const client = await loadClient(match[1]);
    if (method === "GET") {
      const date = url.searchParams.get("date") ?? localDate();
      return json(response, 200, (await loadIdeas(client.id, date)) ?? { date, trends: [], ideas: [] }), true;
    }
    if (method === "POST") {
      if (ideasBusy(client)) throw fail(409, "Ideas for this client are already being written.");
      return json(response, 202, queueIdeas(client)), true;
    }
  }

  if ((match = path.match(/^\/api\/clients\/([a-z0-9-]+)\/ideas\/([0-9-]+)\/(skip|make)$/)) && method === "POST") {
    const [, clientId, ideaId, action] = match;
    const date = ideaId.slice(0, 10);
    if (action === "skip") {
      const day = await loadIdeas(clientId, date);
      const idea = day?.ideas.find((i) => i.id === ideaId);
      if (!day || !idea) throw fail(404, "No such idea");
      idea.status = "skipped";
      await saveIdeas(clientId, day);
      return json(response, 200, day), true;
    }
    const idea = await claimIdea(clientId, date, ideaId).catch((error: Error) => {
      throw fail(409, error.message);
    });
    const client = await loadClient(clientId);
    const job = enqueue(`Make ${idea.format}: ${client.name}: ${idea.hook.slice(0, 40)}`, async (log) => {
      const post = await makePost(clientId, ideaId, log);
      return post.projectId ?? post.id;
      // A reel returns its project id (costs go to the project), a carousel its post id.
    }, undefined, (result) => (typeof result !== "string" ? null : /^\d{12}-/.test(result) ? projectDir(result) : postDir(clientId, result)));
    return json(response, 202, job), true;
  }

  if ((match = path.match(/^\/api\/clients\/([a-z0-9-]+)\/posts$/)) && method === "GET") return json(response, 200, await listPosts(match[1])), true;

  if ((match = path.match(/^\/api\/clients\/([a-z0-9-]+)\/posts\/([a-z0-9-]+)$/))) {
    const [, clientId, postId] = match;
    if (method === "GET") return json(response, 200, await loadPost(clientId, postId)), true;
    if (method === "PUT") {
      const edits = await body<{ slides?: Slide[]; caption?: string; hashtags?: string[] }>(request);
      const job = enqueue(`Re-render post: ${postId}`, async (log) => (await rerenderPost(clientId, postId, edits, log)).id, undefined, () => postDir(clientId, postId));
      return json(response, 202, job), true;
    }
  }

  if ((match = path.match(/^\/api\/clients\/([a-z0-9-]+)\/posts\/([a-z0-9-]+)\/zip$/)) && method === "GET") {
    const dir = postDir(match[1], match[2]);
    response.writeHead(200, { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${match[2]}.zip"` });
    const zip = spawn("zip", ["-q", "-r", "-", "slides", "caption.txt"], { cwd: dir });
    zip.stdout.pipe(response);
    zip.on("error", () => response.end());
    return true;
  }

  if ((match = path.match(/^\/client-files\/([a-z0-9-]+)\/(.+)$/))) {
    await ctx.sendFile(request, response, ctx.inside(clientDir(match[1]), match[2]));
    return true;
  }

  return false;
}
```

- [ ] **Step 7: Wire the routes into the server (additions only)**

In `src/server/index.ts`:

1. Add the import next to the other server imports:

```ts
import { handleClients, startClientSchedule } from "./clients.ts";
```

2. At the top of `route`, right after `let match: RegExpMatchArray | null;`, add:

```ts
  if (path.startsWith("/api/clients") || path.startsWith("/client-files/")) {
    const handled = await handleClients({ path, method, url, request, response, json, body, sendFile, inside, fail: (status, message) => new HttpError(status, message) });
    if (handled) return;
  }
```

3. Where the server starts listening (search for `.listen(`), add `startClientSchedule();` right after the listen call.

- [ ] **Step 8: Check the routes against the running studio**

Restart the studio (stop the running `npm start`, then `npm run server`). Run:

```bash
curl -s localhost:4300/api/clients
curl -s -X POST localhost:4300/api/clients -H 'Content-Type: application/json' -d '{"fromProject":"202610182235-marketing-short-risero-v2"}'
```

Expected: `[]`, then a job JSON with `"status":"queued"`. Within about 10 s, `curl -s localhost:4300/api/clients` lists `risero` with a filled `niche`.

- [ ] **Step 9: Run every test, typecheck, commit**

Run: `npm test && npx tsc --noEmit`
Expected: all PASS, no type errors.

```bash
git add src/clients/schedule.ts src/clients/schedule.test.ts src/clients/onboard.ts src/server/clients.ts
git commit -m "Clients: API routes, onboarding and the 08:00 ideas schedule"
```

(`src/server/index.ts` has other uncommitted work: commit its three added lines with that work.)

---

### Task 8: The screen: Clients inside Marketing mode

**Files:**
- Create: `app/components/ClientView.tsx`
- Modify: `app/api.ts` (add client types and calls)
- Modify: `app/router.ts` (add the `client` page)
- Modify: `app/App.tsx` (load clients, show `ClientView`)
- Modify: `app/components/Sidebar.tsx` (a Clients group under Marketing video)
- Modify: `app/components/MarketingPanel.tsx` (an "Instagram client" button)

**Interfaces:**
- Consumes: the API from Task 7.
- Produces: `api.clients()`, `api.client(id)`, `api.newClient(input)`, `api.editClient(id, edits)`, `api.ideas(id, date?)`, `api.moreIdeas(id)`, `api.makeIdea(id, ideaId)`, `api.skipIdea(id, ideaId)`, `api.posts(id)`, `api.editPost(id, postId, edits)`, `clientFileUrl(id, path)`; `Route` gains `{ page: "client"; id: string }` at `/marketing/clients/:id`.

- [ ] **Step 1: API client (additions to `app/api.ts`)**

At the top, next to the other type imports:

```ts
import type { Client, Idea, IdeaDay, Post, Slide, Trend } from "../src/clients/types.ts";
export type { Client, Idea, IdeaDay, Post, Slide, Trend };
```

Inside `export const api = { … }`, after `createMarketing`:

```ts
  clients: () => call<Client[]>("GET", "/api/clients"),
  client: (id: string) => call<Client>("GET", `/api/clients/${id}`),
  newClient: (input: { fromProject?: string; url?: string }) => call<Job>("POST", "/api/clients", input),
  editClient: (id: string, edits: Partial<Pick<Client, "name" | "instagramHandle" | "language" | "niche" | "avoid" | "dailyIdeas" | "brief">>) => call<Client>("PUT", `/api/clients/${id}`, edits),
  ideas: (id: string, date?: string) => call<IdeaDay>("GET", `/api/clients/${id}/ideas${date ? `?date=${date}` : ""}`),
  moreIdeas: (id: string) => call<Job>("POST", `/api/clients/${id}/ideas`),
  makeIdea: (id: string, ideaId: string) => call<Job>("POST", `/api/clients/${id}/ideas/${ideaId}/make`),
  skipIdea: (id: string, ideaId: string) => call<IdeaDay>("POST", `/api/clients/${id}/ideas/${ideaId}/skip`),
  posts: (id: string) => call<Post[]>("GET", `/api/clients/${id}/posts`),
  editPost: (id: string, postId: string, edits: { slides?: Slide[]; caption?: string; hashtags?: string[] }) => call<Job>("PUT", `/api/clients/${id}/posts/${postId}`, edits),
```

After `sessionUrl`:

```ts
/** A client's file: its logo, or a post's slides and art. */
export const clientFileUrl = (client: string, file: string) => `/client-files/${client}/${file}`;
```

- [ ] **Step 2: Route (additions to `app/router.ts`)**

- In the doc comment, add ` *   /marketing/clients/:id  a client's Instagram ideas and posts`.
- Change the `Route` type to add `| { page: "client"; id: string }`.
- In `parseRoute`, before the `/marketing/${ID}` line, add:

```ts
  if ((match = pathname.match(new RegExp(`^/marketing/clients/${ID}/?$`)))) return { page: "client", id: match[1] };
```

- In `routePath`, add `case "client": return \`/marketing/clients/${route.id}\`;` before `default`.

- [ ] **Step 3: `ClientView`**

```tsx
// app/components/ClientView.tsx
import { useCallback, useEffect, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon, CopyIcon, DownloadIcon, ExternalLinkIcon, SparklesIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { api, clientFileUrl, type Client, type Idea, type IdeaDay, type Job, type Post } from "../api.ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "./shared.tsx";

type Props = { id: string; jobs: Job[]; onOpenProject: (id: string) => void; onChanged: (client: Client) => void };

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const GOAL_LABEL: Record<Idea["goal"], string> = { awareness: "Awareness", details: "Details", offer: "Offer" };
const FORMAT_LABEL: Record<Idea["format"], string> = { carousel: "Carousel", single: "Single image", reel: "Reel" };

/** A client's Instagram: today's ideas, the posts made from them, and the profile the ideas are written from. */
export function ClientView({ id, jobs, onOpenProject, onChanged }: Props) {
  const [client, setClient] = useState<Client | null>(null);
  const [date, setDate] = useState(today);
  const [day, setDay] = useState<IdeaDay | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const mine = jobs.filter((job) => client && (job.label === `Ideas: ${client.name}` || job.label.includes(`: ${client.name}: `)));
  const running = mine.some((job) => job.status === "queued" || job.status === "running");
  const finished = mine.filter((job) => job.status === "done" || job.status === "failed").length;

  const refresh = useCallback(() => {
    api.client(id).then(setClient).catch((error: Error) => toast.error(error.message));
    api.ideas(id, date).then(setDay).catch(() => setDay(null));
    api.posts(id).then(setPosts).catch(() => setPosts([]));
  }, [id, date]);

  // Reload whenever one of this client's jobs finishes.
  useEffect(refresh, [refresh, finished]);

  if (!client) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  const act = (work: Promise<unknown>, done: string) => work.then(() => (toast.success(done), refresh())).catch((error: Error) => toast.error(error.message));

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto p-6">
      <div className="mb-4 flex items-center gap-3">
        {client.brand.logo && <img src={clientFileUrl(client.id, client.brand.logo)} alt="" className="size-10 rounded-lg border object-contain" style={{ background: client.brand.colors.background }} />}
        <div className="grid min-w-0 flex-1">
          <span className="truncate font-semibold">{client.name}</span>
          <span className="truncate text-xs text-muted-foreground">{client.instagramHandle ? `@${client.instagramHandle} · ` : ""}{client.niche}</span>
        </div>
        <Button size="sm" disabled={running} onClick={() => act(api.moreIdeas(client.id), "Writing 5 more ideas…")}>
          <SparklesIcon /> {running ? "Working…" : "Get 5 more"}
        </Button>
      </div>

      <Tabs defaultValue="today">
        <TabsList>
          <TabsTrigger value="today">Ideas</TabsTrigger>
          <TabsTrigger value="posts">Posts {posts.length ? `(${posts.length})` : ""}</TabsTrigger>
          <TabsTrigger value="profile">Profile</TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="grid gap-4">
          <div className="flex items-center gap-2">
            <Input type="date" value={date} max={today()} onChange={(event) => setDate(event.target.value)} className="w-44" />
            {day?.trends.length ? <span className="text-xs text-muted-foreground">{day.trends.length} trends used</span> : null}
          </div>
          {!day?.ideas.length && <p className="text-sm text-muted-foreground">No ideas for this day yet. They are written every morning after 08:00, or press "Get 5 more".</p>}
          <div className="grid gap-3 lg:grid-cols-2">
            {day?.ideas.map((idea) => (
              <div key={idea.id} className={`grid gap-2 rounded-xl border p-4 ${idea.status === "skipped" ? "opacity-50" : ""}`}>
                <div className="flex flex-wrap gap-1.5">
                  <Badge>{FORMAT_LABEL[idea.format]}</Badge>
                  <Badge variant="outline">{GOAL_LABEL[idea.goal]}</Badge>
                  <Badge variant="outline">{idea.angle}</Badge>
                  {idea.status !== "new" && <Badge variant="secondary">{idea.status}</Badge>}
                </div>
                <p className="font-medium" dir="auto">{idea.hook}</p>
                <ol className="list-decimal ps-5 text-sm text-muted-foreground" dir="auto">
                  {idea.outline.map((line, i) => <li key={i}>{line}</li>)}
                </ol>
                <p className="text-xs text-muted-foreground">{idea.why}</p>
                {idea.trend && <a href={idea.trend} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs hover:underline"><ExternalLinkIcon className="size-3" /> trend source</a>}
                <div className="flex gap-2">
                  {idea.status === "new" && <Button size="sm" onClick={() => act(api.makeIdea(client.id, idea.id), `Making the ${FORMAT_LABEL[idea.format].toLowerCase()}…`)}>Make</Button>}
                  {idea.status === "new" && <Button size="sm" variant="ghost" onClick={() => act(api.skipIdea(client.id, idea.id), "Skipped")}><XIcon /> Skip</Button>}
                  {idea.status === "made" && idea.postId && <span className="text-xs text-muted-foreground">Made: see Posts</span>}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="posts" className="grid gap-4 lg:grid-cols-2">
          {!posts.length && <p className="text-sm text-muted-foreground">Make an idea to see its post here.</p>}
          {posts.map((post) => <PostCard key={post.id} client={client} post={post} onOpenProject={onOpenProject} onSaved={refresh} />)}
        </TabsContent>

        <TabsContent value="profile">
          <ProfileForm client={client} onSaved={(next) => (setClient(next), onChanged(next))} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** A made post: a swipeable carousel preview with its caption, or a reel's link. */
function PostCard({ client, post, onOpenProject, onSaved }: { client: Client; post: Post; onOpenProject: (id: string) => void; onSaved: () => void }) {
  const [index, setIndex] = useState(0);
  const [caption, setCaption] = useState(post.caption);
  const count = post.slides?.length ?? 0;
  const text = `${post.caption}\n\n${post.hashtags.map((tag) => `#${tag}`).join(" ")}`;
  const stamp = encodeURIComponent(post.updatedAt);

  return (
    <div className="grid gap-3 rounded-xl border p-4">
      <div className="flex items-center gap-2">
        <Badge>{FORMAT_LABEL[post.kind]}</Badge>
        <Badge variant={post.status === "failed" ? "destructive" : "outline"}>{post.status}</Badge>
        <span className="ms-auto text-xs text-muted-foreground">{new Date(post.createdAt).toLocaleString()}</span>
      </div>
      {post.error && <p className="text-xs text-destructive">{post.error}</p>}

      {post.kind !== "reel" && post.status === "done" && count > 0 && (
        <div className="relative mx-auto w-full max-w-sm">
          <img src={clientFileUrl(client.id, `posts/${post.id}/slides/${String(index + 1).padStart(2, "0")}.png?v=${stamp}`)} alt="" className="aspect-[4/5] w-full rounded-lg border object-cover" />
          {count > 1 && (
            <div className="absolute inset-x-2 top-1/2 flex -translate-y-1/2 justify-between">
              <Button size="icon" variant="secondary" disabled={index === 0} onClick={() => setIndex(index - 1)}><ChevronLeftIcon /></Button>
              <Button size="icon" variant="secondary" disabled={index === count - 1} onClick={() => setIndex(index + 1)}><ChevronRightIcon /></Button>
            </div>
          )}
          <p className="mt-1 text-center text-xs text-muted-foreground">{index + 1} / {count}</p>
        </div>
      )}

      {post.kind === "reel" && post.projectId && (
        <Button variant="outline" onClick={() => onOpenProject(post.projectId!)}>Open the reel</Button>
      )}

      <Field label="Caption" detail={`${post.hashtags.length} hashtags`}>
        <Textarea value={caption} dir="auto" rows={5} onChange={(event) => setCaption(event.target.value)} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(text).then(() => toast.success("Caption copied"))}><CopyIcon /> Copy caption</Button>
        {post.kind !== "reel" && post.status === "done" && (
          <Button size="sm" variant="outline" asChild>
            <a href={`/api/clients/${client.id}/posts/${post.id}/zip`}><DownloadIcon /> Download zip</a>
          </Button>
        )}
        {caption !== post.caption && (
          <Button size="sm" onClick={() => api.editPost(client.id, post.id, { caption }).then(() => (toast.success("Saving…"), onSaved())).catch((error: Error) => toast.error(error.message))}>Save caption</Button>
        )}
      </div>
    </div>
  );
}

/** What ideas and posts are written from. */
function ProfileForm({ client, onSaved }: { client: Client; onSaved: (client: Client) => void }) {
  const [draft, setDraft] = useState(client);
  const brief = draft.brief;
  const setBrief = (change: Partial<Client["brief"]>) => setDraft({ ...draft, brief: { ...brief, ...change } });
  const save = () =>
    api
      .editClient(client.id, {
        name: draft.name, instagramHandle: draft.instagramHandle ?? "", language: draft.language, niche: draft.niche, avoid: draft.avoid, dailyIdeas: draft.dailyIdeas,
        brief: { ...brief, problems: brief.problems.map((l) => l.trim()).filter(Boolean), features: brief.features.map((l) => l.trim()).filter(Boolean) },
      })
      .then((next) => (toast.success("Saved"), onSaved(next)))
      .catch((error: Error) => toast.error(error.message));

  return (
    <div className="grid max-w-2xl gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name"><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
        <Field label="Instagram handle"><Input value={draft.instagramHandle ?? ""} placeholder="risero" onChange={(e) => setDraft({ ...draft, instagramHandle: e.target.value })} /></Field>
      </div>
      <Field label="Niche (what the morning search looks for)"><Input value={draft.niche} onChange={(e) => setDraft({ ...draft, niche: e.target.value })} /></Field>
      <Field label="Business"><Textarea dir="auto" value={brief.business} onChange={(e) => setBrief({ business: e.target.value })} /></Field>
      <Field label="Audience"><Textarea dir="auto" value={brief.audience} onChange={(e) => setBrief({ audience: e.target.value })} /></Field>
      <Field label="Their problems (one per line)"><Textarea dir="auto" rows={5} value={brief.problems.join("\n")} onChange={(e) => setBrief({ problems: e.target.value.split("\n") })} /></Field>
      <Field label="Features (one per line)"><Textarea dir="auto" rows={4} value={brief.features.join("\n")} onChange={(e) => setBrief({ features: e.target.value.split("\n") })} /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Call to action"><Input dir="auto" value={brief.cta.label} onChange={(e) => setBrief({ cta: { ...brief.cta, label: e.target.value } })} /></Field>
        <Field label="Link"><Input value={brief.cta.url} onChange={(e) => setBrief({ cta: { ...brief.cta, url: e.target.value } })} /></Field>
      </div>
      <Field label="Tone"><Input dir="auto" value={brief.tone} onChange={(e) => setBrief({ tone: e.target.value })} /></Field>
      <Field label="Never say"><Textarea dir="auto" value={draft.avoid} onChange={(e) => setDraft({ ...draft, avoid: e.target.value })} /></Field>
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={draft.dailyIdeas} onCheckedChange={(dailyIdeas) => setDraft({ ...draft, dailyIdeas })} /> 5 new ideas every morning
      </label>
      <div><Button onClick={save}>Save profile</Button></div>
    </div>
  );
}
```

- [ ] **Step 4: Show it in `App.tsx` (additions)**

- Import `ClientView` and the `Client` type.
- Add state and a loader next to `refreshChannels`:

```tsx
  const [clients, setClients] = useState<Client[]>([]);
  const refreshClients = useCallback(() => api.clients().then(setClients).catch(() => {}), []);
  const openClient = route.page === "client" ? route.id : null;
  const showClient = useCallback((id: string) => navigate({ page: "client", id }), [navigate]);
```

- Call `refreshClients()` in the first `useEffect` next to `refreshChannels()`.
- In the job loop, after `refreshProjects();`, add:

```tsx
          if (job.label.startsWith("New client") || job.label.startsWith("Ideas: ")) refreshClients();
          if (job.label.startsWith("New client") && job.status === "done" && typeof job.result === "string") showClient(job.result);
```

(Add `refreshClients` and `showClient` to that effect's dependency list.)

- Pass `clients={clients}`, `openClient={openClient}` and `onOpenClient={showClient}` to `AppSidebar`.
- Breadcrumbs: before the `marketing ?` case, add `openClient ? ["Marketing", clients.find((c) => c.id === openClient)?.name ?? "…"] :`.
- In `<main>`, before `marketing ? (`, add:

```tsx
            {openClient ? (
              <ClientView key={openClient} id={openClient} jobs={jobs} onOpenProject={select} onChanged={(client) => setClients((all) => all.map((c) => (c.id === client.id ? client : c)))} />
            ) : marketing ? (
```

  and close the extra branch accordingly.

- [ ] **Step 5: The Clients group in `Sidebar.tsx` (additions)**

- Add to `Props`: `clients: Client[]; openClient: string | null; onOpenClient: (id: string) => void;`, and destructure them.
- The "Marketing video" button keeps its behaviour. Change only its `isActive` to `Boolean(marketing) && !openClient`.
- After the `SidebarGroup` that holds New video / Marketing video, add:

```tsx
        {clients.length > 0 && (
          <SidebarGroup className="group-data-[collapsible=icon]:hidden">
            <SidebarGroupLabel>Clients</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {clients.map((client) => (
                  <SidebarMenuItem key={client.id}>
                    <SidebarMenuButton isActive={openClient === client.id} onClick={() => onOpenClient(client.id)}>
                      <ChannelSwatch color={client.brand.colors.accent} />
                      <span className="truncate">{client.name}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
```

  (Import `type Client` from `../api.ts`. `ChannelSwatch` is already imported from `./shared.tsx`.)

- [ ] **Step 6: The "Instagram client" button in `MarketingPanel.tsx` (addition)**

Next to the badges in the header row, add:

```tsx
        <Button size="sm" variant="outline" disabled={busy} onClick={() => api.newClient({ fromProject: project.id }).then(() => toast.success(`Making ${brand.name} an Instagram client…`)).catch((error: Error) => toast.error(error.message))}>
          Instagram client
        </Button>
```

Import `Button` from `@/components/ui/button`, `toast` from `sonner`, and `api` from `../api.ts`. App.tsx opens the client when the job finishes.

- [ ] **Step 7: Typecheck and build**

Run: `npm run typecheck && npx vite build`
Expected: no type errors; the build succeeds.

- [ ] **Step 8: Commit the new screen file**

```bash
git add app/components/ClientView.tsx
git commit -m "Studio: client page with daily ideas, posts and profile"
```

(The edits to `api.ts`, `router.ts`, `App.tsx`, `Sidebar.tsx` and `MarketingPanel.tsx` sit on top of uncommitted work in those files. Commit them with that work, or together once the user's work is committed.)

---

### Task 9: Real run on Risero

**Files:** none new. This task produces output and fixes what it finds.

- [ ] **Step 1: Start the studio and create the client**

Run `npm start`. Open http://localhost:4300/projects/202610182235-marketing-short-risero-v2 and press **Instagram client**. Expected: the job "New client from a marketing project" finishes, and the browser opens `/marketing/clients/risero` with the logo, the name and a niche.

- [ ] **Step 2: Profile**

On Profile, check the brief came over, and add the handle if the user has given it. Save.

- [ ] **Step 3: Today's ideas**

Press **Get 5 more**. Expected: 5 cards in Egyptian Arabic, with at least 1 reel and 2 carousels, and Awareness, Details and Offer each present. Check that every trend link opens a real page.

- [ ] **Step 4: Two carousels and one single image**

Make two carousel ideas and, if there is one, the single image. On Posts, swipe every slide. Check: right-to-left, brand colours, the small logo, no overflow, numbers marked "مثال" where they are examples, the CTA link correct. Download the zip and check that it holds `slides/*.png` and `caption.txt`.

- [ ] **Step 5: Three reels: awareness, details, offer**

Make the reel idea from the list. For the two goals the list doesn't cover as reels, press **Get 5 more** until a reel with that goal appears, or make one through the API with an idea saved by hand. Expected: each opens as a marketing project, renders `video.mp4`, and has its caption on the Posts tab. Watch each: the hook in the first 2 seconds, about 45 s long, the brand colours.

- [ ] **Step 6: Morning schedule**

Delete today's ideas file only in a copy (`cp -r output/.clients/risero /tmp/risero-backup`), restart the server, and wait 10 s. Expected: one "Ideas: Risero" job starts, and no second one after a further restart within the same day. Restore the file afterwards if you want the earlier ideas back.

- [ ] **Step 7: Report**

Report to the user: links to the client page, the posts, the cost of the run (the CostPanel and job costs), and anything that looked wrong with screenshots of the slides.
