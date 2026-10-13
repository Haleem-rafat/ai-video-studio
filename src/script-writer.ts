import { FORMATS, loadPrompt, type Channel, type FormatId } from "./config.ts";
import { chat, extractJson } from "./llm.ts";

export type Visual =
  | { type: "title"; headline: string }
  | { type: "stat"; value: string; label: string }
  | { type: "list"; headline: string; items: string[] }
  | { type: "quote"; text: string; author?: string }
  | { type: "code"; headline: string; lines: string[] };

export type Scene = { narration: string; visual: Visual };

export type Script = {
  title: string;
  description: string;
  tags: string[];
  scenes: Scene[];
};

const VISUAL_TYPES = new Set(["title", "stat", "list", "quote", "code"]);

export function wordCount(script: Script): number {
  return script.scenes.reduce((total, scene) => total + scene.narration.split(/\s+/).filter(Boolean).length, 0);
}

/** Returns the problems with a script; an empty list means it is usable. */
export function checkScript(script: Script, formatId: FormatId): string[] {
  const format = FORMATS[formatId];
  const problems: string[] = [];

  if (!script.title) problems.push("missing title");
  if (!Array.isArray(script.scenes) || script.scenes.length < 3) return [...problems, "fewer than 3 scenes"];

  script.scenes.forEach((scene, index) => {
    if (!scene.narration?.trim()) problems.push(`scene ${index + 1} has no narration`);
    if (!VISUAL_TYPES.has(scene.visual?.type)) problems.push(`scene ${index + 1} has visual type "${scene.visual?.type}"`);
  });

  const words = wordCount(script);
  // 15% slack: a slightly long or short script is still a fine video.
  if (words < format.minWords * 0.85 || words > format.maxWords * 1.15) {
    problems.push(`${words} words, wanted ${format.minWords}-${format.maxWords}`);
  }

  return problems;
}

export async function writeScript(channel: Channel, formatId: FormatId, topic: string, attempts = 3): Promise<Script> {
  const format = FORMATS[formatId];
  const prompt = loadPrompt("script", {
    formatLabel: format.label,
    channelName: channel.name,
    audience: channel.audience,
    tone: channel.tone,
    topic,
    sceneCount: format.sceneCount,
    minWords: format.minWords,
    maxWords: format.maxWords,
  });

  let lastError = "";

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const started = Date.now();
    const reply = await chat(prompt, { maxTokens: formatId === "long" ? 12000 : 4000 });
    const seconds = Math.round((Date.now() - started) / 1000);

    try {
      const script = extractJson<Script>(reply);
      const problems = checkScript(script, formatId);

      if (problems.length === 0) {
        console.log(`  script ok on attempt ${attempt} (${seconds}s, ${wordCount(script)} words)`);
        return script;
      }

      lastError = problems.join("; ");
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    console.log(`  attempt ${attempt} rejected (${seconds}s): ${lastError}`);
  }

  throw new Error(`No usable script after ${attempts} attempts: ${lastError}`);
}
