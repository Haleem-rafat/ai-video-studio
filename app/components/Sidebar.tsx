import { ClapperboardIcon, MegaphoneIcon, MonitorIcon, PlusIcon, SearchIcon, SmartphoneIcon } from "lucide-react";


import { useState } from "react";

import { brandUrl, dayGroup, formatCost, formatDate, formatWhen, type Channel, type Client, type ProjectSummary, hostOf } from "../api.ts";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { NewChannelDialog } from "./NewChannelDialog.tsx";
import { ChannelSwatch } from "./shared.tsx";

type Props = {
  projects: ProjectSummary[];
  channels: Channel[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  /** The channel whose settings are open, if any. */
  openChannel: string | null;
  onOpenChannel: (id: string) => void;
  onChannelCreated: (channel: Channel) => void;
  /** The open marketing page, if any. */
  marketing: string | null;
  onMarketing: () => void;
  /** Instagram clients, listed under Marketing video. */
  clients: Client[];
  openClient: string | null;
  onOpenClient: (id: string) => void;
  footer: React.ReactNode;
};

export function AppSidebar({ projects, channels, selected, onSelect, openChannel, onOpenChannel, onChannelCreated, marketing, onMarketing, clients, openClient, onOpenClient, footer }: Props) {
  const channelOf = (id: string) => channels.find((channel) => channel.id === id);
  // Marketing videos are made for clients, not for a YouTube channel: they get their own list.
  const [search, setSearch] = useState("");
  // Newest first by when they were made, so editing a project doesn't move it around; the search matches title, brand, channel and topic.
  const words = search.trim().toLowerCase();
  const shown = [...projects]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .filter((project) => !words || [project.title, project.topic, project.channel, project.marketing?.brand.name ?? ""].join(" ").toLowerCase().includes(words));
  const marketingProjects = shown.filter((project) => project.marketing);
  const videoProjects = shown.filter((project) => !project.marketing);
  /** A list split under day headings: Today, Yesterday, This week… */
  const byDay = (list: ProjectSummary[]) =>
    list.flatMap((project, index) => {
      const group = dayGroup(project.createdAt);
      const heading = index === 0 || dayGroup(list[index - 1].createdAt) !== group;
      return [
        ...(heading ? [<li key={`day-${group}`} className="px-2 pt-2 pb-0.5 text-[10px] font-medium tracking-wide text-muted-foreground/70 uppercase">{group}</li>] : []),
        item(project),
      ];
    });
  /** Marketing videos under the client whose website they were made for; the rest under "Other". */
  const byClient = (list: ProjectSummary[]) => {
    const clientOf = (project: ProjectSummary) => clients.find((client) => hostOf(client.url) && hostOf(client.url) === hostOf(project.marketing?.brand.url ?? ""));
    const groups = [...clients.map((client) => ({ key: client.id, name: client.name, list: list.filter((project) => clientOf(project) === client) })), { key: "other", name: "Other", list: list.filter((project) => !clientOf(project)) }];
    const shownGroups = groups.filter((group) => group.list.length);
    // With no clients yet, keep the day headings.
    if (shownGroups.length === 1 && shownGroups[0].key === "other") return byDay(list);
    return shownGroups.flatMap((group) => [
      <li key={`client-${group.key}`} className="flex px-2 pt-2 pb-0.5 text-[10px] font-medium tracking-wide text-muted-foreground/70 uppercase">
        {group.name} <span className="ml-auto font-mono">{group.list.length}</span>
      </li>,
      ...group.list.map(item),
    ]);
  };
  const item = (project: ProjectSummary) => {
    const channel = channelOf(project.channel);
    const Icon = project.format === "short" ? SmartphoneIcon : MonitorIcon;
    return (
      <SidebarMenuItem key={project.id}>
        <SidebarMenuButton size="lg" isActive={selected === project.id} onClick={() => onSelect(project.id)} className="h-auto py-2">
          <Icon className="mt-0.5 self-start text-muted-foreground" />
          <div className="grid min-w-0 flex-1 gap-0.5 leading-tight">
            <span className="truncate text-[13px] font-medium">{project.title}</span>
            <span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
              <ChannelSwatch color={project.marketing?.brand.colors.accent ?? channel?.colors.accent} />
              <span className="truncate">{project.marketing?.brand.name ?? channel?.name ?? project.channel}</span>
              <span>·</span>
              <span className="tabular-nums">{project.sceneCount}</span>
        {project.cost > 0 && <span className="font-mono text-[10px] tabular-nums" title="What this video has cost in AI">{formatCost(project.cost)}</span>}
        <span className="font-mono text-[10px] tabular-nums" title={`Made ${formatDate(project.createdAt)} · edited ${formatDate(project.updatedAt)}`}>
          {formatWhen(project.createdAt)}
        </span>
              {project.youtube ? (
                <span className="ml-auto flex items-center gap-1 rounded border px-1 font-mono text-[10px] leading-4" title={`On YouTube (${project.youtube.youtubeChannel})`}>
                  <span className="size-1 rounded-full bg-red-600" />
                  {project.youtube.scheduledFor && Date.parse(project.youtube.scheduledFor) > Date.now() ? "SCHED" : "YT"}
                </span>
              ) : (
                project.hasVideo && <span className="ml-auto rounded border px-1 font-mono text-[10px] leading-4">MP4</span>
              )}
            </span>
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" onClick={() => onSelect(null)}>
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <ClapperboardIcon className="size-4" />
              </div>
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate text-sm font-semibold">Video Studio</span>
                <span className="truncate text-xs text-muted-foreground">Runs on this Mac</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton isActive={selected === null && openChannel === null && !marketing && !openClient} tooltip="New video" onClick={() => onSelect(null)}>
                  <PlusIcon />
                  <span>New video</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton isActive={Boolean(marketing)} tooltip="Marketing video" onClick={onMarketing}>
                  <MegaphoneIcon />
                  <span>Marketing video</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {clients.length > 0 && (
          <SidebarGroup className="group-data-[collapsible=icon]:hidden">
            <SidebarGroupLabel>Clients</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {clients.map((client) => (
                  <SidebarMenuItem key={client.id}>
                    <SidebarMenuButton isActive={openClient === client.id} onClick={() => onOpenClient(client.id)}>
                      <ChannelSwatch color={client.brand.colors.accent} />
                      <span className="truncate">{client.name}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel>Channels</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {channels.map((channel) => (
                <SidebarMenuItem key={channel.id}>
                  <SidebarMenuButton isActive={openChannel === channel.id} onClick={() => onOpenChannel(channel.id)}>
                    {channel.brand?.logo ? (
                      <img src={brandUrl(channel.id, channel.brand.logo)} alt="" className="size-4 rounded-full object-cover" />
                    ) : (
                      <ChannelSwatch color={channel.colors.accent} className="size-3 rounded-full" />
                    )}
                    <span className="truncate">{channel.name}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              <SidebarMenuItem>
                <NewChannelDialog
                  onCreated={onChannelCreated}
                  trigger={
                    <SidebarMenuButton className="text-muted-foreground">
                      <PlusIcon />
                      <span>New channel</span>
                    </SidebarMenuButton>
                  }
                />
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {projects.length > 0 && (
          <SidebarGroup className="py-0 group-data-[collapsible=icon]:hidden">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <SidebarInput className="pl-7" placeholder="Search projects" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search projects" />
            </div>
          </SidebarGroup>
        )}

        {marketingProjects.length > 0 && (
          <SidebarGroup className="group-data-[collapsible=icon]:hidden">
            <SidebarGroupLabel>
              Marketing <span className="ml-auto font-mono tabular-nums">{marketingProjects.length}</span>
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>{byClient(marketingProjects)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel>
            Projects <span className="ml-auto font-mono tabular-nums">{videoProjects.length}</span>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {byDay(videoProjects)}
              {videoProjects.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">{words ? "Nothing matches." : "No videos yet. Start one with New video."}</p>}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>{footer}</SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
