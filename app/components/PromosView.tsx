import { useCallback, useEffect, useState } from "react";
import { DownloadIcon, ExternalLinkIcon, MonitorSmartphoneIcon, RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";

import { api, promoFileUrl, type Job, type Promo } from "../api.ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { JobProgress } from "./JobProgress.tsx";

type Props = { id: string | null; jobs: Job[]; onOpen: (id: string | null) => void };

const SHAPE_LABEL = { "16x9": "16:9 · YouTube, website", "9x16": "9:16 · Reels, TikTok, stories" } as const;

/** Website promos: any site scrolling on a laptop and a phone, with music, in both video shapes. */
export function PromosView({ id, jobs, onOpen }: Props) {
  const [promos, setPromos] = useState<Promo[]>([]);
  const [url, setUrl] = useState("");
  const promoJobs = jobs.filter((job) => job.label.startsWith("Website promo: "));
  const finished = promoJobs.filter((job) => job.status === "done" || job.status === "failed").length;

  const refresh = useCallback(() => api.promos().then(setPromos).catch(() => setPromos([])), []);
  // Reload whenever a promo job finishes.
  useEffect(() => void refresh(), [refresh, finished]);

  const make = (site: string) =>
    api
      .makePromo(site)
      .then((job) => {
        toast.success("Recording the website…");
        setUrl("");
        refresh();
        onOpen(job.promoId);
      })
      .catch((error: Error) => toast.error(error.message));

  const open = id ? promos.find((promo) => promo.id === id) : undefined;
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
        <div className="flex gap-2">
          <Input value={url} placeholder="https://yoursite.com" onChange={(event) => setUrl(event.target.value)} />
          <Button type="submit" disabled={!url.trim()}>
            Make promo
          </Button>
        </div>
      </form>

      {open && <PromoDetail promo={open} job={jobOf(open)} onRemake={() => make(open.url)} />}

      {promos.length > 0 && (
        <div className="grid gap-2">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">All promos</span>
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

function PromoDetail({ promo, job, onRemake }: { promo: Promo; job?: Job; onRemake: () => void }) {
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
        {promo.seconds && <Badge variant="outline">{Math.round(promo.seconds)}s · music</Badge>}
        <Button size="sm" variant="outline" className="ms-auto" disabled={running} onClick={onRemake}>
          <RotateCcwIcon /> Record again
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
