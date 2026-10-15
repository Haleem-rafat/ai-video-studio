import { ClapperboardIcon, MonitorIcon, PlusIcon, SmartphoneIcon } from "lucide-react";


import { brandUrl, type Channel, type ProjectSummary } from "../api.ts";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
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
  footer: React.ReactNode;
};

export function AppSidebar({ projects, channels, selected, onSelect, openChannel, onOpenChannel, onChannelCreated, footer }: Props) {
  const channelOf = (id: string) => channels.find((channel) => channel.id === id);

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
                <SidebarMenuButton isActive={selected === null && openChannel === null} tooltip="New video" onClick={() => onSelect(null)}>
                  <PlusIcon />
                  <span>New video</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

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

        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel>
            Projects <span className="ml-auto font-mono tabular-nums">{projects.length}</span>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {projects.map((project) => {
                const channel = channelOf(project.channel);
                const Icon = project.format === "short" ? SmartphoneIcon : MonitorIcon;
                return (
                  <SidebarMenuItem key={project.id}>
                    <SidebarMenuButton size="lg" isActive={selected === project.id} onClick={() => onSelect(project.id)} className="h-auto py-2">
                      <Icon className="mt-0.5 self-start text-muted-foreground" />
                      <div className="grid min-w-0 flex-1 gap-0.5 leading-tight">
                        <span className="truncate text-[13px] font-medium">{project.title}</span>
                        <span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                          <ChannelSwatch color={channel?.colors.accent} />
                          <span className="truncate">{channel?.name ?? project.channel}</span>
                          <span>·</span>
                          <span className="tabular-nums">{project.sceneCount}</span>
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
              })}
              {projects.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">No videos yet. Start one with New video.</p>}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>{footer}</SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
