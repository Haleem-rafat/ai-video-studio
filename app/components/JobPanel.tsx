import { CheckIcon, ChevronDownIcon, CircleXIcon, CopyIcon, EyeOffIcon, HistoryIcon, Loader2Icon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { formatWhen, type Job, type ProjectSummary } from "../api.ts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { JobProgress } from "./JobProgress.tsx";

type Filter = "all" | "running" | "failed";

/** Browser storage can be blocked; the panel works without it. */
const stored = {
  get: (key: string) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch {}
  },
};

/**
 * Bottom-right: what the studio is doing. Closed, it is a small pill that
 * shows the running step and its percentage; it never opens by itself, so it
 * never covers the preview. Open, it lists jobs with filters and their logs.
 * "Hide" shrinks the pill to an icon until a job needs attention.
 */
export function JobPanel({ jobs, projects, onOpen }: { jobs: Job[]; projects: ProjectSummary[]; onOpen: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(() => stored.get("activity:hidden") === "1");
  const [filter, setFilter] = useState<Filter>("all");
  const [cleared, setCleared] = useState<Set<string>>(() => new Set(JSON.parse(stored.get("activity:cleared") ?? "[]")));
  const [logs, setLogs] = useState<Set<string>>(new Set());
  const panel = useRef<HTMLDivElement>(null);

  const active = jobs.filter((job) => job.status === "running" || job.status === "queued");
  const running = jobs.find((job) => job.status === "running") ?? active[0];
  const failed = jobs.filter((job) => job.status === "failed" && !cleared.has(job.id));
  const justDone = jobs.find((job) => job.finishedAt && Date.now() - job.finishedAt < 8000);
  const shown = jobs
    .filter((job) => !cleared.has(job.id) || job.status === "running" || job.status === "queued")
    .filter((job) => (filter === "running" ? job.status === "running" || job.status === "queued" : filter === "failed" ? job.status === "failed" : true))
    .slice(0, 30);

  // Escape or a click outside closes it.
  useEffect(() => {
    if (!open) return;
    const key = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    const click = (event: MouseEvent) => panel.current && !panel.current.contains(event.target as Node) && setOpen(false);
    window.addEventListener("keydown", key);
    window.addEventListener("mousedown", click);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("mousedown", click);
    };
  }, [open]);

  const hide = (value: boolean) => {
    setHidden(value);
    stored.set("activity:hidden", value ? "1" : "0");
    if (value) setOpen(false);
  };
  const clearFinished = () => {
    const next = new Set([...cleared, ...jobs.filter((job) => job.status === "done" || job.status === "failed").map((job) => job.id)]);
    setCleared(next);
    stored.set("activity:cleared", JSON.stringify([...next].slice(-200)));
  };
  const toggleLog = (id: string) => setLogs((current) => (current.has(id) ? new Set([...current].filter((entry) => entry !== id)) : new Set([...current, id])));
  const titleOf = (id?: string) => (id ? projects.find((project) => project.id === id)?.title : undefined);

  if (!jobs.length) return null;

  if (!open) {
    const stage = running?.stages.at(-1);
    const pct = running?.status === "running" && stage?.total ? Math.min(100, Math.round(((stage.done ?? 0) / stage.total) * 100)) : null;
    // Hidden: an icon only, unless a job failed.
    if (hidden && !failed.length)
      return (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title={running ? `Working: ${running.label}` : "Activity"}
          className="fixed right-4 bottom-4 z-40 flex size-8 items-center justify-center rounded-full border bg-popover/80 text-muted-foreground shadow-sm backdrop-blur hover:text-foreground"
        >
          {running ? <Loader2Icon className="size-4 animate-spin text-primary" /> : <HistoryIcon className="size-4" />}
        </button>
      );
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-4 z-40 flex max-w-[20rem] items-center gap-2 overflow-hidden rounded-full border bg-popover/90 py-1.5 ps-3 pe-3 text-xs shadow-sm backdrop-blur animate-in fade-in slide-in-from-bottom-2 hover:bg-popover"
      >
        {running ? (
          <>
            <Loader2Icon className="size-3.5 shrink-0 animate-spin text-primary" />
            <span className="truncate">{running.status === "queued" ? `Waiting: ${running.label}` : running.label}</span>
            {pct !== null && <span className="font-mono text-muted-foreground tabular-nums">{pct}%</span>}
            {active.length > 1 && <span className="rounded-full bg-muted px-1.5 font-mono tabular-nums">+{active.length - 1}</span>}
            {pct !== null && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary/70 transition-[width]" style={{ width: `${pct}%` }} />}
          </>
        ) : justDone ? (
          <>
            {justDone.status === "done" ? <CheckIcon className="size-3.5 text-success" /> : <CircleXIcon className="size-3.5 text-destructive" />}
            <span className="truncate">{justDone.status === "done" ? `Done: ${justDone.label}` : `Failed: ${justDone.label}`}</span>
          </>
        ) : (
          <>
            <HistoryIcon className="size-3.5" /> Activity
            {failed.length > 0 && <span className="rounded-full bg-destructive/15 px-1.5 font-mono text-destructive tabular-nums">{failed.length} failed</span>}
          </>
        )}
      </button>
    );
  }

  return (
    <div
      ref={panel}
      className="fixed right-4 bottom-4 z-40 flex max-h-[min(70vh,40rem)] w-[26rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-150"
    >
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <span className="flex-1 text-sm font-medium">{active.length ? `Working · ${active.length}` : "Activity"}</span>
        <Button variant="ghost" size="xs" onClick={() => hide(!hidden)} title={hidden ? "Show the activity pill again" : "Shrink to an icon; failures still show"}>
          <EyeOffIcon /> {hidden ? "Unhide" : "Hide"}
        </Button>
        <Button variant="ghost" size="icon-xs" onClick={() => setOpen(false)} aria-label="Close (Esc)">
          <XIcon />
        </Button>
      </div>

      <div className="flex items-center gap-1 border-b px-3 py-1.5">
        {(
          [
            ["all", "All"],
            ["running", `Running${active.length ? ` ${active.length}` : ""}`],
            ["failed", `Failed${failed.length ? ` ${failed.length}` : ""}`],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={cn("rounded-full px-2.5 py-0.5 text-xs text-muted-foreground hover:text-foreground", filter === value && "bg-muted text-foreground")}
          >
            {label}
          </button>
        ))}
        <span className="flex-1" />
        <Button variant="ghost" size="xs" onClick={clearFinished} disabled={!jobs.some((job) => (job.status === "done" || job.status === "failed") && !cleared.has(job.id))}>
          Clear finished
        </Button>
      </div>

      <div className="min-h-0 flex-1 divide-y overflow-y-auto">
        {shown.length === 0 && <p className="px-3 py-6 text-center text-xs text-muted-foreground">{filter === "all" ? "Nothing here. Finished jobs were cleared." : `No ${filter} jobs.`}</p>}
        {shown.map((job) => {
          const title = titleOf(job.projectId);
          const showLog = logs.has(job.id);
          return (
            <div key={job.id} className="grid gap-1.5 px-3 py-2.5">
              <JobProgress job={job} compact />
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                {title ? (
                  <button type="button" className="min-w-0 truncate hover:text-foreground hover:underline" dir="auto" onClick={() => (onOpen(job.projectId!), setOpen(false))}>
                    {title}
                  </button>
                ) : (
                  <span className="min-w-0 truncate">{job.label}</span>
                )}
                <span className="shrink-0 font-mono tabular-nums">{formatWhen(new Date(job.createdAt).toISOString())}</span>
                <span className="flex-1" />
                {job.log.length > 0 && (
                  <button type="button" className="flex shrink-0 items-center gap-0.5 hover:text-foreground" onClick={() => toggleLog(job.id)}>
                    Log <ChevronDownIcon className={cn("size-3 transition-transform", showLog && "rotate-180")} />
                  </button>
                )}
              </div>
              {showLog && (
                <div className="relative">
                  <pre className="max-h-48 overflow-auto rounded-md bg-muted px-2 py-1.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-muted-foreground">{job.log.slice(-40).join("\n")}</pre>
                  <button
                    type="button"
                    title="Copy the log"
                    className="absolute top-1 right-1 rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                    onClick={() => navigator.clipboard?.writeText([job.label, ...job.log, job.error ?? ""].join("\n"))}
                  >
                    <CopyIcon className="size-3" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
