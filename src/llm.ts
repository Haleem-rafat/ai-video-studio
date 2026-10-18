import { LLM_URL } from "./config.ts";
import { recordLocal } from "./usage.ts";

type ChatOptions = { maxTokens?: number; thinking?: boolean };

export async function assertLlmRunning(): Promise<void> {
  try {
    const response = await fetch(`${LLM_URL}/health`);
    if (response.ok) return;
  } catch {
    // Falls through to the message below.
  }

  throw new Error(`No LLM at ${LLM_URL}. Start it in another terminal with: npm run llm`);
}

/** One chat turn against llama-server's OpenAI-compatible endpoint. */
export async function chat(prompt: string, options: ChatOptions = {}): Promise<string> {
  const thinking = options.thinking ?? false;
  const started = Date.now();
  const response = await fetch(`${LLM_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: prompt }],
      max_tokens: options.maxTokens ?? 8192,
      // Bonsai's recommended sampling; thinking mode wants the higher temperature.
      temperature: thinking ? 1.0 : 0.7,
      top_p: 0.95,
      top_k: 20,
      min_p: 0.05,
      chat_template_kwargs: { enable_thinking: thinking },
    }),
  });

  if (!response.ok) throw new Error(`LLM ${response.status}: ${await response.text()}`);

  const data = (await response.json()) as { choices: { message: { content: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  recordLocal("local", "Bonsai 27B (this Mac)", Date.now() - started, { inputTokens: data.usage?.prompt_tokens ?? 0, outputTokens: data.usage?.completion_tokens ?? 0 });

  return data.choices[0]?.message.content ?? "";
}

/** Pulls the JSON object out of a reply that may carry <think> blocks or fences. */
export function extractJson<T>(reply: string): T {
  const text = reply.replace(/<think>[\s\S]*?<\/think>/g, "");
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced?.[1] ?? text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");

  if (start === -1 || end <= start) throw new Error("Reply had no JSON object.");

  return JSON.parse(body.slice(start, end + 1)) as T;
}
