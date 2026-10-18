import { CpuIcon, Loader2Icon, MicIcon, MoonIcon, PowerIcon, SunIcon, WalletIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { api, formatCost, type Status, type StudioUsage } from "../api.ts";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarTrigger } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Theme } from "@/hooks/use-theme";
import { StatusDot } from "./shared.tsx";

/** The strip above every page: sidebar toggle, where you are, and the theme. */
export function TopBar({ crumbs, theme, onToggleTheme }: { crumbs: string[]; theme: Theme; onToggleTheme: () => void }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-sidebar px-3">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
        {crumbs.map((crumb, index) => (
          <span key={index} className="flex min-w-0 items-center gap-1.5">
            {index > 0 && <span className="text-muted-foreground/60">/</span>}
            <span className={index === crumbs.length - 1 ? "truncate font-medium" : "text-muted-foreground"}>{crumb}</span>
          </span>
        ))}
      </nav>
      <div className="ml-auto">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" onClick={onToggleTheme} aria-label="Toggle theme">
              {theme === "dark" ? <SunIcon /> : <MoonIcon />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{theme === "dark" ? "Light mode" : "Dark mode"}</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}

/** The engines the studio depends on, in the sidebar footer: Bonsai and ElevenLabs credit. */
export function EngineStatus({ status }: { status: Status | null }) {
  const credit = status?.credit;
  const left = credit ? credit.limit - credit.used : null;
  const llm = status?.llm ? "ok" : status?.llmStarting ? "busy" : "off";

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          tooltip={llm === "ok" ? "Bonsai is ready" : llm === "busy" ? "Bonsai is loading (about 35 seconds)" : "Start Bonsai"}
          onClick={() => llm === "off" && api.startLlm()}
          title={status?.llmStarting ? status.llmLog.join("\n") : undefined}
        >
          {llm === "busy" ? <Loader2Icon className="animate-spin" /> : llm === "off" ? <PowerIcon /> : <CpuIcon />}
          <span className="flex-1">{llm === "ok" ? "Bonsai ready" : llm === "busy" ? "Bonsai loading…" : "Start Bonsai"}</span>
          <StatusDot tone={llm} />
        </SidebarMenuButton>
      </SidebarMenuItem>
      <Spend />
      {left !== null && credit && (
        <SidebarMenuItem>
          <SidebarMenuButton tooltip={`${left.toLocaleString()} ElevenLabs characters left`} className="h-auto py-1.5">
            <MicIcon />
            <div className="grid flex-1 gap-1">
              <span className="flex justify-between text-xs">
                <span>Voice credit</span>
                <span className="font-mono tabular-nums text-muted-foreground">{left.toLocaleString()}</span>
              </span>
              <span className="h-1 overflow-hidden rounded-full bg-sidebar-accent">
                <span className={`block h-full ${left < 3000 ? "bg-amber-500" : "bg-foreground/70"}`} style={{ width: `${Math.max(2, (left / credit.limit) * 100)}%` }} />
              </span>
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      )}
    </SidebarMenu>
  );
}

/** What the studio has spent on AI this month, and what is left on the AI Gateway. */
function Spend() {
  const [usage, setUsage] = useState<StudioUsage | null>(null);
  useEffect(() => {
    const load = () => api.studioUsage().then(setUsage, () => {});
    load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, []);
  if (!usage) return null;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        tooltip={`AI this month ${formatCost(usage.month.cost)} · all time ${formatCost(usage.total.cost)} · ${usage.videos} rendered videos, about ${formatCost(usage.perVideo)} each`}
        className="h-auto py-1.5"
      >
        <WalletIcon />
        <div className="grid flex-1 gap-0.5 text-xs">
          <span className="flex justify-between">
            <span>AI this month</span>
            <span className="font-mono tabular-nums">{formatCost(usage.month.cost)}</span>
          </span>
          {usage.balance !== null && (
            <span className="flex justify-between text-muted-foreground">
              <span>Gateway balance</span>
              <span className={`font-mono tabular-nums ${usage.balance < 5 ? "text-warning" : ""}`}>${usage.balance.toFixed(2)}</span>
            </span>
          )}
        </div>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
