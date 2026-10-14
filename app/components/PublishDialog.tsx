import { CalendarClockIcon, ExternalLinkIcon, Loader2Icon, PlugIcon, UploadIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { api, type Channel, type Job, type Privacy, type ProjectState, type ProjectSummary, type YouTubeStatus } from "../api.ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

type When = "now" | "next" | "pick";

type Props = {
  project: ProjectState;
  channel: Channel | undefined;
  /** Every project, to find the next day this channel has nothing scheduled. */
  projects: ProjectSummary[];
  busy: boolean;
  /** Saves pending edits, then starts the job. */
  run: (start: () => Promise<Job>) => Promise<void>;
};

const PRIVACY: { value: Privacy; label: string; hint: string }[] = [
  { value: "private", label: "Private", hint: "Only you. Check it on YouTube, then make it public there." },
  { value: "unlisted", label: "Unlisted", hint: "Anyone with the link." },
  { value: "public", label: "Public", hint: "Everyone, straight away." },
];

const pad = (n: number) => String(n).padStart(2, "0");
const localInput = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/**
 * Framecast's daily drip, by hand: the first day from today on which this
 * channel has nothing scheduled yet, at the chosen time of day.
 */
function nextFreeDay(projects: ProjectSummary[], channel: string, time: string): Date {
  const [hours, minutes] = time.split(":").map(Number);
  const taken = projects.filter((p) => p.channel === channel && p.youtube?.scheduledFor).map((p) => new Date(p.youtube!.scheduledFor!));
  const day = new Date();
  day.setHours(hours || 0, minutes || 0, 0, 0);
  if (day.getTime() < Date.now() + 15 * 60_000) day.setDate(day.getDate() + 1);
  for (let i = 0; i < 365 && taken.some((t) => sameDay(t, day)); i++) day.setDate(day.getDate() + 1);
  return day;
}

/** "Scheduled Tue 15 Oct, 17:00" / "Public" — what the header button says once uploaded. */
export function youtubeState(youtube: NonNullable<ProjectState["youtube"]>): string {
  if (youtube.scheduledFor && Date.parse(youtube.scheduledFor) > Date.now()) {
    return `Scheduled ${new Date(youtube.scheduledFor).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`;
  }
  if (youtube.scheduledFor) return "Public";
  return youtube.privacy[0].toUpperCase() + youtube.privacy.slice(1);
}

export function PublishDialog({ project, channel, projects, busy, run }: Props) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<YouTubeStatus | null>(null);
  const [when, setWhen] = useState<When>("now");
  const [privacy, setPrivacy] = useState<Privacy>("private");
  const [time, setTime] = useState("17:00");
  const [picked, setPicked] = useState(() => localInput(new Date(Date.now() + 24 * 3600_000)));
  const [error, setError] = useState("");

  // Polled while open, so a sign-in finished in the browser shows up here.
  useEffect(() => {
    if (!open) return;
    let stopped = false;
    const tick = () =>
      api
        .youtube()
        .then((next) => !stopped && setStatus(next))
        .catch(() => {})
        .finally(() => !stopped && setTimeout(tick, 2000));
    tick();
    return () => {
      stopped = true;
    };
  }, [open]);

  const next = useMemo(() => nextFreeDay(projects, project.channel, time), [projects, project.channel, time]);
  const publishAt = when === "next" ? next : when === "pick" ? new Date(picked) : null;
  const connected = status?.channels[project.channel] ?? null;
  const uploaded = project.youtube;
  const tooSoon = publishAt !== null && (!Number.isFinite(publishAt.getTime()) || publishAt.getTime() < Date.now() + 5 * 60_000);
  const canUpload = Boolean(status?.configured && connected && project.hasVideo && !busy && !tooSoon);

  const upload = async () => {
    setError("");
    try {
      await run(() => api.publish(project.id, { privacy, publishAt: publishAt?.toISOString(), force: Boolean(uploaded) }));
      setOpen(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {uploaded ? (
          <Button variant="outline">
            <span className="size-1.5 rounded-full bg-red-600" aria-hidden />
            {youtubeState(uploaded)}
          </Button>
        ) : (
          <Button variant="outline" disabled={!project.hasVideo}>
            <UploadIcon /> Publish
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Publish to YouTube</DialogTitle>
          <DialogDescription className="line-clamp-1">{project.title}</DialogDescription>
        </DialogHeader>

        <DialogBody>
          {uploaded && (
            <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2.5 text-sm">
              <div className="grid min-w-0 flex-1 gap-0.5">
                <span className="font-medium">Already on {uploaded.youtubeChannel}</span>
                <span className="text-xs text-muted-foreground">
                  {youtubeState(uploaded)} · uploaded {new Date(uploaded.uploadedAt).toLocaleDateString()}
                </span>
              </div>
              <Button variant="outline" size="sm" asChild>
                <a href={uploaded.url} target="_blank" rel="noreferrer">
                  Open <ExternalLinkIcon />
                </a>
              </Button>
            </div>
          )}

          <section className="grid gap-2">
            <Label className="text-xs text-muted-foreground">YouTube channel</Label>
            {!status ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2Icon className="size-4 animate-spin" /> Checking…
              </div>
            ) : !status.configured ? (
              <div className="grid gap-1.5 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                <span className="text-sm font-medium text-foreground">Uploading isn't set up yet</span>
                <span>1. In Google Cloud Console, enable YouTube Data API v3.</span>
                <span>2. Set up the OAuth consent screen and add your account as a test user.</span>
                <span>
                  3. Create a <em>Desktop app</em> OAuth client and save its JSON as <code className="font-mono text-foreground">config/youtube/client_secret.json</code>.
                </span>
                <span>
                  Or borrow local Framecast's sign-in: add <code className="font-mono text-foreground">STUDIO_OAUTH_RETURN_URL=http://localhost:4300/api/youtube/callback</code> to its .env.local.
                </span>
              </div>
            ) : connected ? (
              <div className="flex items-center gap-3 rounded-lg border px-3 py-2">
                <span className="flex size-7 items-center justify-center rounded-full bg-muted text-xs font-semibold">{connected.title.slice(0, 1)}</span>
                <div className="grid min-w-0 flex-1 leading-tight">
                  <span className="truncate text-sm font-medium">{connected.title}</span>
                  <span className="text-xs text-muted-foreground">for {channel?.name}</span>
                </div>
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => api.connectYouTube(project.channel)}>
                  Switch
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-lg border border-dashed px-3 py-2.5">
                <span className="flex-1 text-sm text-muted-foreground">
                  {channel?.name} isn't connected. A browser tab opens to pick its Google account.
                  {status.via === "framecast" && " Sign-in goes through local Framecast, so keep it running on localhost:3000."}
                </span>
                <Button size="sm" onClick={() => api.connectYouTube(project.channel)}>
                  <PlugIcon /> Connect
                </Button>
              </div>
            )}
          </section>

          <section className="grid gap-2">
            <Label className="text-xs text-muted-foreground">When</Label>
            <RadioGroup value={when} onValueChange={(value) => setWhen(value as When)} className="gap-0 overflow-hidden rounded-lg border">
              <Option value="now" active={when === "now"} title="Now" hint="Upload and set the visibility below." />
              <Option
                value="next"
                active={when === "next"}
                title="Next free day"
                hint={`${next.toLocaleString(undefined, { weekday: "long", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · one video a day for this channel`}
              >
                {when === "next" && <Input type="time" value={time} onChange={(event) => setTime(event.target.value)} className="h-7 w-32" aria-label="Time of day" />}
              </Option>
              <Option value="pick" active={when === "pick"} title="Pick a time" hint="Goes public at the time you choose.">
                {when === "pick" && <Input type="datetime-local" value={picked} onChange={(event) => setPicked(event.target.value)} className="h-7 w-52" aria-label="Publish time" />}
              </Option>
            </RadioGroup>
            {publishAt && (
              <p className={cn("flex items-center gap-1.5 text-xs", tooSoon ? "text-destructive" : "text-muted-foreground")}>
                <CalendarClockIcon className="size-3.5" />
                {tooSoon ? "Pick a time at least 5 minutes from now." : "Uploads as private now; YouTube makes it public at that time."}
              </p>
            )}
          </section>

          {when === "now" && (
            <section className="grid gap-2">
              <Label className="text-xs text-muted-foreground">Visibility</Label>
              <RadioGroup value={privacy} onValueChange={(value) => setPrivacy(value as Privacy)} className="gap-0 overflow-hidden rounded-lg border">
                {PRIVACY.map((option) => (
                  <Option key={option.value} value={option.value} active={privacy === option.value} title={option.label} hint={option.hint} />
                ))}
              </RadioGroup>
            </section>
          )}

          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
            <dt className="text-muted-foreground">Made for kids</dt>
            <dd>{channel?.madeForKids ? "Yes (set by the channel)" : "No"}</dd>
            <dt className="text-muted-foreground">Description</dt>
            <dd className="truncate">{project.description ? `${project.description.length} characters + ${project.tags.length} hashtags` : "Empty"}</dd>
            <dt className="text-muted-foreground">API quota</dt>
            <dd>1,600 of 10,000 daily units (about 6 uploads a day)</dd>
          </dl>

          {!project.hasVideo && <p className="text-xs text-destructive">Render the video first.</p>}
          {error && <p className="text-xs text-destructive">{error}</p>}
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={!canUpload} onClick={upload}>
            <UploadIcon />
            {uploaded ? "Upload again" : publishAt ? "Upload and schedule" : "Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** One row of a bordered radio list, with an optional control that appears when chosen. */
function Option({ value, active, title, hint, children }: { value: string; active: boolean; title: string; hint: string; children?: React.ReactNode }) {
  return (
    <label className={cn("flex cursor-pointer items-center gap-3 border-b px-3 py-2 last:border-b-0", active && "bg-muted/50")}>
      <RadioGroupItem value={value} />
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="text-sm font-medium">{title}</span>
        <span className="truncate text-xs text-muted-foreground">{hint}</span>
      </span>
      {children}
    </label>
  );
}
