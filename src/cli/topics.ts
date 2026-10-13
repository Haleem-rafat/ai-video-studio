import { parseArgs } from "node:util";

import { loadChannel } from "../config.ts";
import { assertLlmRunning } from "../llm.ts";
import { suggestTopics } from "../script/topics.ts";

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      channel: { type: "string" },
      format: { type: "string", default: "short" },
      count: { type: "string", default: "10" },
      focus: { type: "string", default: "" },
    },
  });

  if (!values.channel) throw new Error('Usage: npm run topics -- --channel dev-pixel [--format short|long] [--count 10] [--focus "AI jobs"]');

  await assertLlmRunning();
  const topics = await suggestTopics(loadChannel(values.channel), values.format === "long" ? "long" : "short", Number(values.count), values.focus);

  topics.forEach((idea, index) => {
    console.log(`\n${index + 1}. ${idea.title}\n   topic: ${idea.topic}\n   why:   ${idea.why}`);
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
