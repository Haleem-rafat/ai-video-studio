import { useCallback, useEffect, useState } from "react";
import { CheckIcon, ChevronDownIcon, DownloadIcon, ExternalLinkIcon, MonitorSmartphoneIcon, MusicIcon, PencilIcon, RotateCcwIcon, Trash2Icon, VolumeXIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { api, promoFileUrl, type Job, type PromoOptions, type PromoState } from "../api.ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { JobProgress } from "./JobProgress.tsx";
import { Confirm } from "./shared.tsx";
import { MusicLibrary } from "./MusicLibrary.tsx";
import { PlayButton } from "./PlayButton.tsx";
import { VideoPlayer } from "./VideoPlayer.tsx";
import { MOOD_LABEL, MOODS, trackName, type Track } from "./promo-music.ts";

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
const optionsLabel = (options: PromoOptions) =>
  `${SPEEDS.find((speed) => speed.id === options.speed)?.label} · ${LENGTHS.find((length) => length.id === options.length)?.label}${options.music ? ` · ${trackName(options.music)}` : ""}`;

const SHAPE_LABEL = { "16x9": "16:9 · YouTube, website", "9x16": "9:16 · Reels, TikTok, stories" } as const;

/** Every music choice: Auto (""), none, a new AI track, or a library track. */
function MusicSelect({ value, tracks, onChange }: { value: string; tracks: Track[]; onChange: (value: string) => void }) {
  return (
    // The design system's Select can't hold an empty value, so Auto travels as "auto".
    <Select value={value || "auto"} onValueChange={(next) => onChange(next === "auto" ? "" : next)}>
      <SelectTrigger size="sm" className="min-w-64">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="auto">Auto: a different track each time</SelectItem>
        <SelectItem value="none">No music</SelectItem>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>Make a new AI track (ElevenLabs)</SelectLabel>
          {MOODS.map((mood) => (
            <SelectItem key={mood} value={`new:${mood}`}>
              New {MOOD_LABEL[mood].toLowerCase()} track
            </SelectItem>
          ))}
        </SelectGroup>
        {tracks.length > 0 && (
          <>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Library</SelectLabel>
              {tracks.map((track) => (
                <SelectItem key={track.file} value={track.file}>
                  {trackName(track.file)} ({Math.round(track.seconds)}s)
                </SelectItem>
              ))}
            </SelectGroup>
          </>
        )}
      </SelectContent>
    </Select>
  );
}

/** Website promos: any site scrolling on a laptop and a phone, with music, in both video shapes. */
export function PromosView({ id, jobs, onOpen }: Props) {
  const [promos, setPromos] = useState<PromoState[]>([]);
  const [url, setUrl] = useState("");
  const [options, setOptions] = useState<PromoOptions>({ speed: "slow", length: 45 });
  const [tracks, setTracks] = useState<Track[]>([]);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const promoJobs = jobs.filter((job) => /^(Website promo|Promo music|New music): /.test(job.label));
  const finished = promoJobs.filter((job) => job.status === "done" || job.status === "failed").length;

  const refreshTracks = useCallback(() => api.promoMusic().then(setTracks).catch(() => setTracks([])), []);
  const refresh = useCallback(() => {
    void api.promos().then(setPromos).catch(() => setPromos([]));
    void refreshTracks();
  }, [refreshTracks]);
  // Reload whenever a promo, music change or new track job finishes.
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
  const remove = (promo: PromoState) =>
    api
      .deletePromo(promo.id)
      .then(() => {
        toast.success("Promo deleted");
        onOpen(null);
        refresh();
      })
      .catch((error: Error) => toast.error(error.message));
  const failedCount = promos.filter((promo) => promo.status === "failed").length;
  const jobOf = (promo: PromoState) => promoJobs.find((job) => job.link === `/marketing/promos/${promo.id}` && (job.status === "queued" || job.status === "running"));

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
          <MusicSelect value={options.music ?? ""} tracks={tracks} onChange={(music) => setOptions({ ...options, music: music || undefined })} />
          {options.music?.startsWith("new:") && <span className="text-xs text-muted-foreground">About a minute more; billed by ElevenLabs. It joins the library for later promos.</span>}
          {options.music?.endsWith(".mp3") && <PlayButton src={`/promo-music/${options.music}`} label="Listen" />}
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

      {open && <PromoDetail key={open.id} promo={open} job={jobOf(open)} tracks={tracks} remakeWith={options} onRemake={() => make(open.url)} onDelete={() => remove(open)} onChanged={refresh} />}

      <div className="rounded-xl border p-2">
        <Button variant="ghost" className="w-full justify-start" aria-expanded={libraryOpen} onClick={() => setLibraryOpen(!libraryOpen)}>
          <MusicIcon className="text-muted-foreground" /> Music library <span className="font-mono text-xs text-muted-foreground">{tracks.length}</span>
          <ChevronDownIcon className={`ms-auto transition-transform ${libraryOpen ? "rotate-180" : ""}`} />
        </Button>
        {libraryOpen && (
          <div className="px-2 pt-2 pb-1">
            <MusicLibrary tracks={tracks} jobs={jobs} onChanged={refresh} />
          </div>
        )}
      </div>

      {promos.length > 0 && (
        <div className="grid gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">All promos</span>
            {failedCount > 0 && (
              <Confirm
                trigger={
                  <Button size="sm" variant="ghost" className="ms-auto text-destructive">
                    <Trash2Icon /> Delete failed ({failedCount})
                  </Button>
                }
                title={`Delete ${failedCount} failed ${failedCount === 1 ? "promo" : "promos"}?`}
                description="Promos that failed are removed from the list. Finished promos and ones being made are kept."
                action="Delete failed"
                onConfirm={() =>
                  api
                    .deleteFailedPromos()
                    .then(({ deleted }) => {
                      toast.success(`Deleted ${deleted.length} failed ${deleted.length === 1 ? "promo" : "promos"}`);
                      if (id && deleted.includes(id)) onOpen(null);
                      refresh();
                    })
                    .catch((error: Error) => toast.error(error.message))
                }
              />
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {promos.map((promo) => (
              <button key={promo.id} type="button" onClick={() => onOpen(promo.id)} className={`grid gap-2 rounded-xl border p-3 text-left hover:bg-muted/40 ${promo.id === id ? "ring-2 ring-primary" : ""}`}>
                {promo.status === "done" && promo.videos?.["16x9"] ? (
                  // A still at 4 s; it plays silently while the pointer is over it.
                  <video
                    src={`${promoFileUrl(promo.id, promo.videos["16x9"], promo.updatedAt)}#t=4`}
                    preload="metadata"
                    muted
                    playsInline
                    loop
                    onMouseEnter={(event) => void event.currentTarget.play().catch(() => {})}
                    onMouseLeave={(event) => {
                      event.currentTarget.pause();
                      event.currentTarget.currentTime = 4;
                    }}
                    className="aspect-video w-full rounded-lg border bg-black object-cover"
                  />
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

function PromoDetail({
  promo,
  job,
  tracks,
  remakeWith,
  onRemake,
  onDelete,
  onChanged,
}: {
  promo: PromoState;
  job?: Job;
  tracks: Track[];
  remakeWith: PromoOptions;
  onRemake: () => void;
  onDelete: () => void;
  onChanged: () => void;
}) {
  const running = Boolean(job);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(promo.title);
  const [music, setMusic] = useState(promo.options?.music ?? "");
  const [shape, setShape] = useState<"16x9" | "9x16">("16x9");
  const act = (work: Promise<unknown>, done: string) =>
    work
      .then(() => {
        toast.success(done);
        onChanged();
      })
      .catch((error: Error) => toast.error(error.message));
  const file = promo.videos?.[shape];
  const download = `${promo.host}-promo-${shape}`;

  return (
    <div className="grid gap-4 rounded-xl border p-4">
      <div className="flex flex-wrap items-center gap-2">
        {renaming ? (
          <form
            className="flex min-w-0 flex-1 items-center gap-1.5"
            onSubmit={(event) => {
              event.preventDefault();
              act(api.renamePromo(promo.id, title), "Promo renamed").then(() => setRenaming(false));
            }}
          >
            <Input autoFocus dir="auto" value={title} onChange={(event) => setTitle(event.target.value)} className="h-8" />
            <Button size="icon" type="submit" variant="ghost" disabled={!title.trim()} title="Save">
              <CheckIcon />
            </Button>
            <Button size="icon" type="button" variant="ghost" title="Cancel" onClick={() => setRenaming(false)}>
              <XIcon />
            </Button>
          </form>
        ) : (
          <div className="grid min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1">
              <span className="truncate text-lg font-semibold" dir="auto">
                {promo.title}
              </span>
              <Button size="icon" variant="ghost" className="size-7 shrink-0" title="Rename" onClick={() => setRenaming(true)}>
                <PencilIcon />
              </Button>
            </div>
            <a href={promo.url} target="_blank" rel="noreferrer" className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:underline">
              {promo.host} <ExternalLinkIcon className="size-3" />
            </a>
          </div>
        )}
        <Button size="sm" variant="outline" disabled={running} onClick={onRemake} title="With the speed, length and music chosen above">
          <RotateCcwIcon /> Record again
        </Button>
        <Confirm
          trigger={
            <Button size="sm" variant="ghost" className="text-destructive" disabled={promo.status === "making" || running} title={promo.status === "making" ? "It is being made" : "Delete this promo and its videos"}>
              <Trash2Icon /> Delete
            </Button>
          }
          title="Delete this promo?"
          description={`The promo of ${promo.host}, its 16:9 and 9:16 videos and its recording are deleted. This can't be undone.`}
          action="Delete promo"
          onConfirm={onDelete}
        />
      </div>

      {job && <JobProgress job={job} compact />}
      {promo.status === "failed" && !running && <p className="text-sm text-destructive">Failed: {promo.error ?? "unknown error"}</p>}
      {promo.status === "making" && !running && <p className="text-sm text-muted-foreground">Waiting to record…</p>}

      {promo.status === "done" && promo.videos && (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <Tabs value={shape} onValueChange={(next) => setShape(next as "16x9" | "9x16")} className="min-w-0">
            <TabsList>
              <TabsTrigger value="16x9">16:9 · YouTube, website</TabsTrigger>
              <TabsTrigger value="9x16">9:16 · Reels, TikTok</TabsTrigger>
            </TabsList>
            {(["16x9", "9x16"] as const).map((each) =>
              promo.videos?.[each] ? (
                <TabsContent key={each} value={each} className="pt-2">
                  <VideoPlayer src={promoFileUrl(promo.id, promo.videos[each]!, promo.updatedAt)} shape={each} posterAt={4} maxHeight="68vh" />
                </TabsContent>
              ) : null,
            )}
          </Tabs>

          <aside className="grid content-start gap-3">
            <section className="grid gap-2 rounded-lg border p-3">
              <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Download {shape === "16x9" ? "16:9" : "9:16"}</h3>
              {file && (
                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" asChild className={promo.music ? "" : "col-span-2"}>
                    <a href={promoFileUrl(promo.id, file, promo.updatedAt)} download={`${download}.mp4`}>
                      <DownloadIcon /> {promo.music ? "With music" : "Download"}
                    </a>
                  </Button>
                  {promo.music && (
                    <Button size="sm" variant="outline" asChild>
                      <a href={promoFileUrl(promo.id, `promo-${shape}-muted.mp4`, promo.updatedAt)} download={`${download}-muted.mp4`}>
                        <VolumeXIcon /> Muted
                      </a>
                    </Button>
                  )}
                </div>
              )}
              <p className="text-xs text-muted-foreground">{shape === "16x9" ? "1920×1080" : "1080×1920"} MP4. Switch the tab for the other shape.</p>
            </section>

            <section className="grid gap-2 rounded-lg border p-3">
              <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Music</h3>
              <p className="flex items-center gap-1.5 text-sm">
                <MusicIcon className="size-4 text-muted-foreground" />
                {promo.music ? trackName(promo.music) : "No music"}
              </p>
              <MusicSelect value={music} tracks={tracks} onChange={setMusic} />
              <Button
                size="sm"
                variant="outline"
                disabled={running || !promo.canChangeMusic}
                title={promo.canChangeMusic ? "Keeps the recording; only the music changes (a few seconds)" : "Made before recordings were kept: record again to change its music"}
                onClick={() => act(api.changePromoMusic(promo.id, music), "Changing the music…")}
              >
                Change music
              </Button>
              {!promo.canChangeMusic && <p className="text-xs text-muted-foreground">This older promo has no saved recording: record again to change its music.</p>}
            </section>

            <section className="grid gap-1.5 rounded-lg border p-3 text-sm">
              <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Details</h3>
              <Detail label="Length" value={promo.seconds ? `${Math.round(promo.seconds)}s` : "—"} />
              {promo.options && <Detail label="Speed" value={SPEEDS.find((speed) => speed.id === promo.options!.speed)?.label ?? "—"} />}
              {promo.options && <Detail label="Scroll" value={LENGTHS.find((length) => length.id === promo.options!.length)?.label ?? "—"} />}
              <Detail label="Cost" value="$0.00" mono />
              <Detail label="Made" value={new Date(promo.createdAt).toLocaleString()} />
              <p className="pt-1 text-xs text-muted-foreground">Record again uses: {optionsLabel(remakeWith)}</p>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono tabular-nums" : ""}>{value}</span>
    </div>
  );
}
