import { AsyncLocalStorage } from "node:async_hooks";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { registerTelemetry, type Telemetry } from "ai";

import { OUTPUT_DIR } from "./config.ts";

/** Costs that belong to no video: channel imports, style reads, topic ideas. */
export const STUDIO_LEDGER = join(OUTPUT_DIR, ".usage");

/**
 * What every video costs to make. Each AI call is one entry: which step of
 * the pipeline asked for it, which model answered, what it cost and how
 * much it used. Calls through the AI Gateway carry their real cost in
 * dollars; ElevenLabs is estimated from its characters; Bonsai and the
 * renderer run on this Mac and cost nothing but time. Entries are kept per
 * project in usage.json (and per marketing chat before it has a project).
 */
export type UsageEntry = {
  at: string;
  /** The job (or chat turn) the call belongs to, e.g. "Render video (high)". */
  job: string;
  /** The pipeline step: research, script, check, voice, timing, pictures, photos, website, chat, brief, render… */
  step: string;
  kind: "text" | "speech" | "transcription" | "image" | "local" | "render";
  model: string;
  /** US dollars. */
  cost: number;
  /** The cost is worked out here, not reported by the provider. */
  estimated?: boolean;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  cachedTokens?: number;
  characters?: number;
  audioSeconds?: number;
  images?: number;
  ms?: number;
  generationId?: string;
  /** Copied from the marketing chat that led to this video. */
  fromChat?: boolean;
};

type Ledger = { job: string; step?: string; entries: UsageEntry[] };

const ledger = new AsyncLocalStorage<Ledger>();

/** ElevenLabs is billed by character; this is the Creator plan's overage price. */
const ELEVENLABS_PER_1K = Number(process.env.ELEVENLABS_USD_PER_1K_CHARS ?? 0.3);

const gatewayOf = (metadata: unknown) => ((metadata as Record<string, Record<string, unknown>> | undefined)?.gateway ?? {}) as Record<string, unknown>;

function add(entry: Omit<UsageEntry, "at" | "job" | "step"> & { step?: string }): void {
  const current = ledger.getStore();
  if (!current) return;
  current.entries.push({ at: new Date().toISOString(), job: current.job, step: entry.step ?? current.step ?? entry.kind, ...entry });
}

/** Runs work and collects every AI call it makes. */
export async function collectUsage<T>(job: string, work: () => Promise<T>, entries: UsageEntry[] = []): Promise<{ value?: T; error?: unknown; entries: UsageEntry[] }> {
  const store: Ledger = { job, entries };
  try {
    const value = await ledger.run(store, work);
    return { value, entries: store.entries };
  } catch (error) {
    return { error, entries: store.entries };
  }
}

/** Labels the AI calls made inside `work` with a pipeline step. */
export function step<T>(name: string, work: () => Promise<T>): Promise<T> {
  const current = ledger.getStore();
  if (!current) return work();
  return ledger.run({ ...current, step: name }, work);
}

/** An image call: AI SDK telemetry doesn't cover images, so the call site reports it. */
export function recordImage(model: string, result: { providerMetadata?: unknown; images?: unknown[] }, stepName?: string): void {
  const gateway = gatewayOf(result.providerMetadata);
  add({ kind: "image", model, cost: Number(gateway.cost ?? 0), images: result.images?.length ?? 1, generationId: gateway.generationId as string | undefined, ...(stepName ? { step: stepName } : {}) });
}

export function recordElevenLabs(characters: number, stepName = "voice"): void {
  add({ kind: "speech", step: stepName, model: "elevenlabs/eleven_multilingual_v2", cost: (characters / 1000) * ELEVENLABS_PER_1K, estimated: true, characters });
}

/** Work done on this Mac: Bonsai writing, HyperFrames rendering. */
export function recordLocal(kind: "local" | "render", model: string, ms: number, extra: Partial<UsageEntry> = {}): void {
  add({ kind, model, cost: 0, ms, ...extra });
}

class Ledgers implements Telemetry {
  onLanguageModelCallEnd(event: Parameters<NonNullable<Telemetry["onLanguageModelCallEnd"]>>[0]) {
    const gateway = gatewayOf(event.providerMetadata);
    add({
      kind: "text",
      model: event.modelId,
      ...(event.functionId ? { step: event.functionId } : {}),
      cost: Number(gateway.cost ?? 0),
      inputTokens: event.usage.inputTokens ?? 0,
      outputTokens: event.usage.outputTokens ?? 0,
      reasoningTokens: event.usage.outputTokenDetails?.reasoningTokens ?? 0,
      cachedTokens: event.usage.inputTokenDetails?.cacheReadTokens ?? 0,
      ms: Math.round(event.performance.responseTimeMs),
      generationId: gateway.generationId as string | undefined,
    });
  }

  onEnd(event: Parameters<NonNullable<Telemetry["onEnd"]>>[0]) {
    const e = event as unknown as { operationId: string; modelId: string; providerMetadata?: unknown; text?: string; durationInSeconds?: number; functionId?: string };
    if (e.operationId !== "ai.generateSpeech" && e.operationId !== "ai.transcribe") return;
    const gateway = gatewayOf(e.providerMetadata);
    const speech = e.operationId === "ai.generateSpeech";
    add({
      kind: speech ? "speech" : "transcription",
      step: e.functionId ?? (speech ? "voice" : "timing"),
      model: e.modelId,
      cost: Number(gateway.cost ?? 0),
      ...(speech ? { characters: e.text?.length ?? 0 } : { audioSeconds: e.durationInSeconds ?? 0 }),
      generationId: gateway.generationId as string | undefined,
    });
  }
}

registerTelemetry(new Ledgers());

const FILE = "usage.json";

export async function readUsage(dir: string): Promise<UsageEntry[]> {
  const path = join(dir, FILE);
  if (!existsSync(path)) return [];
  return JSON.parse(await readFile(path, "utf8")) as UsageEntry[];
}

export async function appendUsage(dir: string, entries: UsageEntry[]): Promise<void> {
  if (!entries.length) return;
  if (dir === STUDIO_LEDGER) await mkdir(dir, { recursive: true });
  if (!existsSync(dir)) return;
  const all = [...(await readUsage(dir)), ...entries];
  await writeFile(join(dir, `${FILE}.tmp`), JSON.stringify(all, null, 1));
  await rename(join(dir, `${FILE}.tmp`), join(dir, FILE));
}

export type UsageSummary = {
  cost: number;
  /** Part of the cost that is an estimate (ElevenLabs). */
  estimated: number;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  characters: number;
  audioSeconds: number;
  images: number;
  renderMs: number;
  localMs: number;
  bySteps: { step: string; cost: number; calls: number }[];
  byModels: { model: string; kind: UsageEntry["kind"]; cost: number; calls: number; inputTokens: number; outputTokens: number }[];
};

export function summarize(entries: UsageEntry[]): UsageSummary {
  const steps = new Map<string, { step: string; cost: number; calls: number }>();
  const models = new Map<string, UsageSummary["byModels"][number]>();
  const total: UsageSummary = { cost: 0, estimated: 0, calls: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0, characters: 0, audioSeconds: 0, images: 0, renderMs: 0, localMs: 0, bySteps: [], byModels: [] };
  for (const e of entries) {
    total.cost += e.cost;
    if (e.estimated) total.estimated += e.cost;
    total.calls += e.kind === "render" ? 0 : 1;
    total.inputTokens += e.inputTokens ?? 0;
    total.outputTokens += e.outputTokens ?? 0;
    total.reasoningTokens += e.reasoningTokens ?? 0;
    total.characters += e.characters ?? 0;
    total.audioSeconds += e.audioSeconds ?? 0;
    total.images += e.images ?? 0;
    if (e.kind === "render") total.renderMs += e.ms ?? 0;
    if (e.kind === "local") total.localMs += e.ms ?? 0;
    const s = steps.get(e.step) ?? { step: e.step, cost: 0, calls: 0 };
    s.cost += e.cost;
    s.calls += 1;
    steps.set(e.step, s);
    const m = models.get(e.model) ?? { model: e.model, kind: e.kind, cost: 0, calls: 0, inputTokens: 0, outputTokens: 0 };
    m.cost += e.cost;
    m.calls += 1;
    m.inputTokens += e.inputTokens ?? 0;
    m.outputTokens += e.outputTokens ?? 0;
    models.set(e.model, m);
  }
  total.bySteps = [...steps.values()].sort((a, b) => b.cost - a.cost);
  total.byModels = [...models.values()].sort((a, b) => b.cost - a.cost);
  return total;
}
