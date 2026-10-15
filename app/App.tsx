import { useCallback, useEffect, useRef, useState } from "react";

import { api, type Channel, type Job, type ProjectSummary, type Status } from "./api.ts";
import { ChannelSettings } from "./components/ChannelSettings.tsx";
import { JobPanel } from "./components/JobPanel.tsx";
import { NewVideo } from "./components/NewVideo.tsx";
import { ProjectView } from "./components/ProjectView.tsx";
import { AppSidebar } from "./components/Sidebar.tsx";
import { EngineStatus, TopBar } from "./components/TopBar.tsx";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useTheme } from "@/hooks/use-theme";

export function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(() => new URLSearchParams(location.search).get("project"));
  const [openChannel, setOpenChannel] = useState<string | null>(() => new URLSearchParams(location.search).get("channel"));
  /** Bumped whenever a job touching the open project finishes. */
  const [projectVersion, setProjectVersion] = useState(0);
  const seen = useRef(new Map<string, Job["status"]>());
  const { theme, toggle } = useTheme();

  const refreshProjects = useCallback(() => api.projects().then(setProjects).catch(() => {}), []);

  const select = useCallback((id: string | null) => {
    setSelected(id);
    setOpenChannel(null);
    history.replaceState(null, "", id ? `?project=${id}` : "/");
  }, []);

  const showChannel = useCallback((id: string) => {
    setSelected(null);
    setOpenChannel(id);
    history.replaceState(null, "", `?channel=${id}`);
  }, []);

  const refreshChannels = useCallback(() => api.channels().then(setChannels).catch(() => {}), []);

  useEffect(() => {
    refreshChannels();
    refreshProjects();
  }, [refreshChannels, refreshProjects]);

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
  const open = projects.find((project) => project.id === selected);
  const shownChannel = openChannel ? channels.find((channel) => channel.id === openChannel) : undefined;

  return (
    <TooltipProvider delayDuration={300}>
      <SidebarProvider>
        <AppSidebar
          projects={projects}
          channels={channels}
          selected={selected}
          onSelect={select}
          openChannel={openChannel}
          onOpenChannel={showChannel}
          onChannelCreated={(channel) => {
            refreshChannels();
            showChannel(channel.id);
          }}
          footer={<EngineStatus status={status} />}
        />
        <SidebarInset className="h-svh min-w-0 overflow-hidden">
          <TopBar
            crumbs={selected ? ["Projects", open?.title ?? "…"] : openChannel ? ["Channels", shownChannel?.name ?? "…"] : ["Studio", "New video"]}
            theme={theme}
            onToggleTheme={toggle}
          />
          <main className="flex min-h-0 flex-1 flex-col">
            {shownChannel ? (
              <ChannelSettings
                key={shownChannel.id}
                channel={shownChannel}
                jobs={jobs}
                onChanged={(channel) => {
                  if (channel) setChannels((all) => all.map((entry) => (entry.id === channel.id ? channel : entry)));
                  else refreshChannels();
                }}
              />
            ) : selected ? (
              <ProjectView
                key={selected}
                id={selected}
                version={projectVersion}
                channels={channels}
                projects={projects}
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
        </SidebarInset>
        <JobPanel jobs={jobs} />
        <Toaster theme={theme} position="bottom-right" />
      </SidebarProvider>
    </TooltipProvider>
  );
}
