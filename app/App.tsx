import { useCallback, useEffect, useRef, useState } from "react";

import { api, type Channel, type Client, type Job, type ProjectSummary, type Status } from "./api.ts";
import { ChannelSettings } from "./components/ChannelSettings.tsx";
import { CarouselEditor } from "./components/CarouselEditor.tsx";
import { ClientView } from "./components/ClientView.tsx";
import { JobPanel } from "./components/JobPanel.tsx";
import { MarketingChat } from "./components/MarketingChat.tsx";
import { NewVideo } from "./components/NewVideo.tsx";
import { ProjectView } from "./components/ProjectView.tsx";
import { PromosView } from "./components/PromosView.tsx";
import { AppSidebar } from "./components/Sidebar.tsx";
import { EngineStatus, TopBar } from "./components/TopBar.tsx";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useTheme } from "@/hooks/use-theme";
import { parseRoute, useRoute } from "./router.ts";

export function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [route, navigate] = useRoute();
  const selected = route.page === "project" ? route.id : null;
  const openChannel = route.page === "channel" ? route.id : null;
  /** The marketing page: "new" for the start form, else a chat's id; null when another page is open. */
  const marketing = route.page === "marketing" ? (route.session ?? "new") : null;
  /** The Instagram client whose page is open, if any. */
  const openClient = route.page === "client" ? route.id : null;
  /** The post open in the carousel editor, on its client's page. */
  const openPost = route.page === "client" ? (route.post ?? null) : null;
  /** The website promos page: "all", or the open promo's id; null when another page is open. */
  const promos = route.page === "promos" ? (route.id ?? "all") : null;
  const [clients, setClients] = useState<Client[]>([]);
  /** Bumped whenever a job touching the open project finishes. */
  const [projectVersion, setProjectVersion] = useState(0);
  const seen = useRef(new Map<string, Job["status"]>());
  const { theme, toggle } = useTheme();

  const refreshProjects = useCallback(() => api.projects().then(setProjects).catch(() => {}), []);

  const select = useCallback((id: string | null) => navigate(id ? { page: "project", id } : { page: "new" }), [navigate]);

  const showChannel = useCallback((id: string) => navigate({ page: "channel", id }), [navigate]);

  const showMarketing = useCallback((id: string) => navigate({ page: "marketing", session: id === "new" ? null : id }), [navigate]);

  const refreshChannels = useCallback(() => api.channels().then(setChannels).catch(() => {}), []);

  const showClient = useCallback((id: string) => navigate({ page: "client", id }), [navigate]);

  const showPromo = useCallback((id: string | null) => navigate({ page: "promos", id }), [navigate]);

  const refreshClients = useCallback(() => api.clients().then(setClients).catch(() => {}), []);

  useEffect(() => {
    refreshChannels();
    refreshProjects();
    refreshClients();
  }, [refreshChannels, refreshProjects, refreshClients]);

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
          if (job.label.startsWith("New client") || job.label.startsWith("Ideas: ")) refreshClients();
          if (job.label.startsWith("New client") && job.status === "done" && typeof job.result === "string") showClient(job.result);
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
  }, [refreshProjects, select, refreshClients, showClient]);

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
          marketing={marketing}
          onMarketing={() => showMarketing("new")}
          clients={clients}
          openClient={openClient}
          onOpenClient={showClient}
          promos={Boolean(promos)}
          onPromos={() => showPromo(null)}
          onChannelCreated={(channel) => {
            refreshChannels();
            showChannel(channel.id);
          }}
          footer={<EngineStatus status={status} />}
        />
        <SidebarInset className="h-svh min-w-0 overflow-hidden">
          <TopBar
            crumbs={selected ? ["Projects", open?.title ?? "…"] : openChannel ? ["Channels", shownChannel?.name ?? "…"] : openClient ? ["Marketing", clients.find((client) => client.id === openClient)?.name ?? "…", ...(openPost ? ["Carousel editor"] : [])] : promos ? ["Marketing", "Website promo"] : marketing ? ["Studio", "Marketing video"] : ["Studio", "New video"]}
            theme={theme}
            onToggleTheme={toggle}
          />
          <main className="flex min-h-0 flex-1 flex-col">
            {promos ? (
              <PromosView id={promos === "all" ? null : promos} jobs={jobs} onOpen={showPromo} />
            ) : openClient && openPost ? (
              <CarouselEditor key={openPost} clientId={openClient} postId={openPost} jobs={jobs} onBack={() => showClient(openClient)} />
            ) : openClient ? (
              <ClientView key={openClient} id={openClient} jobs={jobs} onOpenProject={select} onOpenPromo={showPromo} onChanged={(client) => setClients((all) => all.map((entry) => (entry.id === client.id ? client : entry)))} />
            ) : marketing ? (
              <MarketingChat sessionId={marketing === "new" ? null : marketing} jobs={jobs} onOpen={showMarketing} />
            ) : shownChannel ? (
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
                onOpen={select}
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
        <JobPanel jobs={jobs} projects={projects} onNavigate={(path) => navigate(parseRoute(path, ""))} />
        <Toaster theme={theme} position="bottom-right" />
      </SidebarProvider>
    </TooltipProvider>
  );
}
