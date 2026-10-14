import type { ReactNode } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** A label above a control, with optional right-aligned detail (a word count, a unit). */
export function Field({ label, detail, className, children }: { label: string; detail?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
        {detail && <span className="font-mono text-[11px] text-muted-foreground tabular-nums">{detail}</span>}
      </div>
      {children}
    </div>
  );
}

/** Asks before doing something that cannot be undone from the screen. */
export function Confirm({
  trigger,
  title,
  description,
  action,
  onConfirm,
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  action: string;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            {action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** A small round status light; the colour is the status, so it always has a text label beside it. */
export function StatusDot({ tone }: { tone: "ok" | "busy" | "off" | "warn" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-1.5 shrink-0 rounded-full",
        tone === "ok" && "bg-emerald-500",
        tone === "busy" && "animate-pulse bg-amber-500",
        tone === "warn" && "bg-amber-500",
        tone === "off" && "bg-muted-foreground/50",
      )}
    />
  );
}

/** A channel's own accent, the one place channel colour appears in the chrome. */
export function ChannelSwatch({ color, className }: { color?: string; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-[3px]", className)} style={{ background: color ?? "currentColor" }} />;
}
