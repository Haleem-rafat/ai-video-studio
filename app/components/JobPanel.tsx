import { useState } from "react";

import type { Job } from "../api.ts";

const ICON: Record<Job["status"], string> = { queued: "⏳", running: "⚙️", done: "✅", failed: "❌" };

/** Bottom-right drawer: what the studio is doing right now, with live logs. */
export function JobPanel({ jobs }: { jobs: Job[] }) {
  const [open, setOpen] = useState(false);
  const active = jobs.filter((job) => job.status === "running" || job.status === "queued");
  const recent = jobs.filter((job) => job.finishedAt && Date.now() - job.finishedAt < 8000);
  const visible = open ? jobs.slice(0, 8) : [...active, ...recent].slice(0, 3);

  if (visible.length === 0 && !open) {
    return jobs.length ? (
      <button className="job-toggle" onClick={() => setOpen(true)}>
        Activity
      </button>
    ) : null;
  }

  return (
    <div className="job-panel">
      <div className="job-panel-head">
        <span>{active.length ? `Working… (${active.length})` : "Activity"}</span>
        <button onClick={() => setOpen(!open)}>{open ? "Hide" : "History"}</button>
      </div>
      {visible.map((job) => (
        <div key={job.id} className={`job ${job.status}`}>
          <div className="job-label">
            {ICON[job.status]} {job.label}
            {job.status === "running" && <span className="job-time">{Math.round((Date.now() - job.createdAt) / 1000)}s</span>}
          </div>
          {(job.status === "running" || open || job.status === "failed") && job.log.length > 0 && (
            <pre className="job-log">{job.log.slice(open ? -12 : -3).join("\n")}</pre>
          )}
        </div>
      ))}
    </div>
  );
}
