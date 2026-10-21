import { useCallback, useEffect, useState } from "react";
import { DownloadIcon, ExternalLinkIcon, MonitorSmartphoneIcon, RotateCcwIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { api, promoFileUrl, type Job, type Promo, type PromoOptions } from "../api.ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { JobProgress } from "./JobProgress.tsx";

type Props = { id: string | null; jobs: Job[]; onOpen: (id: string | null) => void };

const SPEEDS: { id: PromoOptions["speed"]; label: string; hint: string }[] = [
  { id: "slow", label: "Slow", hint: "Every section can be read" },
  { id: "normal", label: "Normal", hint: "A relaxed scroll" },
  { id: "fast", label: "Fast", hint: "A quick tour of the page" },
];
const LENGTHS: { id: PromoOptions["length"]; label: string }[] = [
  { id: 15, label: "15s" },
  { id: 30, label: "30s" },
  { id: 45, label: "45s" },
  { id: 60, label: "60s" },
  { id: "page", label: "Whole page" },
];
const MOODS = ["calm", "upbeat", "corporate", "cinematic", "lofi"] as const;
const MOOD_LABEL: Record<(typeof MOODS)[number], string> = { calm: "calm", upbeat: "upbeat", corporate: "corporate", cinematic: "cinematic", lofi: "lo-fi" };

/** "calm-piano.mp3" → "Calm piano"; "none" → "No music"; "new:upbeat" → "New upbeat track". */
const trackName = (file: string) =>
  file === "none"
    ? "No music"
    : file.startsWith("new:")
      ? `New ${MOOD_LABEL[file.slice(4) as (typeof MOODS)[number]] ?? file.slice(4)} track`
      : file.replace(/\.mp3$/i, "").replace(/[-_]+/g, " ").replace(/^./, (c) => c.toUpperCase());
const optionsLabel = (options: PromoOptions) =>
  `${SPEEDS.find((speed) => speed.id === options.speed)?.label} · ${LENGTHS.find((length) => length.id === options.length)?.label}${options.music ? ` · ${trackName(options.music)}` : ""}`;

const SHAPE_LABEL = { "16x9": "16:9 · YouTube, website", "9x16": "9:16 · Reels, TikTok, stories" } as const;

/** Website promos: any site scrolling on a laptop and a phone, with music, in both video shapes. */
export function PromosView({ id, jobs, onOpen }: Props) {
  const [promos, setPromos] = useState<Promo[]>([]);
  const [url, setUrl] = useState("");
  const [options, setOptions] = useState<PromoOptions>({ speed: "slow", length: 45 });
  const [tracks, setTracks] = useState<{ file: string; seconds: number }[]>([]);
  useEffect(() => void api.promoMusic().then(setTracks).catch(() => setTracks([])), []);
  const promoJobs = jobs.filter((job) => job.label.startsWith("Website promo: "));
  const finished = promoJobs.filter((job) => job.status === "done" || job.status === "failed").length;

  const refresh = useCallback(() => api.promos().then(setPromos).catch(() => setPromos([])), []);
  // Reload whenever a promo job finishes.
  useEffect(() => void refresh(), [refresh, finished]);

  const make = (site: string) =>
    api
      .makePromo(site, options)
      .then((job) => {
        toast.success("Recording the website…");
        setUrl("");
        refresh();
        onOpen(job.promoId);
      })
      .catch((error: Error) => toast.error(error.message));

  const open = id ? promos.find((promo) => promo.id === id) : undefined;
  // Opening a promo shows the speed and length it was made with, ready to record again or adjust.
  useEffect(() => {
    if (open?.options) setOptions(open.options);
  }, [open?.id]);
  const remove = (promo: Promo) => {
    if (!confirm(`Delete this promo of ${promo.host} and its videos?`)) return;
    api
      .deletePromo(promo.id)
      .then(() => {
        toast.success("Promo deleted");
        onOpen(null);
        refresh();
      })
      .catch((error: Error) => toast.error(error.message));
  };
  const failedCount = promos.filter((promo) => promo.status === "failed").length;
  const jobOf = (promo: Promo) => promoJobs.find((job) => job.link === `/marketing/promos/${promo.id}`);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-auto p-6">
      <form
        className="grid max-w-2xl gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (url.trim()) make(url);
        }}
      >
        <div className="flex items-center gap-2">
          <MonitorSmartphoneIcon className="size-5 text-muted-foreground" />
          <h2 className="font-semibold">Website promo</h2>
        </div>
        <p className="text-sm text-muted-foreground">The site scrolls top to bottom on a laptop and a phone, with music, as a 16:9 and a 9:16 video. Recorded on this Mac: no AI cost.</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Speed</span>
            {SPEEDS.map((speed) => (
              <Button key={speed.id} type="button" size="sm" title={speed.hint} variant={options.speed === speed.id ? "default" : "outline"} onClick={() => setOptions({ ...options, speed: speed.id })}>
                {speed.label}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Length</span>
            {LENGTHS.map((length) => (
              <Button key={length.id} type="button" size="sm" variant={options.length === length.id ? "default" : "outline"} onClick={() => setOptions({ ...options, length: length.id })}>
                {length.label}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Music</span>
          <select
            className="h-8 rounded-md border bg-background px-2 text-sm"
            value={options.music ?? ""}
            onChange={(event) => setOptions({ ...options, music: event.target.value || undefined })}
          >
            <option value="">Auto: a different track each time</option>
            <option value="none">No music</option>
            <optgroup label="Make a new AI track (ElevenLabs)">
              {MOODS.map((mood) => (
                <option key={mood} value={`new:${mood}`}>
                  New {MOOD_LABEL[mood]} track
                </option>
              ))}
            </optgroup>
            <optgroup label="Library">
              {tracks.map((track) => (
                <option key={track.file} value={track.file}>
                  {trackName(track.file)} ({Math.round(track.seconds)}s)
                </option>
              ))}
            </optgroup>
          </select>
          {options.music?.startsWith("new:") && <span className="text-xs text-muted-foreground">About a minute more; billed by ElevenLabs. It joins the library for later promos.</span>}
          {options.music?.endsWith(".mp3") && <audio key={options.music} src={`/promo-music/${options.music}`} controls preload="none" className="h-8" />}
        </div>
        <p className="text-xs text-muted-foreground">
          {options.length === "page" ? "Scrolls the whole page at this speed (up to 2 minutes)." : `Scrolls at this speed for up to ${options.length}s: a long page shows its first part, a short one ends sooner.`}
        </p>
        <div className="flex gap-2">
          <Input value={url} placeholder="https://yoursite.com" onChange={(event) => setUrl(event.target.value)} />
          <Button type="submit" disabled={!url.trim()}>
            Make promo
          </Button>
        </div>
      </form>

      {open && <PromoDetail promo={open} job={jobOf(open)} remakeWith={options} onRemake={() => make(open.url)} onDelete={() => remove(open)} />}

      {promos.length > 0 && (
        <div className="grid gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">All promos</span>
            {failedCount > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="ms-auto text-destructive"
                onClick={() =>
                  api
                    .deleteFailedPromos()
                    .then(({ deleted }) => {
                      toast.success(`Deleted ${deleted.length} failed ${deleted.length === 1 ? "promo" : "promos"}`);
                      if (id && deleted.includes(id)) onOpen(null);
                      refresh();
                    })
                    .catch((error: Error) => toast.error(error.message))
                }
              >
                <Trash2Icon /> Delete failed ({failedCount})
              </Button>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {promos.map((promo) => (
              <button key={promo.id} type="button" onClick={() => onOpen(promo.id)} className={`grid gap-2 rounded-xl border p-3 text-left hover:bg-muted/40 ${promo.id === id ? "ring-2 ring-primary" : ""}`}>
                {promo.status === "done" && promo.videos?.["16x9"] ? (
                  <video src={`${promoFileUrl(promo.id, promo.videos["16x9"])}#t=4`} preload="metadata" muted className="aspect-video w-full rounded-lg border bg-black object-cover" />
                ) : (
                  <div className="flex aspect-video w-full items-center justify-center rounded-lg border bg-muted text-xs text-muted-foreground">{promo.status === "failed" ? "Failed" : "Recording…"}</div>
                )}
                <span className="truncate text-sm font-medium" dir="auto">
                  {promo.title}
                </span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  {promo.host} · {new Date(promo.createdAt).toLocaleString()}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PromoDetail({ promo, job, remakeWith, onRemake, onDelete }: { promo: Promo; job?: Job; remakeWith: PromoOptions; onRemake: () => void; onDelete: () => void }) {
  const running = job && (job.status === "queued" || job.status === "running");
  return (
    <div className="grid gap-4 rounded-xl border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 truncate font-semibold" dir="auto">
          {promo.title}
        </span>
        <a href={promo.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-muted-foreground hover:underline">
          {promo.host} <ExternalLinkIcon className="size-3" />
        </a>
        <Badge variant="outline" className="font-mono">
          $0.00
        </Badge>
        {promo.seconds && <Badge variant="outline">{Math.round(promo.seconds)}s</Badge>}
        {promo.options && <Badge variant="outline">{optionsLabel(promo.options)}</Badge>}
        {promo.status === "done" && <Badge variant="outline">{promo.music ? `♪ ${trackName(promo.music)}` : "No music"}</Badge>}
        <Button size="sm" variant="outline" className="ms-auto" disabled={running} onClick={onRemake} title="With the speed and length chosen above">
          <RotateCcwIcon /> Record again ({optionsLabel(remakeWith)})
        </Button>
        <Button size="sm" variant="ghost" className="text-destructive" disabled={promo.status === "making"} title={promo.status === "making" ? "It is being made" : "Delete this promo and its videos"} onClick={onDelete}>
          <Trash2Icon /> Delete
        </Button>
      </div>
      {running && <JobProgress job={job} compact />}
      {promo.status === "failed" && !running && <p className="text-sm text-destructive">Failed: {promo.error ?? "unknown error"}</p>}
      {promo.status === "making" && !running && !job && <p className="text-sm text-muted-foreground">Waiting to record…</p>}
      {promo.status === "done" && promo.videos && (
        <div className="grid items-start gap-4 lg:grid-cols-[2fr_1fr]">
          {(["16x9", "9x16"] as const).map((shape) =>
            promo.videos?.[shape] ? (
              <div key={shape} className="grid gap-2">
                <video src={promoFileUrl(promo.id, promo.videos[shape]!)} controls preload="metadata" className={`w-full rounded-lg border bg-black ${shape === "16x9" ? "aspect-video" : "mx-auto aspect-[9/16] max-h-[640px] w-auto"}`} />
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {SHAPE_LABEL[shape]}
                  <Button size="sm" variant="outline" className="ms-auto" asChild>
                    <a href={promoFileUrl(promo.id, promo.videos[shape]!)} download={`${promo.host}-promo-${shape}.mp4`}>
                      <DownloadIcon /> Download
                    </a>
                  </Button>
                </div>
              </div>
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}
