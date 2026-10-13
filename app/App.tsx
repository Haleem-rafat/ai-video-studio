import { useCallback, useEffect, useRef, useState } from "react";

import { api, type Channel, type Job, type ProjectSummary, type Status } from "./api.ts";
import { JobPanel } from "./components/JobPanel.tsx";
import { NewVideo } from "./components/NewVideo.tsx";
import { ProjectView } from "./components/ProjectView.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { TopBar } from "./components/TopBar.tsx";

export function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(() => new URLSearchParams(location.search).get("project"));
  /** Bumped whenever a job touching the open project finishes. */
  const [projectVersion, setProjectVersion] = useState(0);
  const seen = useRef(new Map<string, Job["status"]>());

  const refreshProjects = useCallback(() => api.projects().then(setProjects).catch(() => {}), []);

  const select = useCallback((id: string | null) => {
    setSelected(id);
    history.replaceState(null, "", id ? `?project=${id}` : "/");
  }, []);

  useEffect(() => {
    api.channels().then(setChannels);
    refreshProjects();
  }, [refreshProjects]);

  // One poll drives everything live: Bonsai state, credit and job progress.
  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      try {
        const next = await api.status();
        if (stopped) return;
        setStatus(next);

        for (const job of next.jobs) {
          const before = seen.current.get(job.id);
          seen.current.set(job.id, job.status);
          if (before === undefined || before === job.status || (job.status !== "done" && job.status !== "failed")) continue;

          refreshProjects();
          if (job.label.startsWith("Write script") && job.status === "done" && typeof job.result === "string") select(job.result);
          else if (job.projectId) setProjectVersion((version) => version + 1);
        }
      } catch {
        // Server restarting; the next tick retries.
      }
      if (!stopped) setTimeout(tick, 1500);
    };
    tick();
    return () => {
      stopped = true;
    };
  }, [refreshProjects, select]);

  const jobs = status?.jobs ?? [];

  return (
    <div className="app">
      <TopBar status={status} />
      <div className="workspace">
        <Sidebar projects={projects} channels={channels} selected={selected} onSelect={select} />
        <main className="main">
          {selected ? (
            <ProjectView
              key={selected}
              id={selected}
              version={projectVersion}
              channels={channels}
              jobs={jobs.filter((job) => job.projectId === selected)}
              llmReady={Boolean(status?.llm)}
              onDeleted={() => {
                select(null);
                refreshProjects();
              }}
            />
          ) : (
            <NewVideo channels={channels} llmReady={Boolean(status?.llm)} jobs={jobs} />
          )}
        </main>
      </div>
      <JobPanel jobs={jobs} />
    </div>
  );
}
