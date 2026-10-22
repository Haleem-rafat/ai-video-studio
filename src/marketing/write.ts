import { generateText, Output } from "ai";
import { z } from "zod";

import { MARKETING_BEATS, type Creativity, type FormatId, type MarketingBrief, type Scene, type SiteBrand } from "../types.ts";

const WRITER_MODEL = "anthropic/claude-sonnet-5.5";

/** Gemini speaks about this many words a second; the length in the brief sets the word budget. */
const WORDS_PER_SECOND = { ar: 2.3, en: 2.6 };

const DRAFT = z.object({
  title: z.string().describe("Video title for YouTube / the post's first line: the brand and the result, under 70 characters"),
  caption: z.string().describe("The social post text: a hook line, 2-4 short lines on the result, the call to action with its link"),
  hashtags: z.array(z.string()).max(8).describe("Without #"),
  scenes: z
    .array(
      z.object({
        beat: z.enum(MARKETING_BEATS).describe(
          "journey: a phone scrolls the brand's content (a video, a like, a comment, a tap on the profile, posts and comments piling up). " +
            "pain: the customer's problems pop up as message bubbles. turn: one calm sentence alone on screen, the turning point. " +
            "page: an infographic of the page's anatomy: a page drawn in the brand's colours, generic grey first then made its own, its parts lighting up with labelled callouts (about you, services, work, reviews, booking). " +
            "booking: a 'book' button, free slots, one picked and confirmed, two calendars syncing. " +
            "traffic: 3 posts (Instagram, Facebook, TikTok) each with its own link, visitors flowing to the page. " +
            "dashboard: where visitors come from, as bars, then the best one highlighted. " +
            "recap: the product's 3 parts joined up (e.g. Your page → Bookings → Insights). cta: the call to action as a big button with an arrow to the link. " +
            "MOTION GRAPHICS (no screenshots): kinetic: kinetic typography, the headline's words are the picture, punched in one by one as said, key words highlighted. " +
            "chaos: scattered pieces (messages, links, forms, notes) drift and jitter, then fly together into one neat card (headline) — a metaphor for 'everything in one place'. " +
            "path: a glowing dot travels a drawn path through 3-5 stations that light up — a journey or a process. stat: one big number counting up inside a ring. " +
            "split: before and after side by side, a wipe turns the messy side into the clean one. notify: a phone lock screen collecting notifications (new booking, reminder sent). " +
            "orbit: 3-6 parts or channels circle the logo, then get pulled into it. sting: the logo built from brand shapes with a light sweep and a tagline (headline). " +
            "links: a customer's question (headline) with a typing indicator, then you answer with link after link, each opening a different preview, piling up. conflict: a week's calendar fills with appointments and two collide, with a clear conflict mark",
        ),
        narration: z.string().describe("What the voice says in this scene"),
        headline: z.string().describe("turn: the sentence itself. cta: the button text. booking: the booking button text. Others: a 1-4 word title or empty"),
        words: z.array(z.string()).max(3).describe("1-3 short on-screen phrases (1-3 words each) taken from the narration, appearing as they are said; never whole sentences"),
        items: z
          .array(z.object({ label: z.string(), value: z.string() }))
          .max(6)
          .describe(
            "journey: 3-5 things the viewer checks (label: a video, a post, a comment...; value: a short comment text or empty). pain: 2-5 problems as the customer would type them. " +
              "page: 3-5 parts of the page in this order: about you, services, work, reviews, booking (label: the part in 1-3 words; value: an icon word: user, star, note, heart, calendar). booking: 4-6 time slots (label: a time like 10:00 or ١٠:٠٠ ص). " +
              "traffic: 3 sources (label: Instagram/Facebook/TikTok; value: its link tag like ?from=reel-12). dashboard: 3-5 traffic sources or countries (label; value: a share as a number 0-100). " +
              "recap: the 3 parts. kinetic: 0-2 words of the headline to highlight. chaos: 4-7 scattered pieces (label: 1-3 words like 'رسالة متأخرة', 'لينك في البايو'; value: a tiny icon word: message, link, form, calendar, note, question). " +
              "path: 3-5 stations (label 1-3 words; value: icon word: eye, heart, user, calendar, check, chart, message, link). stat: ONE item, label is the number with no unit (15), value is its unit and meaning (دقيقة مكالمة مجانية). " +
              "split: 2-4 rows, label the before (messy), value the after (clean). notify: 2-4 notifications (label: title, value: detail). orbit: 3-6 parts or channels. sting: empty. " +
              "links: 3-5 links you send (label: what it is, like 'فيديو التعريف', 'بوست الأسعار'; value: a short link like instagram.com/p/…). conflict: 3-5 appointments (label: who or what); the last two collide. turn and cta: empty",
          ),
      }),
    )
    .min(4),
});

export type MarketingDraft = { title: string; caption: string; hashtags: string[]; scenes: Scene[] };

/**
 * Writes a marketing video from the brief: the structure and direction of
 * the given script, adapted to the brand read from its website, in the
 * chosen language, sized to the brief's length.
 */
/** The pure motion-graphics beats: what a creative video is mostly made of. */
const MOTION_BEATS = ["kinetic", "chaos", "path", "stat", "split", "notify", "orbit", "sting", "links", "conflict"];

/** The beats that show the real website or re-create its screens. */
const SITE_BEATS = ["page", "journey", "traffic", "booking", "dashboard"];

/** Why a draft doesn't meet its creativity level, or null when it does. */
function missesDirection(beats: string[], creativity: Creativity): string | null {
  if (creativity === "faithful") return null;
  const motion = beats.filter((beat) => MOTION_BEATS.includes(beat)).length;
  const site = beats.filter((beat) => SITE_BEATS.includes(beat)).length;
  const share = creativity === "bold" ? 0.7 : 0.5;
  const problems: string[] = [];
  if (motion < Math.ceil(beats.length * share)) problems.push(`only ${motion} of ${beats.length} scenes use the motion-graphics beats (${MOTION_BEATS.join(", ")}); at least ${Math.ceil(beats.length * share)} must`);
  if (creativity === "bold" && site) problems.push(`a bold video never re-creates the site (${SITE_BEATS.join(", ")}), and this draft does ${site} time(s)`);
  if (creativity === "creative" && site > 1) problems.push(`a creative video shows the site or its screens once at most, and this draft does ${site} times`);
  if (beats.some((beat, i) => i && beat === beats[i - 1])) problems.push("two scenes in a row use the same beat");
  return problems.length ? problems.join("; ") : null;
}

/**
 * The script's voice-over, sentence by sentence: the lines under
 * "التعليق الصوتي:" or "Voice:" up to the scene's animation notes. A client's
 * approved copy, which a faithful video speaks word for word.
 */
export function voiceOver(script: string): string[] {
  // Only a heading that starts its line: a director's note that mentions the voice-over is not one.
  const blocks = [...script.matchAll(/(?:^|\n)\s*(?:التعليق الصوتي|Voice)\s*:\s*\n?([\s\S]*?)(?=\n(?:الحركات|Animation)|\n\s*\n|$)/g)].map((match) => match[1]);
  return blocks
    .join("\n")
    .split(/(?<=[.!?؟])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.split(/\s+/).length >= 3);
}

const words = (text: string) => text.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);

/** The voice-over sentences the narration leaves out (fewer than 80% of their words said in order). */
function missingLines(lines: string[], narration: string): string[] {
  const said = words(narration).join(" ");
  return lines.filter((line) => {
    const wanted = words(line);
    const found = wanted.filter((word) => said.includes(word)).length;
    return found / wanted.length < 0.8 || !said.includes(wanted.slice(0, 3).join(" "));
  });
}

/** What each creativity level asks of the writer. */
const DIRECTION: Record<Creativity, string> = {
  faithful: `Tell the script's story exactly, scene by scene, explaining the product with infographics and animated diagrams in the brand's colours — never screenshots of its website. When the script has voice-over text (التعليق الصوتي / Voice), it is the client's approved copy: use it WORD FOR WORD, in order, across the scenes; only drop sentences if the length forces it. Split every script scene into 2-4 beats that follow its own animation notes, for example: a phone feed with likes, a tap on the profile and things piling up → journey; a message with a typing indicator → pain; a conversation full of links → links; a calendar with overlapping appointments → conflict; the calm sentence → turn; the page building, the template swap and what the page holds → page (once; later page moments become kinetic or orbit); booking and calendars syncing → booking; posts with their own links sending visitors → traffic; the dashboard → dashboard; the closing sentence of a scene → turn or kinetic; the montage and Your Page → Bookings → Insights → recap; the call to action → cta.`,
  creative: `You are a senior motion designer and copywriter, not a screen recorder. The website is research: its facts, its offer and its colours, nothing more. At least HALF the scenes must be pure motion-graphics beats (kinetic, chaos, path, stat, split, notify, orbit, sting); the rest can be pain, turn, recap and the cta. Re-create the product's screens (page, journey, traffic, booking, dashboard) in ONE scene at most, where seeing it work sells. Turn each idea into a visual metaphor: scattered DMs and links become chaos → one card, the customer's journey becomes a path, a free 15-minute call becomes a stat, the before/after becomes a split, bookings arriving become notifications, all channels feeding one page become an orbit. Every scene is a fresh visual idea; never the same beat twice in a row; vary rhythm (a fast punchy scene, then a calm one). Open on a bold kinetic or sting hook. The script is the story to tell, not a shot list: keep its message, invent the visuals.`,
  bold: `You are an award-winning motion designer with full creative freedom. Never show the website or re-create its screens (no page, journey, traffic, booking or dashboard beats). At least 70% of the scenes are pure motion graphics (kinetic, chaos, path, stat, split, notify, orbit, sting); the rest only pain, turn, recap and the cta. Open on a sting or a kinetic hook. Surprise the viewer: unexpected word plays, contrasts, a rhythm that builds. Copy can be punchier and more playful than the script, but every claim stays true to the brief.`,
};

export async function writeMarketing(
  input: {
    brand: SiteBrand;
    brief: MarketingBrief;
    script: string;
    language: "en" | "ar";
    format: FormatId;
    creativity?: Creativity;
    /** Value content: teaches one thing, never sells; the brand only signs the last scene. */
    value?: boolean;
    /** The Arabic to write in, e.g. "Gulf (Khaleeji) colloquial Arabic"; Egyptian when unset. */
    arabic?: string;
  },
  log: (message: string) => void = console.log,
): Promise<MarketingDraft> {
  const { brand, brief, script, language, format, value } = input;
  const creativity = input.creativity ?? "faithful";
  // Approved voice-over sets the length: every line is spoken, however long that takes.
  const approved = creativity === "faithful" ? voiceOver(script) : [];
  const approvedWords = approved.reduce((sum, line) => sum + words(line).length, 0);
  const arabic = language === "ar";
  const budget = Math.max(Math.round(brief.seconds * WORDS_PER_SECOND[language]), approvedWords);
  const seconds = Math.round(budget / WORDS_PER_SECOND[language]);
  const scenes = seconds <= 35 ? "4-5" : seconds <= 70 ? "6-7" : seconds <= 110 ? "7-9" : seconds <= 170 ? "10-13" : "12-16";
  log(`script: writing a ${brief.seconds}s marketing video for ${brand.name} ...`);
  const prompt = `You write marketing videos for social media, animated in the brand's own colours and fonts.

CREATIVE DIRECTION (${creativity}): ${DIRECTION[creativity]}

Language: ${arabic ? `${input.arabic ?? "Egyptian colloquial Arabic"}, natural and calm, like explaining the idea to a business owner, not reading an ad. Brand and platform names in Latin script (Risero, Instagram).` : "Simple, natural English, calm, like explaining the idea to a business owner, not reading an ad."}
Format: ${format === "short" ? "vertical 9:16" : "horizontal 16:9"} for ${brief.platforms.join(", ")}.
Length: about ${seconds} seconds = about ${budget} spoken words in total, in ${scenes} scenes.${approved.length ? ` The script's voice-over is ${approvedWords} words of approved copy: EVERY sentence of it is spoken, word for word, in order — split long voice-over across several scenes rather than cutting it.` : ""}

THE SCRIPT (${creativity === "faithful" ? "structure, story, tone and animation direction to follow. Keep its story: the customer's journey and the problem first, a calm turning point, then the solution shown on the real page, booking, data, and one call to action. Shorten or merge its scenes to fit the length; for a short video keep only the strongest beats (journey or pain → turn → page → cta)" : "the story and message to tell; its animation notes are only inspiration — the creative direction above decides the visuals"}).
---
${script}
---

THE BRAND (read from ${brand.url}):
Name: ${brand.name}
Offer: ${brand.summary}
Services: ${brand.services.join(" | ")}
Page text:
${brand.text.slice(0, 6000)}

THE BRIEF (from the chat with the client — it wins over the script where they differ):
Business: ${brief.business}
Audience: ${brief.audience}
Problems: ${brief.problems.join(" | ")}
${
    value
      ? "THIS IS VALUE CONTENT, NOT AN AD: teach the viewer ONE practical thing they can do today, even if they never buy. Never name the brand or show or describe the product or its features in any scene but the last; no pitch, no \"and that's how we solve it\". The product's features are listed only so you can avoid them."
      : `Result to sell: ${brief.result}`
  }
Features${value ? " (do NOT show or describe)" : " to show"}: ${brief.features.join(" | ")}
Proof: ${brief.proof || "none — do not mention testimonials, client counts or results"}
Dashboard numbers: ${brief.data === "real" ? "real ones the client gave (use only those in the notes)" : "examples: keep them plausible and round; the video labels them as examples"}
${value ? "Closing: a tip to remember, or a question that makes people comment or save; no booking, no link, no offer" : `Call to action: "${brief.cta.label}" → ${brief.cta.url}`}
Tone: ${brief.tone}
Notes: ${brief.notes || "none"}

Rules:
- ${value ? "One idea, one takeaway, taught clearly with an example the audience recognises. Each scene does one job." : "Sell the result, not a feature list. Each scene does one job."}
- The first scene hooks in the first 2 seconds: a question or a moment the audience recognises.
- Only features from the brief. Never invent numbers, prices, testimonials or guarantees.
- Write every number, time and percentage in digits ("15 دقيقة", "3 posts", "48%").
- Never say or title that numbers are examples, demo or "تجريبية": the video labels example numbers on screen by itself.
- On-screen words are short phrases from the narration (e.g. ${arabic ? "«صفحة مخصصة»، «حجوزات منظمة»، «افهم جمهورك»" : "\"Your own page\", \"Bookings sorted\", \"Know your audience\""}), never whole sentences.
${
    value
      ? `- The last scene is the cta beat used as the sign-off: its headline is the closing question or "save this" line (not a button to buy or book), its narration asks the viewer to comment or save; the brand's name may appear there only.
- Never use the page, booking, traffic or dashboard beats: they show the product.`
      : `- The last scene is the cta: its headline is the button text, its narration says where the link is${format === "short" ? " (in the bio or below the post)" : " (below the video)"}.
- Use a beat only if the brand really does it (no booking beat without bookings, no dashboard without analytics).`
  }`;

  const write = (extra = "") => generateText({ telemetry: { functionId: "script" }, model: WRITER_MODEL, output: Output.object({ schema: DRAFT }), prompt: prompt + extra });
  let { output } = await write();
  // Approved voice-over left out is sent back once to be put in, word for word.
  const dropped = missingLines(approved, output.scenes.map((scene) => scene.narration).join(" "));
  if (dropped.length) {
    log(`script: ${dropped.length} voice-over line(s) left out, putting them back ...`);
    ({ output } = await write(`\n\nYOUR FIRST DRAFT LEFT OUT THESE APPROVED VOICE-OVER LINES:\n${dropped.map((line) => `- ${line}`).join("\n")}\nWrite the scenes again with EVERY voice-over line spoken word for word, in the script's order. Add scenes where needed (keep each scene's narration to 1-4 sentences).`));
    const still = missingLines(approved, output.scenes.map((scene) => scene.narration).join(" "));
    if (still.length) log(`script: ${still.length} line(s) still differ from the script: ${still.map((line) => line.slice(0, 40)).join(" | ")}`);
  }
  // A draft that plays it safe at a creative level is sent back once to be redesigned.
  const miss = missesDirection(output.scenes.map((scene) => scene.beat), creativity);
  if (miss) {
    log(`script: redesigning the scenes (${miss}) ...`);
    ({ output } = await write(`\n\nYOUR FIRST DRAFT USED THESE BEATS: ${output.scenes.map((scene) => scene.beat).join(" → ")}. It does not follow the creative direction: ${miss}. Redesign the scenes to meet it; keep the message.`));
  }

  return {
    title: output.title.trim(),
    caption: output.caption.trim(),
    hashtags: output.hashtags.map((tag) => tag.replace(/^#/, "").replace(/\s+/g, "")),
    // A bold video never shows the website, whatever the writer chose; value content never shows the product's screens either.
    scenes: output.scenes
      .map((scene) => (creativity === "bold" && (scene.beat === "page" || scene.beat === "journey") ? { ...scene, beat: "kinetic" as const } : scene))
      .map((scene) => (value && ["page", "booking", "traffic", "dashboard", "sting"].includes(scene.beat) ? { ...scene, beat: "kinetic" as const } : scene)).map((scene, index) => ({
      id: `s${String(index + 1).padStart(3, "0")}`,
      narration: scene.narration.trim(),
      visual: {
        type: "marketing",
        beat: scene.beat,
        headline: scene.headline.trim(),
        words: scene.words.map((word) => word.trim()).filter(Boolean),
        items: scene.items.map((item) => ({ label: item.label.trim(), ...(item.value.trim() ? { value: item.value.trim() } : {}) })).filter((item) => item.label),
      },
      imagePrompt: "",
    })),
  };
}
