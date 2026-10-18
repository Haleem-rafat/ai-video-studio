import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { generateImage, generateText, Output } from "ai";
import { z } from "zod";

import { cutout } from "../media/products.ts";
import { inBatches } from "../media/voice.ts";
import { reportProgress } from "../progress.ts";
import { recordImage } from "../usage.ts";
import type { Photo, Project, Scene } from "../types.ts";

const ART_MODEL = "anthropic/claude-sonnet-5.5";
const IMAGE_MODEL = "bfl/flux-3-image";


const PLAN = z.object({
  style: z.string().describe("ONE art style for the whole video, e.g. 'soft 3D clay render, rounded shapes, studio lighting' or 'cinematic editorial photography, shallow depth of field'. Picked to suit the brand and its audience"),
  scenes: z
    .array(
      z.object({
        backdrop: z.string().describe("What this scene's full-frame background picture shows: a concrete image that tells the scene's idea (a coach answering messages late at night, a desk calendar overflowing with sticky notes…). Every scene a DIFFERENT image. English, 15-30 words, no text in it"),
        object: z.string().describe("A single object that floats beside this scene's words (a 3D smartphone, a calendar, a chat bubble, a megaphone, a magnifying glass…), described as isolated on a plain white background; or empty for most scenes"),
      }),
    )
    .describe("One entry per scene, in order"),
  cards: z.array(z.string()).min(4).max(8).describe("Pictures a service provider would post on social media (a coach filming a reel, a workshop, a happy client session, behind the scenes…), shown as posts and link previews. English, 12-25 words each, all different, no text in them"),
});

/**
 * Plans the pictures of a marketing video like an art director: one style,
 * a different backdrop for every scene, a few floating objects, and the
 * pictures that stand in for social posts. Nothing is taken from the
 * website, so no frame repeats its screenshots or its owner's photo.
 */
export async function directArt(project: Project, log: (message: string) => void = console.log): Promise<void> {
  const m = project.marketing!;
  const c = m.brand.colors;
  log("art: planning the pictures ...");
  const { output } = await generateText({
    telemetry: { functionId: "art" },
    model: ART_MODEL,
    output: Output.object({ schema: PLAN }),
    prompt: `You are the art director of a ${project.format === "short" ? "vertical 9:16" : "horizontal 16:9"} marketing video for ${m.brand.name}: ${m.brand.summary}
Audience: ${m.brief.audience}
Brand colours: background ${c.background}, accent ${c.accent}, call to action ${c.cta}, text ${c.text}.

Plan pictures made for this video; the website's screenshots are never shown, so every picture is yours to invent. Rules:
- One consistent art style across the whole video, lit and coloured in the brand's palette (deep ${c.background} shadows, ${c.accent} and ${c.cta} light).
- Every scene's backdrop is a different picture that tells that scene's idea. Never repeat a subject.
- Pictures never contain text, letters, numbers, logos, user interfaces or screenshots.
- People are welcome (the audience: coaches, consultants, service providers), shown naturally.
- Give a floating object only to the scenes whose beat is turn, kinetic or stat (they are words alone); leave it empty everywhere else.

The scenes (beat: narration):
${project.scenes.map((scene, i) => `${i + 1}. ${scene.visual.type === "marketing" ? scene.visual.beat : ""}: ${scene.narration}`).join("\n")}`,
  });

  const look = (prompt: string) => `${prompt}. ${output.style}. Colour palette: deep ${c.background}, ${c.accent} and ${c.cta} highlights. No text, no letters, no logos, no user interface`;
  project.scenes.forEach((scene, i) => {
    const plan = output.scenes[i];
    if (!plan || scene.visual.type !== "marketing") return;
    scene.visual.backdrop = { query: look(plan.backdrop), source: "ai" };
    if (plan.object.trim()) scene.visual.object = { query: `${plan.object}. ${output.style}, accents in ${c.accent} and ${c.cta}. A single object centred on a plain white background, no text`, source: "ai" };
    else delete scene.visual.object;
  });
  m.art = { style: output.style, cards: output.cards.map((card) => ({ query: look(card), source: "ai" as const })) };
  log(`art: ${output.style} · ${output.scenes.length} backdrops, ${output.scenes.filter((plan) => plan.object.trim()).length} objects, ${output.cards.length} post pictures`);
}

/** Draws every planned picture that has no file yet; objects are cut out of their white background. */
export async function drawArt(dir: string, project: Project, log: (message: string) => void = console.log): Promise<number> {
  const m = project.marketing!;
  const wide = project.format === "long";
  type Job = { photo: Photo; name: string; aspect: `${number}:${number}`; cut: boolean };
  const jobs: Job[] = [];
  for (const scene of project.scenes as Scene[]) {
    if (scene.visual.type !== "marketing") continue;
    if (scene.visual.backdrop && !scene.visual.backdrop.path) jobs.push({ photo: scene.visual.backdrop, name: `art/${scene.id}-backdrop`, aspect: wide ? "16:9" : "9:16", cut: false });
    if (scene.visual.object && !scene.visual.object.path) jobs.push({ photo: scene.visual.object, name: `art/${scene.id}-object`, aspect: "1:1", cut: true });
  }
  (m.art?.cards ?? []).forEach((card, i) => card.path || jobs.push({ photo: card, name: `art/card-${i + 1}`, aspect: "4:3", cut: false }));
  if (!jobs.length) return 0;

  await mkdir(join(dir, "art"), { recursive: true });
  let done = 0;
  let drawn = 0;
  reportProgress("art", 0, jobs.length);
  await inBatches(jobs, 4, async (job) => {
    try {
      const result = await generateImage({ model: IMAGE_MODEL, prompt: job.photo.query, aspectRatio: job.aspect });
      recordImage(IMAGE_MODEL, result, "art");
      const raw = join(dir, `${job.name}.jpg`);
      await writeFile(raw, result.image.uint8Array);
      if (job.cut) {
        // A floating object needs its white background gone.
        await cutout(raw, join(dir, `${job.name}.png`)).catch(() => null);
        job.photo.path = existsSync(join(dir, `${job.name}.png`)) ? `${job.name}.png` : `${job.name}.jpg`;
      } else job.photo.path = `${job.name}.jpg`;
      drawn++;
    } catch (error) {
      log(`art: ${job.name} failed (${error instanceof Error ? error.message.slice(0, 120) : error})`);
    }
    reportProgress("art", ++done, jobs.length);
  });
  log(`art: ${drawn} of ${jobs.length} picture(s) drawn${drawn < jobs.length ? "; the rest are drawn on the next update" : ""}`);
  return drawn;
}
