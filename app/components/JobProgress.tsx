import { CheckIcon, CircleXIcon, ClockIcon, Loader2Icon } from "lucide-react";
import { useEffect, useState } from "react";

import { formatCost, type Job } from "../api.ts";
import { cn } from "@/lib/utils";

/** What each stage the pipeline reports is called on screen. */
const STAGE_NAMES: Record<string, string> = {
  site: "Reading the website",
  chat: "Preparing questions",
  research: "Researching",
  script: "Writing the script",
  outline: "Outlining",
  chapter: "Writing chapters",
  check: "Checking numbers",
  "fact-check": "Fact-checking",
  voice: "Recording the voice",
  products: "Product pictures",
  photos: "Finding real photos",
  pictures: "Drawing pictures",
  compose: "Building the animation",
  render: "Rendering video",
  mixing: "Music and sound",
};

/** The stages a job will go through, from its label, so the coming ones show before they start. */
function plannedStages(job: Job): string[] {
  if (job.label.startsWith("Read website")) return ["site", "chat"];
  if (job.label.startsWith("Write script")) return job.label.includes("marketing") ? ["script"] : ["research", "script", "check"];
  if (job.label.startsWith("Voice, pictures")) return ["voice", "compose"];
  if (job.label.startsWith("Render video")) return ["render", "mixing"];
  return [];
}

const nameOf = (stage: string) => STAGE_NAMES[stage] ?? stage.charAt(0).toUpperCase() + stage.slice(1);

function useNow(active: boolean): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

const clock = (ms: number) => {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
};

/**
 * One job as a list of steps: done ones ticked, the current one with a bar
 * (a percentage when the step can be counted), the coming ones greyed; with
 * the time it has taken and what it has cost so far.
 */
export function JobProgress({ job, compact = false, className }: { job: Job; compact?: boolean; className?: string }) {
  const running = job.status === "running";
  const now = useNow(running || job.status === "queued");
  const reached = job.stages.map((stage) => stage.stage);
  const planned = plannedStages(job).filter((stage) => !reached.includes(stage));
  const current = job.stages.at(-1);
  const pct = current?.total ? Math.min(100, Math.round(((current.done ?? 0) / current.total) * 100)) : null;
  const elapsed = (job.finishedAt ?? now) - (job.startedAt ?? job.createdAt);

  const header = (
    <div className="flex items-center gap-2 text-[13px]">
      {job.status === "queued" ? (
        <ClockIcon className="size-4 text-muted-foreground" />
      ) : running ? (
        <Loader2Icon className="size-4 animate-spin text-primary" />
      ) : job.status === "done" ? (
        <CheckIcon className="size-4 text-success" />
      ) : (
        <CircleXIcon className="size-4 text-destructive" />
      )}
      <span className="min-w-0 flex-1 truncate font-medium">{job.status === "queued" ? `Waiting: ${job.label}` : running && current ? nameOf(current.stage) : job.label}</span>
      <span className="font-mono text-[11px] text-muted-foreground tabular-nums">{job.status === "queued" ? "in line" : clock(elapsed)}</span>
      {job.cost > 0 && <span className="rounded-md bg-muted px-1.5 font-mono text-[11px] tabular-nums">{formatCost(job.cost)}</span>}
    </div>
  );

  const bar = running && (
    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
      {pct === null ? <div className="progress-busy h-full w-full opacity-70" /> : <div className="progress-fill h-full rounded-full" style={{ width: `${Math.max(3, pct)}%` }} />}
    </div>
  );

  if (compact)
    return (
      <div className={cn("grid gap-1.5", className)}>
        {header}
        {bar}
        {running && (
          <span className="truncate font-mono text-[11px] text-muted-foreground">
            {pct !== null && current?.total ? `${current.done ?? 0} / ${current.total}${current.stage === "render" ? "%" : ""} · ` : ""}
            {job.log.at(-1) ?? "starting…"}
          </span>
        )}
        {job.status === "failed" && <span className="text-xs text-destructive">{job.error}</span>}
      </div>
    );

  return (
    <div className={cn("grid gap-3 rounded-xl border bg-card p-4", className)}>
      {header}
      <ol className="grid gap-1.5">
        {[...job.stages.map((stage, index) => ({ stage: stage.stage, state: index < job.stages.length - 1 || job.status === "done" ? "done" : job.status === "failed" ? "failed" : "now" })), ...planned.map((stage) => ({ stage, state: "next" }))].map(
          ({ stage, state }, index) => (
            <li key={`${stage}-${index}`} className={cn("flex items-center gap-2.5 text-[13px]", state === "next" && "text-muted-foreground/60")}>
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px]",
                  state === "done" && "border-success/40 bg-success/15 text-success",
                  state === "now" && "border-primary bg-primary/15 text-primary",
                  state === "failed" && "border-destructive/50 bg-destructive/15 text-destructive",
                )}
              >
                {state === "done" ? <CheckIcon className="size-3" /> : state === "now" ? <Loader2Icon className="size-3 animate-spin" /> : state === "failed" ? <CircleXIcon className="size-3" /> : index + 1}
              </span>
              <span className="flex-1">{nameOf(stage)}</span>
              {state === "now" && pct !== null && <span className="font-mono text-[11px] text-muted-foreground tabular-nums">{pct}%</span>}
            </li>
          ),
        )}
      </ol>
      {bar}
      {running && <p className="truncate font-mono text-[11px] text-muted-foreground">{job.log.at(-1) ?? "starting…"}</p>}
      {job.status === "failed" && <p className="text-xs text-destructive">{job.error}</p>}
    </div>
  );
}
