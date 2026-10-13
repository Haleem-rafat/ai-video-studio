import { FORMATS, loadPrompt, type Channel } from "../config.ts";
import { chat, extractJson } from "../llm.ts";
import type { FormatId } from "../types.ts";

export type TopicIdea = { topic: string; title: string; why: string };

export async function suggestTopics(channel: Channel, format: FormatId, count = 10, focus = ""): Promise<TopicIdea[]> {
  const prompt = loadPrompt("topics", {
    channelName: channel.name,
    audience: channel.audience,
    tone: channel.tone,
    formatLabel: FORMATS[format].label,
    focus: focus ? `Focus on: ${focus}` : "",
    count,
  });
  const reply = await chat(prompt, { maxTokens: 3000 });
  const { topics } = extractJson<{ topics: TopicIdea[] }>(reply);

  if (!Array.isArray(topics) || topics.length === 0) throw new Error("Bonsai returned no topics.");

  return topics;
}
