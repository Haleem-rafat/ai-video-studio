import { gateway, generateText, Output, stepCountIs } from "ai";
import { copyFile, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { z } from "zod";

import { brandDir, type Channel } from "../config.ts";
import { articleImages } from "../media/press.ts";
import { SEO } from "../script/versus.ts";
import { isStory, KINETIC_KINDS, PHONE_MODELS, reelDir, STORY_KINDS, type PhoneModel, type Pose, type Reel, type StoryReel } from "./store.ts";

const RESEARCH_MODEL = "anthropic/claude-sonnet-5.5";
const WRITER_MODEL = "anthropic/claude-sonnet-5.5";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const MAX_PICTURES = 10;
const APPLE_LOGO = "https://upload.wikimedia.org/wikipedia/commons/f/fa/Apple_logo_black.svg";

type Log = (message: string) => void;

/** Searches the web for the news: the maker's own announcement first, then reports. */
async function research(topic: string, log: Log): Promise<string> {
  log(`research: looking up ${topic} ...`);
  const { text, steps } = await generateText({
    telemetry: { functionId: "research" },
    model: RESEARCH_MODEL,
    tools: { search: gateway.tools.perplexitySearch({ maxResults: 8 }) },
    stopWhen: stepCountIs(8),
    prompt:
      `Today is ${new Date().toISOString().slice(0, 10)}. Research this for a 60-second tech news reel: "${topic}". ` +
      "Search the web several times: the maker's own press release or newsroom post and product page first (e.g. apple.com/newsroom), then launch coverage. " +
      "Report the facts with numbers: what was announced and when, prices (US), availability dates, the key specs and how much faster or better than the previous model, as the maker states them. " +
      "For a tool, app or GitHub repo: what it does, its GitHub URL, stars, forks, downloads or users (with the date you saw them), what it costs, how it is installed or started (the real command), and whether and how it can be undone or uninstalled. " +
      "Launched products are official: state their facts plainly. Mark only truly unconfirmed items. " +
      "End with a line 'PRESS:' followed by the URLs of the maker's own press release and product page, then 'SOURCES:' and the other URLs you used.",
  });
  log(`research: ${steps.length} step(s), ${text.length} characters of notes`);
  return text;
}

const urlsAfter = (notes: string, label: string) => {
  const at = notes.indexOf(label);
  return at < 0 ? [] : [...new Set([...notes.slice(at).matchAll(/https?:\/\/[^\s)\]>"']+/g)].map((match) => match[0].replace(/[.,;]+$/, "")))];
};

/** A page's big pictures: Apple Newsroom article photos, else its share image and large <img>s. */
function pagePictures(html: string, page: string): string[] {
  const apple = articleImages(html).map((path) => new URL(path, page).href);
  if (apple.length) return apple;
  const found = [
    ...[...html.matchAll(/<meta[^>]+(?:property|name)="(?:og:image|twitter:image)"[^>]+content="([^"]+)"/g)].map((match) => match[1]),
    ...[...html.matchAll(/<img[^>]+src="([^"]+\.(?:jpe?g|png|webp)[^"]*)"[^>]*>/g)].filter((match) => /large|hero|big|2x|1920|2000/i.test(match[0])).map((match) => match[1]),
  ];
  return [...new Set(found.map((src) => new URL(src.replace(/&amp;/g, "&"), page).href))];
}

/** Downloads the press pages' pictures into media/; returns their file names. */
async function downloadPictures(reel: Reel, pages: string[], log: Log): Promise<string[]> {
  const dir = join(reelDir(reel.id), "media");
  await mkdir(dir, { recursive: true });
  const files: string[] = [];
  for (const page of pages.slice(0, 4)) {
    if (files.length >= MAX_PICTURES) break;
    try {
      const html = await (await fetch(page, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20_000) })).text();
      for (const src of pagePictures(html, page)) {
        if (files.length >= MAX_PICTURES) break;
        const response = await fetch(src, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
        const type = response.headers.get("content-type") ?? "";
        if (!response.ok || !/image\/(jpeg|png|webp)/.test(type)) continue;
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.length < 30_000) continue; // icons and thumbnails
        // Named after the picture, so the writer can tell what it shows (…-chip-…, …-display-…).
        const base = decodeURIComponent(new URL(src).pathname.split("/").pop() ?? "photo").replace(/\.(large|medium|small)?_?2x/g, "").replace(/\.[a-z]+(\.[a-z]+)*$/i, "").replace(/[^A-Za-z0-9-]+/g, "-").slice(0, 60);
        const file = `${base || "photo"}-${files.length + 1}.${type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg"}`;
        await writeFile(join(dir, file), bytes);
        files.push(file);
      }
    } catch (error) {
      log(`media: skipped ${page}: ${error instanceof Error ? error.message : error}`);
    }
  }
  log(`media: ${files.length} press picture(s)`);
  return files;
}

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const LOGIN_WALL = /(sign in|log in|login|تسجيل الدخول)/i;

/** Real screenshots of the source pages (desktop, 2600 px tall at most) into media/shot-N.png. */
async function screenshotPages(reel: Reel, pages: string[], log: Log): Promise<string[]> {
  const dir = join(reelDir(reel.id), "media");
  await mkdir(dir, { recursive: true });
  const files: string[] = [];
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--hide-scrollbars"] });
  try {
    for (const page of pages.filter((url) => !/x\.com|twitter\.com|instagram\.com|facebook\.com|tiktok\.com/.test(url)).slice(0, 3)) {
      const tab = await browser.newPage();
      try {
        await tab.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1.5 });
        await tab.setUserAgent(UA);
        await tab.goto(page, { waitUntil: "networkidle2", timeout: 30_000 });
        // Scrolled through once so lazy pictures load, then back to the top.
        await tab.evaluate(async () => {
          for (let y = 0; y < Math.min(2600, document.documentElement.scrollHeight); y += 400) {
            window.scrollTo(0, y);
            await new Promise((ok) => setTimeout(ok, 150));
          }
          window.scrollTo(0, 0);
        });
        await new Promise((ok) => setTimeout(ok, 600));
        const title = await tab.title();
        const height = await tab.evaluate(() => document.documentElement.scrollHeight);
        // A login wall is not proof of anything.
        if (LOGIN_WALL.test(title) && height < 1400) throw new Error("login wall");
        const file = `shot-${files.length + 1}.png`;
        await tab.screenshot({ path: join(dir, file), clip: { x: 0, y: 0, width: 1280, height: Math.min(2600, Math.max(800, height)) }, captureBeyondViewport: true });
        files.push(file);
      } catch (error) {
        log(`media: no screenshot of ${page}: ${error instanceof Error ? error.message : error}`);
      } finally {
        await tab.close();
      }
    }
  } finally {
    await browser.close();
  }
  log(`media: ${files.length} page screenshot(s)`);
  return files;
}

/** The channel's character poses (its newest set of mascot-*-point/think/wave.png), copied into media/. */
async function copyAvatar(reel: Reel, channel: Channel): Promise<Record<Pose, string>> {
  const dir = brandDir(channel.id);
  const names = await readdir(dir).catch(() => [] as string[]);
  const sets = new Map<string, Partial<Record<Pose, string>>>();
  for (const name of names) {
    const match = /^mascot-(.+)-(point|think|wave)\.png$/.exec(name);
    if (match) sets.set(match[1], { ...sets.get(match[1]), [match[2]]: name });
  }
  const complete = [...sets.entries()].filter(([, set]) => set.point && set.think && set.wave);
  if (!complete.length) throw new Error(`Add a character on ${channel.name}'s channel page first (it speaks in this reel style)`);
  const times = await Promise.all(complete.map(async ([, set]) => (await stat(join(dir, set.point!))).mtimeMs));
  const [, newest] = complete[times.indexOf(Math.max(...times))];
  const out = {} as Record<Pose, string>;
  await mkdir(join(reelDir(reel.id), "media"), { recursive: true });
  for (const pose of ["point", "think", "wave"] as const) {
    await copyFile(join(dir, newest[pose]!), join(reelDir(reel.id), "media", `avatar-${pose}.png`));
    out[pose] = `media/avatar-${pose}.png`;
  }
  return out;
}

const LINES = z.array(z.string()).min(8).max(13).describe(
  "What the narrator says, one short spoken sentence or two per line, 9-12 lines, 58-70 seconds in all. Line 1 is the hook (the news in one breath). The last line asks viewers to comment and to follow the channel by name. " +
    "Write every number, price and percentage in DIGITS ($1,999, 24 ساعة, 30%), product names in Latin script, never a URL or @handle. No line may end with a Latin word or number (put the Arabic word after it).",
);

const SEO_FIELDS = {
  title: z.string().describe(`${SEO.title}; it is a Short, so end with #shorts`),
  description: z.string().describe(SEO.description),
  tags: z.array(z.string()).max(15).describe(SEO.tags),
};

const RPG = z.object({
  ...SEO_FIELDS,
  lines: LINES,
  quests: z.array(z.object({ text: z.string().max(22).describe("UPPERCASE English, at most 22 characters, a fact as a quest, e.g. UNLOCK 12-CORE CPU, 24H BATTERY, PRICE: $1,999") })).length(4),
  subs: z.array(z.object({
    line: z.number().int().describe("Index of the line (0-based)"),
    expression: z.enum(["talk", "smile", "wink"]).describe("The portrait's face: smile or wink on good news and the ending, talk otherwise"),
    key: z.string().describe("The one word or number of the line to underline, copied exactly from it"),
    questIndex: z.number().int().nullable().describe("The quest (0-3) this line proves, checked when the line ends; each quest once, in order, spread over the reel; null for other lines"),
  })),
});

const NEWS = z.object({
  ...SEO_FIELDS,
  lines: LINES,
  company: z.string().describe("The company in the news, e.g. Apple"),
  date: z.string().describe("The announcement date in the channel's language with digits, e.g. 27 أكتوبر 2026"),
  scenes: z.array(z.object({
    from: z.number().int().describe("First line of the scene (0-based); scene 1 starts at 0, each next scene later"),
    to: z.number().int().describe("Last line of the scene; the last scene ends on the last line"),
    picture: z.number().int().describe("Index of the picture in the list that best shows this point"),
    headline: z.string().describe("2-5 bold words in the channel's language (names in Latin), e.g. «أبل نزّلت MacBook Pro 14 بشريحة M6...»"),
    highlight: z.string().describe("The punchline phrase drawn in red after the headline, 2-4 words, e.g. «من غير حفل إطلاق»"),
    stats: z.array(z.object({
      label: z.string().describe("Small label, 1-2 words"),
      value: z.string().describe("Big value, short: «12 نواة», «أسرع 30%», «$1,999», «1.9x»"),
      sub: z.string().describe("Small note under it, 2-4 words, e.g. «مقارنة بـ M5»"),
      count: z.boolean().describe("false for values whose number must not count up from 0 (dates, model numbers like Wi-Fi 7)"),
    })).min(2).max(3),
  })).min(4).max(6),
});

const SHORT_LINES = z.array(z.string()).min(7).max(10).describe(
  "What the narrator says, one short punchy spoken sentence per line, 7-10 lines, 30-45 seconds in all. Fast, friendly, a bit shocked/excited. " +
    "Write every number in DIGITS (16K, 8.2M, $0, 30%), product and tool names in Latin script, never a URL or @handle. No line may end with a Latin word or number (put an Arabic word after it).",
);

const PROOF = z.object({
  ...SEO_FIELDS,
  lines: SHORT_LINES.describe(
    "The story in this order: 1) pain hook, a relatable annoyance in one line with an emoji; 2) reveal: there's a free tool/repo that fixes it; 3) social proof with REAL numbers from the research only (stars, users, downloads); " +
      "4) how easy (one command / one prompt), only if true; 5) safety: how to undo or uninstall, ONLY if the research says how (else say something true about it being free/open source); 6) last line, the CTA: ask viewers to comment the keyword to get the link by DM. " +
      "Numbers as digits, names in Latin script, no URLs or @handles, no line ending on a Latin word.",
  ),
  hook: z.object({ title: z.string().describe("English hook card, 2-5 bold words, e.g. «Run AI On Your Mac»"), highlight: z.string().describe("2-3 words on the blue bar, e.g. «100% Free»") }),
  keyword: z.string().max(12).describe("One short word viewers comment to get the link, e.g. AI, TV, OLLAMA (Latin capitals)"),
  scenes: z.array(z.object({
    from: z.number().int().describe("First line of the scene (0-based); scene 1 starts at 0, each next scene later"),
    to: z.number().int(),
    picture: z.number().int().describe("Index of the screenshot or picture shown in the browser window"),
    url: z.string().describe("The address shown in the browser bar for that picture (the page it came from, without https://)"),
    stat: z.object({ value: z.string().describe("A REAL number from the research, short: 16K, 8.2M, 100+, $0"), label: z.string().describe("Short English label: GitHub stars, models, downloads") }).nullable().describe("A big number card over the picture, only for social-proof scenes; null otherwise"),
  })).min(3).max(6),
  subs: z.array(z.object({
    line: z.number().int(),
    pose: z.enum(["point", "think", "wave"]).describe("The character: point when showing or revealing, think on the pain/question, wave at the CTA"),
    keys: z.array(z.string()).max(2).describe("1-2 words of the line to highlight, copied exactly from it"),
  })),
});

const KINETIC = z.object({
  ...SEO_FIELDS,
  lines: SHORT_LINES,
  keyword: z.string().max(12).describe("One short word viewers comment to get the link (Latin capitals or one Arabic word)"),
  scenes: z.array(z.object({
    from: z.number().int().describe("First line (0-based); scene 1 starts at 0, each next scene later; the last scene (cta) covers the last line"),
    to: z.number().int(),
    kind: z.enum(KINETIC_KINDS as [string, ...string[]]).describe(
      "hook: the first line as big words only. text: big words only. chat: an AI-chat window whose bubbles show what you'd ask and what it answers (from the facts). dm: a DM-style screen with 2-3 bubbles. " +
        "browser: a Mac browser window with a picture. phone: a phone with a picture. counter: ONE real number rolling up. grid: 3-6 short labels (features). cta: the closing ask (always the last scene).",
    ),
    picture: z.number().int().nullable().describe("browser / phone: index of the picture; null otherwise"),
    url: z.string().nullable().describe("browser: the page address without https://"),
    title: z.string().nullable().describe("chat: the window title (the tool's name); cta: the link card's text"),
    messages: z.array(z.string()).max(4).nullable().describe("chat / dm: 2-4 short bubbles in the channel's language, alternating you then the reply, from the facts; never words of a real person or account"),
    counter: z.object({ value: z.string().describe("A REAL number from the research: 16K, 1,200, $0, 8.2M"), label: z.string(), icon: z.enum(["eye", "star", "clock", "dollar", "users", "download", "bolt"]) }).nullable(),
    items: z.array(z.string()).max(6).nullable().describe("grid: 3-6 labels of 1-3 words"),
    button: z.string().nullable().describe("A short button label the cursor clicks inside the mockup (e.g. «Install», «تشغيل»), for 1-2 scenes; null otherwise"),
  })).min(4).max(7),
  subs: z.array(z.object({ line: z.number().int(), key: z.string().describe("The ONE word of the line set in the serif selection box, copied exactly from it") })),
});

const STORY_LINES = z.array(z.string()).min(10).max(14).describe(
  "What the narrator says, one short punchy spoken sentence per line, 10-14 lines, 60-70 seconds in all (YouTube gives Shorts under 60 s no retention report). " +
    "Line 1 is the hook: a surprising fact or question in one breath, no greeting. Build tension (a 'but…' turn in the middle), give an honest verdict, and end by asking a question for the comments and to follow the channel. " +
    "Write every number, price and percentage in DIGITS ($2,899, 16 سنة, 30%), product names in Latin script, never a URL or @handle. No line may end with a Latin word or number (put an Arabic word after it).",
);

const LONG_LINES = z.array(z.string()).min(70).max(200).describe(
  "What the narrator says in a 10-15 minute YouTube video, one spoken sentence per line. Line 1-3 are the hook (under 15 seconds, a surprising fact, no greeting). " +
    "Tell it in order with a clear chapter per part, honest comparisons with real numbers, and end with a verdict, a question for the comments and a request to subscribe. " +
    "Write every number, price and percentage in DIGITS, product names in Latin script, never a URL or @handle. No line may end with a Latin word or number.",
);

const storySchema = (wide: boolean) => z.object({
  ...SEO_FIELDS,
  ...(wide ? { title: z.string().describe(`${SEO.title}; a long video, no #shorts`) } : {}),
  lines: wide ? LONG_LINES : STORY_LINES,
  headline: z.object({
    text: z.string().describe("The opening headline, 6-12 words in the channel's language (names in Latin), a question or a surprising claim, e.g. «ليه تدفع 13 ألف على شي أبل رفضته 16 سنة؟»"),
    highlight: z.string().describe("The punch phrase of the headline, copied exactly from it, 2-5 words"),
  }),
  scenes: z.array(z.object({
    from: z.number().int().describe("First line (0-based); scene 1 starts at 0, each next scene later; the follow scene covers the last line"),
    to: z.number().int(),
    kind: z.enum(STORY_KINDS as [string, ...string[]]).describe(
      "phone: (3D reel only) an iPhone built in 3D for its generation with the real photo beside it, its year and name; use one per iPhone generation. timeline: (3D reel only) a row of all the phones in 3D, the camera gliding to the scene's year. " +
        "hook: the product picture for the opening line. photo: a press picture. layers: an exploded stack of parts (how something is built: display layers, chip parts, a process). " +
        "touch: (3D reel only) a finger pressing a cut-through screen, ripples and the touch grid lighting up, for how touch works. " +
        "quote: a REAL sentence from the press release or a review, with its source. stamp: ONE punch word in a red stamp (e.g. «لكن», «أول مرة», «BUT»). price: one real price counting up. " +
        "bars: 2-3 real numbers compared (prices, scores), the last is the subject. specs: 3-6 short spec pills. choice: two answers for the viewer to pick in the comments. follow: the closing follow card (always the last scene).",
    ),
    label: z.string().nullable().describe("A short caption (2-6 words): photo/hook: what it shows; layers: «مقطع عرضي: …»; stamp: a small chip under it; choice: the question; null if none"),
    picture: z.number().int().nullable().describe("hook / photo: index of the picture; null otherwise"),
    phone: z.enum(PHONE_MODELS as unknown as [string, ...string[]]).nullable().describe("phone / timeline stop: the iPhone body: original (2007), 3g (3G/3GS), 4 (4/4S), 5 (5/5s/SE), 6 (6/6s), 7 (7/8), x (X/XS/XR), 11, 11pro, 12, 13, 14pro, 15, 16, 17, air, 17pro, 18pro, duo; null otherwise"),
    year: z.string().nullable().describe("phone / timeline: the year, e.g. 2007; null otherwise"),
    name: z.string().nullable().describe("phone: the model name in English, e.g. iPhone 3GS; null otherwise"),
    device: z.enum(["laptop", "tablet"]).nullable().describe("3D reel, hook / photo: the device the picture is shown on (laptop for Macs, tablet for iPads and phones); null otherwise"),
    layers: z.array(z.string()).max(6).nullable().describe("layers: 3-6 part names, top to bottom, 1-3 words each (Latin names are fine)"),
    quote: z.object({ source: z.string().describe("Publication or company, e.g. Apple Newsroom, The Verge"), text: z.string().describe("The real sentence, in the channel's language (translated faithfully), at most 30 words"), highlight: z.string().describe("2-5 words copied exactly from text") }).nullable(),
    stamp: z.string().nullable().describe("stamp: 1-2 words"),
    price: z.object({ value: z.string().describe("A REAL price as written in the research: $2,899, ₹3,49,900"), label: z.string().describe("What it is, 2-4 words") }).nullable(),
    bars: z.array(z.object({ label: z.string().describe("1-3 words"), value: z.number().describe("The plain number, for the bar height"), shown: z.string().describe("How it is written: $1,999") })).max(3).nullable(),
    delta: z.string().nullable().describe("bars: the difference as a sticker, e.g. «+$900», «2x»"),
    specs: z.array(z.string()).max(6).nullable().describe("specs: 3-6 pills of 1-3 words with real numbers: «OLED 14.2 إنش», «M6 Pro», «24 ساعة بطارية»"),
    choice: z.array(z.string()).max(2).nullable().describe("choice: exactly 2 short answers, e.g. [«تستاهل», «غالية»]"),
  })).min(7).max(wide ? 80 : 11),
  subs: z.array(z.object({ line: z.number().int(), key: z.string().describe("The ONE word or number of the line to stress, copied exactly from it") })),
});

/**
 * The follow card's picture, copied into media/: the channel's cartoon character (its newest
 * mascot pose), else its YouTube logo. The logo can be the creator's own photo, so the character wins.
 */
async function copyLogo(reel: Reel, channel: Channel): Promise<string | undefined> {
  const mascot = channel.brand?.mascots?.find((file) => file.includes("-wave.")) ?? channel.brand?.mascots?.[0];
  const file = mascot ?? channel.brand?.logo;
  if (!file) return undefined;
  await mkdir(join(reelDir(reel.id), "media"), { recursive: true });
  const name = `${mascot ? "channel-avatar" : "channel-logo"}${file.slice(file.lastIndexOf("."))}`;
  try {
    await copyFile(join(brandDir(channel.id), file), join(reelDir(reel.id), "media", name));
    return `media/${name}`;
  } catch {
    return undefined;
  }
}

/** Researches the topic and writes the reel's lines and its style's screens; pictures go in media/. */
export async function writeReel(reel: Reel, channel: Channel, log: Log = console.log): Promise<Reel> {
  const notes = await research(reel.topic, log);
  const pages = urlsAfter(notes, "PRESS:");
  // Proof and motion reels show the real pages first, then the maker's pictures.
  const shots = reel.style === "proof" || reel.style === "kinetic" ? await screenshotPages(reel, pages, log) : [];
  const avatar = reel.style === "proof" ? await copyAvatar(reel, channel) : undefined;
  const media = [...shots, ...(reel.style === "rpg" ? [] : await downloadPictures(reel, pages, log))];
  if (reel.style !== "rpg" && !media.length) log("media: no pictures found; add pictures on the reel's page");

  const language = channel.dialect ?? (channel.language === "ar" ? "Modern Standard Arabic" : "English");
  const voice = `You write 60-second tech news reels for "${channel.name}".
Audience: ${channel.audience}
Tone: ${channel.tone}
Language: ${language}. Write the lines, headlines, stat labels and the description in it.
Use ONLY facts from the research below; every number said must match it. Be honest about who should upgrade.`;

  log(`script: writing the ${reel.style} reel ...`);
  if (reel.style === "rpg") {
    const { output } = await generateText({
      telemetry: { functionId: "script" },
      model: WRITER_MODEL,
      output: Output.object({ schema: RPG }),
      prompt: `${voice}

The reel looks like a retro RPG: a quest log of 4 facts that get checked off as the narrator proves them, and a pixel character saying the lines.

Topic: ${reel.topic}

Research:
${notes}`,
    });
    return {
      ...reel,
      title: output.title,
      lines: output.lines,
      rpg: {
        level: 1,
        character: { preset: "girl", name: channel.brand?.handle ?? channel.name },
        quests: output.quests.map((quest) => ({ text: quest.text.toUpperCase(), xp: 50 })),
        subs: output.subs.map((sub) => ({ line: sub.line, expression: sub.expression, key: sub.key, ...(sub.questIndex !== null ? { questIndex: sub.questIndex } : {}) })),
      },
      youtube: { title: output.title, description: output.description, tags: output.tags },
      sources: urlsAfter(notes, "PRESS:"),
    };
  }

  const pictures = media.length ? media.map((file, i) => `${i}: ${file}${file.startsWith("shot-") ? ` (screenshot of ${pages.filter((url) => !/x\.com|twitter\.com|instagram\.com|facebook\.com|tiktok\.com/.test(url))[Number(file.match(/\d+/)![0]) - 1] ?? "a source page"})` : ""}`).join("\n") : "(none yet; use picture 0)";
  const pick = (n: number | null) => (media.length && n !== null ? `media/${media[Math.max(0, Math.min(media.length - 1, n))]}` : "");
  const short = `You write 30-45 second viral tech reels (Instagram Reels, YouTube Shorts) for "${channel.name}".
Audience: ${channel.audience}
Language: ${language}. Write the lines, bubbles and the description in it; the hook card and stat labels in English.
Use ONLY facts from the research below; every number must be in it. Never invent tweets, posts, messages of real people, or numbers.`;

  if (reel.style === "proof") {
    const { output } = await generateText({
      telemetry: { functionId: "script" },
      model: WRITER_MODEL,
      output: Output.object({ schema: PROOF }),
      prompt: `${short}

The reel: the top half shows the proof (a real screenshot or picture inside a Mac browser window, with a big number card on social-proof scenes); the bottom half the channel's cartoon character talking at a desk. An English hook card opens it; the last line asks viewers to comment the keyword.

Pictures:
${pictures}

Topic: ${reel.topic}

Research:
${notes}`,
    });
    return {
      ...reel,
      title: output.title,
      lines: output.lines,
      media: media.map((file) => `media/${file}`),
      proof: {
        hook: output.hook,
        keyword: output.keyword,
        avatar: avatar!,
        scenes: output.scenes.map((scene) => ({ lines: [scene.from, scene.to], media: pick(scene.picture), url: scene.url, ...(scene.stat ? { stat: scene.stat } : {}) })),
        subs: output.subs.map((sub) => ({ line: sub.line, pose: sub.pose, keys: sub.keys })),
      },
      youtube: { title: output.title, description: output.description, tags: output.tags },
      sources: pages,
    };
  }

  if (isStory(reel.style)) {
    const look = reel.style === "3d"
      ? "The look is a 3D explainer on charcoal with teal glow: the product built in 3D (a MacBook or iPad) with a press picture on its screen and a moving camera, the display's layers exploding apart in 3D, and a finger touching a cut-through screen; the word being said stands alone and big under it. Use hook and 2-3 photo scenes (each a different picture), one layers scene for how it is built, and one touch scene if touch matters to the topic; the rest 2D (price, bars, specs, stamp, choice)."
      : reel.style === "diagram"
      ? "The look is a calm explainer on charcoal: a headline with a gold punch phrase opens it, then ONE picture per scene in the middle and the word being said alone and big under it. Explain how the thing works (use layers at least once for how it is built) and why it matters."
      : "The look cuts between a dark stage under a spotlight (product photos, a red stamp, the big price, the follow card) and light grid paper (press quotes with the phrase highlighted, a bar chart of prices, spec pills, a choice). Tell it like a story: what happened, the history (a real quote), the catch (a stamp), the price (price + bars), then let viewers pick in the comments.";
    const { output } = await generateText({
      telemetry: { functionId: "script" },
      model: WRITER_MODEL,
      output: Output.object({ schema: storySchema(reel.shape === "wide") }),
      prompt: `${reel.shape === "wide" ? short.replace("30-45 second viral tech reels (Instagram Reels, YouTube Shorts)", "10-15 minute 16:9 YouTube videos") : short.replace("30-45 second", "60-70 second")}

${look} Start with a hook scene (a picture), use 7-11 scenes with at least 5 different kinds, never the same kind twice in a row, and end with the follow scene on the last line. Every price, number and quote must come from the research.

Pictures:
${pictures}

Topic: ${reel.topic}

Research:
${notes}`,
    });
    const logo = await copyLogo(reel, channel);
    const story: StoryReel = {
      headline: output.headline,
      ...(logo ? { logo } : {}),
      scenes: output.scenes.map((scene) => {
        // Only the 3D reel draws a touch scene; the others explain it with layers.
        const kind = (scene.kind === "touch" && reel.style !== "3d" ? "layers" : scene.kind) as StoryReel["scenes"][number]["kind"];
        const picture = kind === "hook" || kind === "photo" ? pick(scene.picture ?? 0) : "";
        return {
          lines: [scene.from, scene.to] as [number, number],
          kind,
          ...(scene.label ? { label: scene.label } : {}),
          ...(picture ? { media: picture } : {}),
          ...(picture && scene.device && reel.style === "3d" ? { device: scene.device } : {}),
          ...(kind === "phone" ? { phone: (scene.phone ?? "17pro") as PhoneModel, ...(scene.picture !== null ? { media: pick(scene.picture) } : {}) } : {}),
          ...(scene.year && (kind === "phone" || kind === "timeline") ? { year: scene.year } : {}),
          ...(scene.name && kind === "phone" ? { title: scene.name } : {}),
          ...(scene.layers?.length ? { layers: scene.layers } : {}),
          ...(scene.quote ? { quote: scene.quote } : {}),
          ...(scene.stamp ? { stamp: scene.stamp } : {}),
          ...(scene.price ? { price: scene.price } : {}),
          ...(scene.bars?.length ? { bars: scene.bars } : {}),
          ...(scene.delta ? { delta: scene.delta } : {}),
          ...(scene.specs?.length ? { specs: scene.specs } : {}),
          ...(scene.choice?.length === 2 ? { choice: [scene.choice[0], scene.choice[1]] as [string, string] } : {}),
        };
      }),
      subs: output.subs,
    };
    const phones = story.scenes.filter((scene) => scene.kind === "phone" && scene.year);
    if (phones.length) story.timeline = phones.map((scene) => ({ year: scene.year!, title: scene.title ?? "", phone: scene.phone }));
    return {
      ...reel,
      title: output.title,
      lines: output.lines,
      media: media.map((file) => `media/${file}`),
      story,
      youtube: { title: output.title, description: output.description, tags: output.tags },
      sources: pages,
    };
  }

  if (reel.style === "kinetic") {
    const { output } = await generateText({
      telemetry: { functionId: "script" },
      model: WRITER_MODEL,
      output: Output.object({ schema: KINETIC }),
      prompt: `${short}

The reel has no presenter: kinetic words on black (the line being said, one key word per line in a serif selection box) over UI mockups that change per scene. Start with a hook scene, mix 4-7 scene kinds (at least one browser or phone with a real picture, one counter with a real number if the research has one), end with the cta scene on the last line.

Pictures:
${pictures}

Topic: ${reel.topic}

Research:
${notes}`,
    });
    return {
      ...reel,
      title: output.title,
      lines: output.lines,
      media: media.map((file) => `media/${file}`),
      kinetic: {
        keyword: output.keyword,
        scenes: output.scenes.map((scene) => {
          const kind = scene.kind as (typeof KINETIC_KINDS)[number];
          const picture = kind === "browser" || kind === "phone" ? pick(scene.picture ?? 0) : "";
          return {
            lines: [scene.from, scene.to] as [number, number],
            kind,
            ...(picture ? { media: picture } : {}),
            ...(scene.url ? { url: scene.url } : {}),
            ...(scene.title ? { title: scene.title } : {}),
            ...(scene.messages?.length ? { messages: scene.messages } : {}),
            ...(scene.counter ? { counter: scene.counter } : {}),
            ...(scene.items?.length ? { items: scene.items } : {}),
            ...(scene.button ? { button: scene.button } : {}),
          };
        }),
        subs: output.subs,
      },
      youtube: { title: output.title, description: output.description, tags: output.tags },
      sources: pages,
    };
  }
  const { output } = await generateText({
    telemetry: { functionId: "script" },
    model: WRITER_MODEL,
    output: Output.object({ schema: NEWS }),
    prompt: `${voice}

The reel looks like breaking news: 4-6 scenes, each covering 1-3 consecutive lines, with a press picture, a bold headline ending in a red punchline, and 2-3 stat cards of the scene's numbers.

Pictures (their file names say what they show):
${pictures}

Topic: ${reel.topic}

Research:
${notes}`,
  });
  // A company logo for the header; only Apple's is known so far, the rest show their name.
  let logo: string | undefined;
  if (/^apple$/i.test(output.company)) {
    const response = await fetch(APPLE_LOGO, { headers: { "User-Agent": UA } }).catch(() => null);
    if (response?.ok) {
      await writeFile(join(reelDir(reel.id), "media", "company-logo.svg"), new Uint8Array(await response.arrayBuffer()));
      logo = "media/company-logo.svg";
    }
  }
  return {
    ...reel,
    title: output.title,
    lines: output.lines,
    media: media.map((file) => `media/${file}`),
    news: {
      company: { name: output.company, ...(logo ? { logo } : {}) },
      credit: `الصور: ${output.company}`,
      source: `المصدر: ${output.company}`,
      date: output.date,
      scenes: output.scenes.map((scene) => ({ lines: [scene.from, scene.to], media: pick(scene.picture), headline: scene.headline, highlight: scene.highlight, stats: scene.stats.map(({ count, ...stat }) => (count ? stat : { ...stat, count: false })) })),
    },
    youtube: { title: output.title, description: output.description, tags: output.tags },
    sources: urlsAfter(notes, "PRESS:"),
  };
}
