import { useEffect, useState } from "react";
import { ExternalLinkIcon } from "lucide-react";

import { api, formatCost, type Channel, type ProjectUsage, type ReelState } from "../api.ts";
import { CostPanel } from "./CostPanel.tsx";
import { youtubeState } from "./PublishDialog.tsx";

/**
 * What a reel costs: research and writing (Claude Sonnet + web search) about $0.17; the Gemini voice
 * about $0.017 per 1,000 characters and Whisper word timing $0.006 per minute, from the studio's own
 * usage records (Oct 2026). Rendering runs on this Mac: free.
 */
export const REEL_PRICES = { write: 0.17, voicePer1k: 0.017, timingPerMinute: 0.006 } as const;

/** What voicing these lines costs (Egyptian narration runs about 14 characters a second). */
export const voiceEstimate = (lines: string[]) => {
  const characters = lines.join("").length;
  return (characters / 1000) * REEL_PRICES.voicePer1k + (characters / 14 / 60) * REEL_PRICES.timingPerMinute;
};

/** The lines a Preview or Render would voice: those without a take at the reel's speed. */
export const unvoiced = (reel: ReelState) => reel.lines.filter((line, i) => line.trim() && !reel.takes?.[i]);

const STYLE_NAMES = { rpg: "RPG reel", news: "Breaking news reel", proof: "Proof reel", kinetic: "Motion reel", diagram: "Diagram reel", editorial: "Editorial reel", "3d": "3D reel", aurora: "Aurora glass reel", variety: "Variety captions reel", flat: "Flat vector reel", sketch: "Sketch notebook reel" } as const;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}

/** The reel's details and everything it has cost: per job run, per step, per model and every call. */
export function ReelInfo({ reel, channel }: { reel: ReelState; channel?: Channel }) {
  const [usage, setUsage] = useState<ProjectUsage | null>(null);
  useEffect(() => void api.reelUsage(reel.id).then(setUsage).catch(() => setUsage(null)), [reel.id, reel.updatedAt, reel.cost]);

  const words = reel.lines.join(" ").split(/\s+/).filter(Boolean).length;
  const pending = unvoiced(reel);
  const next = pending.length ? voiceEstimate(pending) : 0;
  // Each job run: Write, and every Preview or Render that voiced lines.
  const runs = new Map<string, { job: string; at: string; cost: number; calls: number }>();
  for (const entry of usage?.entries ?? []) {
    const run = runs.get(entry.job) ?? { job: entry.job, at: entry.at, cost: 0, calls: 0 };
    run.cost += entry.cost;
    run.calls++;
    runs.set(entry.job, run);
  }
  const voicedUntracked = reel.voice && !(usage?.entries ?? []).some((entry) => entry.step === "voice");

  return (
    <div className="grid gap-4">
      <section className="grid gap-3 rounded-lg border p-4">
        <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Cost</h3>
        <div className="grid gap-2 sm:grid-cols-3">
          <Stat label="Spent so far" value={formatCost(reel.cost)} detail="As charged by the AI Gateway" />
          <Stat label="Next Preview or Render" value={formatCost(next)} detail={pending.length ? `${pending.length} line${pending.length === 1 ? "" : "s"} to voice and time` : "The voice is up to date"} />
          <Stat label="Rendering" value="$0" detail="Free (this Mac)" />
        </div>
        {voicedUntracked && <p className="text-xs text-muted-foreground">This reel's voice was made before cost tracking, so its voice cost isn't counted here.</p>}
        {runs.size > 0 && (
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-[12px]">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-3 py-1.5 text-left font-medium">Job</th>
                  <th className="px-2 py-1.5 text-left font-medium">When</th>
                  <th className="px-2 py-1.5 text-right font-medium">Calls</th>
                  <th className="px-3 py-1.5 text-right font-medium">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {[...runs.values()].map((run) => (
                  <tr key={run.job}>
                    <td className="max-w-80 truncate px-3 py-1.5">{run.job}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{new Date(run.at).toLocaleString()}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{run.calls}</td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums">{formatCost(run.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex min-h-48 flex-col rounded-lg border">
        <CostPanel reelId={reel.id} version={`${reel.updatedAt}:${reel.cost}`} />
      </section>

      <section className="grid gap-2 rounded-lg border p-4">
        <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Details</h3>
        <dl className="grid grid-cols-[9rem_1fr] gap-x-4 gap-y-1.5 text-sm">
          <Row label="Style">{STYLE_NAMES[reel.style]}</Row>
          {reel.client ? <Row label="Client">{reel.client.id} · voice {reel.client.voice}{reel.client.dialect ? ` · ${reel.client.dialect}` : ""}</Row> : <Row label="Channel">{channel?.name ?? reel.channel}</Row>}
          {reel.instagram && <Row label="Instagram caption"><span dir="auto" className="whitespace-pre-line">{`${reel.instagram.caption}\n\n${reel.instagram.hashtags.map((tag) => `#${tag}`).join(" ")}`}</span></Row>}
          <Row label="Topic"><span dir="auto">{reel.topic}</span></Row>
          <Row label="Created">{new Date(reel.createdAt).toLocaleString()}</Row>
          {reel.updatedAt && <Row label="Updated">{new Date(reel.updatedAt).toLocaleString()}</Row>}
          <Row label="Lines">{reel.lines.length} lines · {words} words</Row>
          <Row label="Length">{reel.voice ? `${reel.voice.seconds.toFixed(1)}s voiced` : `about ${Math.round(words / 2.3)}s (not voiced yet)`}</Row>
          <Row label="Voice">{reel.voiceCurrent ? `Up to date (${new Date(reel.voice!.at).toLocaleString()})` : reel.voice ? `${pending.length} changed line${pending.length === 1 ? "" : "s"} to voice` : "Not voiced yet"}{reel.options?.speed ? ` · ${reel.options.speed}× speed` : ""}</Row>
          <Row label="Rendered">{reel.render ? `${new Date(reel.render.at).toLocaleString()} · ${reel.render.seconds.toFixed(0)}s` : "Not yet"}</Row>
          <Row label="YouTube">
            {reel.upload ? (
              <a href={reel.upload.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
                {youtubeState(reel.upload)} on {reel.upload.youtubeChannel} <ExternalLinkIcon className="size-3" />
              </a>
            ) : (
              "Not uploaded"
            )}
          </Row>
          {reel.sources?.length ? (
            <Row label="Sources">
              <ul className="grid gap-0.5 text-xs">
                {reel.sources.map((source) => (
                  <li key={source}>
                    <a href={source} target="_blank" rel="noreferrer" className="break-all text-muted-foreground hover:underline">{source}</a>
                  </li>
                ))}
              </ul>
            </Row>
          ) : null}
        </dl>
      </section>
    </div>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="grid gap-0.5 rounded-lg border bg-card px-3 py-2.5">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="font-mono text-base font-semibold tabular-nums">{value}</span>
      {detail && <span className="text-[11px] text-muted-foreground">{detail}</span>}
    </div>
  );
}
