import { CalendarPlusIcon, ClapperboardIcon, CopyIcon, PencilIcon, PlayIcon } from "lucide-react";

import { formatAgo, formatCost, formatDate, formatTime, formatWhen, type ProjectState, type ProjectSummary } from "../api.ts";
import { Badge } from "@/components/ui/badge";

type Props = {
  project: ProjectState;
  projects: ProjectSummary[];
  /** Total length of the video in seconds. */
  seconds: number;
  onOpen: (id: string) => void;
};

/** The project's history (made, edited, rendered) and the other versions of the same video. */
export function ProjectInfo({ project, projects, seconds, onOpen }: Props) {
  const cost = projects.find((p) => p.id === project.id)?.cost ?? 0;
  const events = [
    { icon: CalendarPlusIcon, label: "Created", at: project.createdAt },
    { icon: PencilIcon, label: "Last edited", at: project.updatedAt },
    ...(project.render ? [{ icon: ClapperboardIcon, label: `Rendered · ${project.render.seconds.toFixed(1)}s`, at: project.render.renderedAt }] : []),
  ].sort((a, b) => b.at.localeCompare(a.at));

  // Other versions: the same brand's marketing videos, or the same topic (a "Both" pair, a v2…).
  const key = (p: { marketing?: { brand: { url: string } }; topic: string }) => p.marketing?.brand.url ?? p.topic.trim().toLowerCase();
  const versions = projects.filter((p) => p.id !== project.id && key(p) === key(project)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Length" value={formatTime(seconds)} />
        <Stat label="Scenes" value={String(project.scenes.length)} />
        <Stat label="Format" value={project.format === "short" ? "9:16" : "16:9"} />
        <Stat label="AI cost" value={formatCost(cost)} />
      </div>

      <section className="grid gap-2 rounded-xl border bg-card p-4">
        <div className="text-sm font-medium">History</div>
        <ol className="relative grid gap-3 border-s ps-4">
          {events.map((event) => (
            <li key={event.label} className="relative">
              <span className="absolute -start-[1.42rem] top-0.5 flex size-5 items-center justify-center rounded-full border bg-background">
                <event.icon className="size-3 text-muted-foreground" />
              </span>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm">{event.label}</span>
                <span className="text-xs text-muted-foreground">{formatAgo(event.at)}</span>
              </div>
              <div className="font-mono text-[11px] text-muted-foreground tabular-nums">{formatDate(event.at)}</div>
            </li>
          ))}
        </ol>
        {!project.render && <p className="text-xs text-muted-foreground">Not rendered yet.</p>}
      </section>

      <section className="grid gap-2 rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Other versions</span>
          <span className="text-xs text-muted-foreground">{versions.length ? `${versions.length} more` : "none yet"}</span>
        </div>
        {versions.length > 0 && (
          <ul className="grid gap-1">
            {versions.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => onOpen(p.id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start hover:bg-muted">
                  {p.hasVideo ? <PlayIcon className="size-3.5 shrink-0 text-primary" /> : <CopyIcon className="size-3.5 shrink-0 text-muted-foreground" />}
                  <span className="min-w-0 flex-1 truncate text-sm" dir="auto">
                    {p.title}
                  </span>
                  <Badge variant="outline" className="shrink-0">
                    {p.format === "short" ? "9:16" : "16:9"}
                  </Badge>
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums" title={formatDate(p.createdAt)}>
                    {formatWhen(p.createdAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="font-mono text-[11px] text-muted-foreground">ID {project.id}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="font-mono text-sm tabular-nums">{value}</div>
    </div>
  );
}
