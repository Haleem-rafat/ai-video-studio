import { CircleCheckIcon, CircleXIcon, ClockIcon, HistoryIcon, Loader2Icon } from "lucide-react";
import { useState } from "react";

import type { Job } from "../api.ts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ICON: Record<Job["status"], React.ReactNode> = {
  queued: <ClockIcon className="size-3.5 text-muted-foreground" />,
  running: <Loader2Icon className="size-3.5 animate-spin" />,
  done: <CircleCheckIcon className="size-3.5 text-emerald-600 dark:text-emerald-500" />,
  failed: <CircleXIcon className="size-3.5 text-destructive" />,
};

/** Bottom-right: what the studio is doing right now, with live logs. */
export function JobPanel({ jobs }: { jobs: Job[] }) {
  const [open, setOpen] = useState(false);
  const active = jobs.filter((job) => job.status === "running" || job.status === "queued");
  const recent = jobs.filter((job) => job.finishedAt && Date.now() - job.finishedAt < 8000);
  const visible = open ? jobs.slice(0, 8) : [...active, ...recent].slice(0, 3);

  if (visible.length === 0 && !open) {
    return jobs.length ? (
      <Button variant="outline" size="sm" className="fixed right-4 bottom-4 z-40 shadow-sm" onClick={() => setOpen(true)}>
        <HistoryIcon /> Activity
      </Button>
    ) : null;
  }

  return (
    <div className="fixed right-4 bottom-4 z-40 w-[22rem] overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-sm font-medium">{active.length ? `Working · ${active.length}` : "Activity"}</span>
        <Button variant="ghost" size="xs" onClick={() => setOpen(!open)}>
          {open ? "Hide" : "History"}
        </Button>
      </div>
      <div className="max-h-[50vh] divide-y overflow-y-auto">
        {visible.map((job) => (
          <div key={job.id} className="px-3 py-2">
            <div className="flex items-center gap-2 text-[13px]">
              {ICON[job.status]}
              <span className={cn("min-w-0 flex-1 truncate", job.status === "failed" && "text-destructive")}>{job.label}</span>
              {job.status === "running" && <span className="font-mono text-[11px] text-muted-foreground tabular-nums">{Math.round((Date.now() - job.createdAt) / 1000)}s</span>}
            </div>
            {(job.status === "running" || open || job.status === "failed") && job.log.length > 0 && (
              <pre className="mt-1.5 max-h-36 overflow-auto rounded-md bg-muted px-2 py-1.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
                {job.log.slice(open ? -12 : -3).join("\n")}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
