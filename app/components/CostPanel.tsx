import { ChevronDownIcon, Loader2Icon } from "lucide-react";
import { useEffect, useState } from "react";

import { api, formatCost, type ProjectUsage } from "../api.ts";
import { cn } from "@/lib/utils";

/** What each step of the pipeline is called in the cost breakdown. */
const STEP_NAMES: Record<string, string> = {
  website: "Reading the website",
  chat: "Chat (brief)",
  research: "Web research",
  script: "Script writing",
  check: "Number check",
  voice: "Voice",
  timing: "Word timing (captions)",
  pictures: "AI pictures",
  photos: "Real photos",
  products: "Product pictures",
  character: "Character",
  brand: "Channel style",
  local: "Bonsai (this Mac)",
  render: "Rendering (this Mac)",
};

const KIND_NAMES = { text: "Text", speech: "Voice", transcription: "Listening", image: "Image", local: "Local", render: "Render" } as const;

const tokens = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const minutes = (ms: number) => (ms >= 60_000 ? `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s` : `${Math.round(ms / 1000)}s`);

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="grid gap-0.5 rounded-lg border bg-card px-3 py-2.5">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="font-mono text-base font-semibold tabular-nums">{value}</span>
      {detail && <span className="text-[11px] text-muted-foreground">{detail}</span>}
    </div>
  );
}

/** What this video cost: the total, by step, by model, and every AI call. */
export function CostPanel({ projectId, version }: { projectId: string; version: number }) {
  const [usage, setUsage] = useState<ProjectUsage | null>(null);
  const [showCalls, setShowCalls] = useState(false);

  useEffect(() => {
    api.usage(projectId).then(setUsage, () => setUsage({ entries: [], summary: { cost: 0, estimated: 0, calls: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0, characters: 0, audioSeconds: 0, images: 0, renderMs: 0, localMs: 0, bySteps: [], byModels: [] } }));
  }, [projectId, version]);

  if (!usage) return <div className="flex flex-1 items-center justify-center"><Loader2Icon className="size-5 animate-spin text-muted-foreground" /></div>;

  const s = usage.summary;
  if (!usage.entries.length)
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-1 p-6 text-center text-sm text-muted-foreground">
        <span>No costs recorded yet.</span>
        <span className="text-xs">Costs are counted from now on: every script, voice, picture and render made in the studio.</span>
      </div>
    );

  const max = Math.max(...s.bySteps.map((step) => step.cost), 0.0001);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="grid gap-4 p-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label="Total cost" value={formatCost(s.cost)} detail={s.estimated ? `${formatCost(s.estimated)} of it estimated (ElevenLabs)` : "As charged by the AI Gateway"} />
          <Stat label="AI calls" value={String(s.calls)} />
          <Stat label="Tokens" value={`${tokens(s.inputTokens)} in`} detail={`${tokens(s.outputTokens)} out${s.reasoningTokens ? ` · ${tokens(s.reasoningTokens)} thinking` : ""}`} />
          <Stat label="Voice" value={`${s.characters.toLocaleString()} chars`} detail={s.audioSeconds ? `${Math.round(s.audioSeconds)}s of audio timed` : undefined} />
          <Stat label="Pictures" value={String(s.images)} />
          <Stat label="Render time" value={s.renderMs ? minutes(s.renderMs) : "—"} detail="On this Mac, free" />
        </div>

        <section className="grid gap-2">
          <h3 className="text-xs font-medium text-muted-foreground">Where the money went</h3>
          <div className="grid gap-1.5">
            {s.bySteps.map((step) => (
              <div key={step.step} className="grid grid-cols-[9rem_1fr_4.5rem] items-center gap-3 text-[13px]">
                <span className="truncate">{STEP_NAMES[step.step] ?? step.step}</span>
                <span className="h-2 overflow-hidden rounded-full bg-muted">
                  <span className="progress-fill block h-full rounded-full" style={{ width: `${Math.max(step.cost ? 3 : 0, (step.cost / max) * 100)}%` }} />
                </span>
                <span className="text-right font-mono text-xs tabular-nums">{formatCost(step.cost)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-2">
          <h3 className="text-xs font-medium text-muted-foreground">Models used</h3>
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-[12px]">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-3 py-1.5 text-left font-medium">Model</th>
                  <th className="px-2 py-1.5 text-left font-medium">For</th>
                  <th className="px-2 py-1.5 text-right font-medium">Calls</th>
                  <th className="px-2 py-1.5 text-right font-medium">Tokens</th>
                  <th className="px-3 py-1.5 text-right font-medium">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {s.byModels.map((model) => (
                  <tr key={model.model}>
                    <td className="px-3 py-1.5 font-mono">{model.model}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{KIND_NAMES[model.kind]}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{model.calls}</td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums">{model.inputTokens || model.outputTokens ? `${tokens(model.inputTokens)} / ${tokens(model.outputTokens)}` : "—"}</td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums">{formatCost(model.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid gap-2">
          <button type="button" onClick={() => setShowCalls(!showCalls)} className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
            <ChevronDownIcon className={cn("size-3.5 transition-transform", !showCalls && "-rotate-90")} />
            Every call ({usage.entries.length})
          </button>
          {showCalls && (
            <div className="divide-y overflow-hidden rounded-lg border text-[12px]">
              {[...usage.entries].reverse().map((entry, index) => (
                <div key={index} className="grid grid-cols-[1fr_auto] gap-x-3 px-3 py-1.5">
                  <span className="truncate">
                    {STEP_NAMES[entry.step] ?? entry.step} · <span className="font-mono text-muted-foreground">{entry.model}</span>
                    {entry.fromChat && <span className="text-muted-foreground"> · from the chat</span>}
                  </span>
                  <span className="font-mono tabular-nums">{entry.estimated ? "~" : ""}{formatCost(entry.cost)}</span>
                  <span className="col-span-2 font-mono text-[11px] text-muted-foreground">
                    {new Date(entry.at).toLocaleString()} · {entry.job}
                    {entry.inputTokens ? ` · ${tokens(entry.inputTokens)} in / ${tokens(entry.outputTokens ?? 0)} out` : ""}
                    {entry.characters ? ` · ${entry.characters} chars` : ""}
                    {entry.audioSeconds ? ` · ${Math.round(entry.audioSeconds)}s audio` : ""}
                    {entry.ms ? ` · ${minutes(entry.ms)}` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
