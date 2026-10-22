import { useState } from "react";
import { CalendarClockIcon, PencilIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/** "Thu 23 Oct, 7:00 pm" for a local "YYYY-MM-DDTHH:mm" or an ISO time. */
export function when(value: string, withTime = true): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}) });
}

/** Ideas from before post times were kept: the server's rule, one evening a day from the next day. */
export function suggestPostAt(ideaId: string): string {
  const n = Number(ideaId.slice(11)) || 1;
  const day = new Date(`${ideaId.slice(0, 10)}T12:00:00`);
  day.setDate(day.getDate() + n);
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}T19:00`;
}

/** When something should go out, with a dialog to change it. Past times show as such. */
export function PostAt({ value, suggested, onSave }: { value: string; suggested?: boolean; onSave: (postAt: string) => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const past = new Date(value).getTime() < Date.now();
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setDraft(value);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="h-auto gap-1 px-1.5 py-0.5 text-xs font-normal">
          <CalendarClockIcon className="size-3.5" />
          <span className={past ? "text-muted-foreground" : ""}>
            Post on {when(value)}
            {suggested ? " (suggested)" : ""}
            {past ? " · passed" : ""}
          </span>
          <PencilIcon className="size-3 opacity-60" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>When should it go out?</DialogTitle>
          <DialogDescription>The day and time to post it on Instagram. Its posts get the same time.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Input type="datetime-local" value={draft} onChange={(event) => setDraft(event.target.value)} />
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={busy || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(draft)}
            onClick={() => {
              setBusy(true);
              onSave(draft)
                .then(() => setOpen(false))
                .finally(() => setBusy(false));
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
