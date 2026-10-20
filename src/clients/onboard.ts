import { existsSync } from "node:fs";
import { cp, mkdir } from "node:fs/promises";
import { join } from "node:path";

import { generateText, Output } from "ai";
import { z } from "zod";

import { EMPTY_BRIEF } from "../marketing/session.ts";
import { readSite } from "../marketing/site.ts";
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
  business: z.string(),
  audience: z.string(),
  problems: z.array(z.string()),
  result: z.string(),
  features: z.array(z.string()),
  cta: z.object({ label: z.string(), url: z.string() }),
  tone: z.string(),
  niche: z.string().describe("3-8 words in English"),
});

/** A client from its website: the site is read once, then the brief and niche are filled from it. */
export async function clientFromUrl(url: string, log: (message: string) => void): Promise<Client> {
  const full = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  const id = await freeId(new URL(full).hostname.replace(/^www\./, "").split(".")[0]);
  const brand = await readSite(full, clientDir(id), log);
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
    id,
    name: brand.name,
    url: brand.url,
    language: brand.language,
    brand,
    brief: { ...EMPTY_BRIEF, ...brief, cta: brand.cta ?? brief.cta, voice: "male", seconds: 45, platforms: ["Instagram Reels"] },
    niche: niche.trim(),
    avoid: "",
    dailyIdeas: true,
    createdAt: now,
    updatedAt: now,
  };
  await saveClient(client);
  return client;
}
