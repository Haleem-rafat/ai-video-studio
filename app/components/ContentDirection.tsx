import { useState } from "react";
import { CompassIcon } from "lucide-react";
import { toast } from "sonner";

import { api, type Client, type Dialect, type DirectionMode } from "../api.ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Field } from "./shared.tsx";

const MODES: { id: DirectionMode; label: string; detail: string }[] = [
  { id: "value", label: "Value content", detail: "Teaches one practical thing; never sells. The brand only signs the last frame." },
  { id: "mix", label: "Mostly value", detail: "4 in 5 teach; at most 1 in 5 is an ad (an idea with the goal \"offer\")." },
  { id: "promo", label: "Promo", detail: "Ads: the product, how it works, and a call to action (the studio's usual posts)." },
];
const DIALECTS: { id: Dialect; label: string }[] = [
  { id: "egyptian", label: "Egyptian" },
  { id: "gulf", label: "Gulf (Khaleeji)" },
];

/**
 * What a client's content is for: the mode, the owner's brief, the topics to
 * cover and the Arabic dialects posts take turns in. Ideas, carousels and
 * reels all follow it, and every one is checked against it before money is spent.
 */
export function ContentDirection({ client, onSaved }: { client: Client; onSaved: (client: Client) => void }) {
  const current = client.direction;
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<DirectionMode>(current?.mode ?? "promo");
  const [brief, setBrief] = useState(current?.brief ?? "");
  const [topics, setTopics] = useState((current?.topics ?? []).join("\n"));
  const [dialects, setDialects] = useState<Dialect[]>(current?.dialects ?? ["egyptian"]);
  const [busy, setBusy] = useState(false);
  const label = MODES.find((option) => option.id === (current?.mode ?? "promo"))!.label;

  const reset = () => {
    setMode(current?.mode ?? "promo");
    setBrief(current?.brief ?? "");
    setTopics((current?.topics ?? []).join("\n"));
    setDialects(current?.dialects ?? ["egyptian"]);
  };

  const save = () => {
    setBusy(true);
    api
      .editClient(client.id, { direction: { mode, brief, topics: topics.split("\n").map((t) => t.trim()).filter(Boolean), dialects } })
      .then((next) => {
        toast.success(`Content direction: ${MODES.find((option) => option.id === mode)!.label}. The next ideas and posts follow it.`);
        setOpen(false);
        onSaved(next);
      })
      .catch((error: Error) => toast.error(error.message))
      .finally(() => setBusy(false));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <CompassIcon /> Direction: {label}
          {current?.topics.length ? <Badge variant="secondary">{current.topics.length} topics</Badge> : null}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Content direction for {client.name}</DialogTitle>
          <DialogDescription>Ideas, carousels and reels follow it. A draft that sells when it shouldn't, repeats a topic, or pitches the same features as an earlier reel is rewritten before anything is drawn or voiced.</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid max-h-[70vh] gap-4 overflow-auto">
          <div role="radiogroup" aria-label="Mode" className="grid gap-2 sm:grid-cols-3">
            {MODES.map((option) => (
              <Button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={mode === option.id}
                variant="outline"
                onClick={() => setMode(option.id)}
                className={cn("h-auto flex-col items-start gap-1 p-3 text-start font-normal whitespace-normal", mode === option.id && "border-primary ring-2 ring-primary")}
              >
                <span className="font-medium">{option.label}</span>
                <span className="text-xs text-muted-foreground">{option.detail}</span>
              </Button>
            ))}
          </div>
          <Field label="Your brief" detail="the rules and goal in your own words; Arabic or English">
            <Textarea value={brief} dir="auto" rows={7} onChange={(event) => setBrief(event.target.value)} />
          </Field>
          <Field label="Topics to cover" detail="one per line; ideas start from ones not covered yet and never repeat one">
            <Textarea value={topics} dir="auto" rows={6} onChange={(event) => setTopics(event.target.value)} />
          </Field>
          {client.language === "ar" && (
            <Field label="Dialects" detail="posts take turns between the ones chosen">
              <div className="flex gap-1.5">
                {DIALECTS.map((option) => {
                  const on = dialects.includes(option.id);
                  return (
                    <Button
                      key={option.id}
                      type="button"
                      size="sm"
                      role="checkbox"
                      aria-checked={on}
                      variant={on ? "default" : "outline"}
                      onClick={() => setDialects(on ? (dialects.length > 1 ? dialects.filter((d) => d !== option.id) : dialects) : [...dialects, option.id])}
                    >
                      {option.label}
                    </Button>
                  );
                })}
              </div>
            </Field>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={save}>
            Save direction
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
