import { useCallback, useEffect, useRef, useState } from "react";
import { ClapperboardIcon, DownloadIcon, NotebookPenIcon, PartyPopperIcon, RefreshCwIcon, ShapesIcon, SparklesIcon, Gamepad2Icon, HighlighterIcon, BoxIcon, Rotate3dIcon as RotateCw3dIcon, Loader2Icon, MicIcon, MousePointerClickIcon, NewspaperIcon, PenLineIcon, SaveIcon, ScanEyeIcon, Trash2Icon, UserRoundIcon } from "lucide-react";
import { toast } from "sonner";

import { api, formatCost, reelFileUrl, type Channel, type Client, type Job, type ProjectSummary, type ReelState, type ReelStyle } from "../api.ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { JobProgress } from "./JobProgress.tsx";
import { PublishDialog } from "./PublishDialog.tsx";
import { KineticEditor, LinesEditor, StoryEditor, NewsEditor, OptionsEditor, ProofEditor, QuestsEditor, VoiceEditor } from "./ReelEditors.tsx";
import { REEL_PRICES, ReelInfo, unvoiced, voiceEstimate } from "./ReelInfo.tsx";
import { Confirm, Field } from "./shared.tsx";
import { VideoPlayer } from "./VideoPlayer.tsx";

type Props = { id: string | null; jobs: Job[]; channels: Channel[]; projects: ProjectSummary[]; onOpen: (id: string | null) => void };

export const REEL_STYLE_INFO: Record<ReelStyle, { label: string; hint: string }> = {
  rpg: { label: "RPG reel", hint: "Retro 16-bit game UI: a quest log that checks off as you talk, scrolling code, a talking pixel character with typed Arabic, and a voice visualizer." },
  news: { label: "Breaking news reel", hint: "عاجل news cards in the channel's colours: press photo with a slow zoom, a bold headline with an accent punchline, stat cards that count up, and the source." },
  proof: { label: "Proof reel", hint: "30–45s. Real screenshots in a Mac browser on top, your cartoon character talking at a desk below, an English hook card, big real numbers, and «comment KEYWORD» at the end." },
  kinetic: { label: "Motion reel", hint: "30–45s, no presenter: kinetic words on black, one key word in a serif selection box, UI mockups (chat, DM, browser, phone), rolling numbers and a clicking cursor." },
  diagram: { label: "Diagram reel", hint: "60–70s explainer on charcoal: a headline with a gold punch phrase, one picture per scene (floating press photo, exploded layers, quote, stamp, price tag, bars, specs) and the word being said alone and big under it." },
  "3d": { label: "3D reel", hint: "60–80s 3D explainer: the MacBook or iPad built in 3D with the press photo on its screen and a moving camera, the screen's layers exploding apart, a finger touching a cut-through screen with ripples, and the word being said big under it." },
  editorial: { label: "Editorial reel", hint: "60–70s story that cuts between a dark spotlight stage and light grid paper: the line at the top with its key word selected, press quotes highlighted, red stamps, a big price, a price bar chart and a pick-one question." },
  aurora: { label: "Aurora glass", hint: "Calm and premium: colour light drifting slowly on deep indigo, frosted glass cards, words that fade up 8px, a soft pad. For channels and clients." },
  variety: { label: "Variety captions", hint: "TV-show caption art on sun rays: fat outlined words popping in with overshoot, burst frames, sparkles and boings. For channels and clients." },
  flat: { label: "Flat vector", hint: "Bold flat colour fields, a circle wipe on every cut, pieces landing with squash and stretch. A clear explainer for channels and clients." },
  sketch: { label: "Sketch notebook", hint: "A lined notebook page: taped notes, a marker that circles the big number, the highlighter on the key word, a hand-made wobble. For channels and clients." },
};

/** The looks a client's reel can have (drawn by reels/lib/scenes.js). */
const CLIENT_STYLES: ReelStyle[] = ["aurora", "variety", "flat", "sketch"];

export { REEL_PRICES };

/** A reel style's icon. */
const StyleIcon = ({ style, className }: { style: ReelStyle; className?: string }) =>
  style === "rpg" ? <Gamepad2Icon className={className} /> : style === "news" ? <NewspaperIcon className={className} /> : style === "proof" ? <UserRoundIcon className={className} /> : style === "3d" ? <RotateCw3dIcon className={className} /> : style === "diagram" ? <BoxIcon className={className} /> : style === "editorial" ? <HighlighterIcon className={className} /> : style === "aurora" ? <SparklesIcon className={className} /> : style === "variety" ? <PartyPopperIcon className={className} /> : style === "flat" ? <ShapesIcon className={className} /> : style === "sketch" ? <NotebookPenIcon className={className} /> : <MousePointerClickIcon className={className} />;

const reelPage = (id: string) => `/reels/${id}`;

/** Code-drawn 9:16 reels (RPG, breaking news): written from a topic, edited here, voiced and rendered. */
export function ReelsView({ id, jobs, channels, projects, onOpen }: Props) {
  const [reels, setReels] = useState<ReelState[]>([]);
  const reelJobs = jobs.filter((job) => job.link?.startsWith("/reels/"));
  const finished = reelJobs.filter((job) => job.status === "done" || job.status === "failed").length;
  const refresh = useCallback(() => void api.reels().then(setReels).catch(() => setReels([])), []);
  // Reload whenever a reel job finishes.
  useEffect(() => refresh(), [refresh, finished]);

  const open = id ? reels.find((reel) => reel.id === id) : undefined;
  const jobOf = (reel: ReelState) => reelJobs.find((job) => job.link === reelPage(reel.id) && (job.status === "queued" || job.status === "running"));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-auto p-6">
      <NewReel channels={channels} onMade={(reelId) => { refresh(); onOpen(reelId); }} />

      {open && (
        <ReelDetail
          key={open.id}
          reel={open}
          job={jobOf(open)}
          channel={channels.find((channel) => channel.id === open.channel)}
          // Scheduled videos and reels both take a channel's day.
          scheduled={[...projects, ...reels.map((reel) => ({ channel: reel.channel, youtube: reel.upload }))]}
          onChanged={(next) => setReels((all) => all.map((reel) => (reel.id === next.id ? next : reel)))}
          onDeleted={() => { onOpen(null); refresh(); }}
        />
      )}

      {reels.length > 0 && (
        <div className="grid gap-2">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">All reels</span>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {reels.map((reel) => (
              <button key={reel.id} type="button" onClick={() => onOpen(reel.id)} className={cn("grid gap-2 rounded-xl border p-2 text-left hover:bg-muted/40", reel.id === id && "ring-2 ring-primary")}>
                {reel.render ? (
                  <video src={`${reelFileUrl(reel.id, reel.render.file, reel.render.at)}#t=2`} preload="metadata" muted playsInline className="aspect-[9/16] w-full rounded-lg border bg-black object-cover" />
                ) : reel.stills?.files[0] ? (
                  <img src={reelFileUrl(reel.id, reel.stills.files[0], reel.stills.at)} className="aspect-[9/16] w-full rounded-lg border bg-black object-cover" />
                ) : (
                  <div className="flex aspect-[9/16] w-full items-center justify-center rounded-lg border bg-muted text-xs text-muted-foreground">{reel.status === "writing" ? "Writing…" : reel.status === "failed" ? "Failed" : "Not rendered"}</div>
                )}
                <span className="line-clamp-2 text-sm font-medium" dir="auto">{reel.title}</span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <StyleIcon style={reel.style} className="size-3.5" />
                  {new Date(reel.createdAt).toLocaleDateString()}
                  <span className="ms-auto font-mono tabular-nums">{formatCost(reel.cost)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Channel or client, style and topic: the writer researches it (or reads the client's brief) and writes the lines and screens. */
function NewReel({ channels, onMade }: { channels: Channel[]; onMade: (id: string) => void }) {
  const [channel, setChannel] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [style, setStyle] = useState<ReelStyle>("rpg");
  const forClient = channel.startsWith("client:");
  useEffect(() => {
    api.clients().then(setClients).catch(() => setClients([]));
  }, []);
  // A client's reel comes only in the newer looks.
  useEffect(() => {
    if (forClient && !CLIENT_STYLES.includes(style)) setStyle("aurora");
  }, [forClient, style]);
  const [topic, setTopic] = useState("");
  const [wide, setWide] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!channel && channels[0]) setChannel((channels.find((each) => each.language === "ar") ?? channels[0]).id);
  }, [channels, channel]);

  const make = () => {
    setBusy(true);
    api
      .createReel(channel, style, topic.trim(), style === "3d" && wide ? "wide" : "tall")
      .then((job) => {
        toast.success(forClient ? "Writing the reel from the client's brief…" : "Researching and writing the reel…");
        setTopic("");
        onMade(job.reelId);
      })
      .catch((error: Error) => toast.error(error.message))
      .finally(() => setBusy(false));
  };

  return (
    <form className="grid max-w-3xl gap-3" onSubmit={(event) => { event.preventDefault(); if (topic.trim()) make(); }}>
      <div className="flex items-center gap-2">
        <ClapperboardIcon className="size-5 text-muted-foreground" />
        <h2 className="font-semibold">Reels</h2>
      </div>
      <p className="text-sm text-muted-foreground">A 9:16 reel drawn in code (30–60 seconds). The topic is researched on the web, written in the channel's voice, then you edit it here before it is voiced and rendered.</p>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {(Object.keys(REEL_STYLE_INFO) as ReelStyle[]).filter((each) => !forClient || CLIENT_STYLES.includes(each)).map((each) => (
          <button
            key={each}
            type="button"
            role="radio"
            aria-checked={style === each}
            onClick={() => setStyle(each)}
            className={cn("flex flex-col items-start gap-1 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/60", style === each && "border-foreground/80 bg-muted/40 ring-1 ring-foreground/80")}
          >
            <video src={`/modes/${each}.mp4`} autoPlay muted loop playsInline preload="metadata" className="mb-1.5 aspect-video w-full rounded-md border bg-black object-cover" />
            <span className="text-sm font-medium">{REEL_STYLE_INFO[each].label}</span>
            <span className="text-xs text-muted-foreground">{REEL_STYLE_INFO[each].hint}</span>
          </button>
        ))}
      </div>
      {style === "3d" && (
        <div className="flex gap-2">
          <Button type="button" size="sm" variant={wide ? "outline" : "default"} onClick={() => setWide(false)}>9:16 reel / Short</Button>
          <Button type="button" size="sm" variant={wide ? "default" : "outline"} onClick={() => setWide(true)}>16:9 long YouTube video</Button>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Select value={channel} onValueChange={setChannel}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Channel or client" />
          </SelectTrigger>
          <SelectContent>
            {channels.map((each) => (
              <SelectItem key={each.id} value={each.id}>{each.name}</SelectItem>
            ))}
            {clients.map((each) => (
              <SelectItem key={each.id} value={`client:${each.id}`}>Client: {each.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input className="min-w-64 flex-1" dir="auto" value={topic} placeholder="e.g. Apple's new 14-inch MacBook Pro with M6" onChange={(event) => setTopic(event.target.value)} />
        <Button type="submit" disabled={!topic.trim() || !channel || busy}>
          {busy ? <Loader2Icon className="animate-spin" /> : <PenLineIcon />} Write reel
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        About {formatCost(REEL_PRICES.write)} to research and write, about {formatCost(voiceEstimate(Array(11).fill("x".repeat(75))))} to voice a 60s reel; rendering is free (this Mac).
      </p>
    </form>
  );
}

function ReelDetail({
  reel,
  job,
  channel,
  scheduled,
  onChanged,
  onDeleted,
}: {
  reel: ReelState;
  job?: Job;
  channel?: Channel;
  scheduled: Pick<ProjectSummary, "channel" | "youtube">[];
  onChanged: (reel: ReelState) => void;
  onDeleted: () => void;
}) {
  const [draft, setDraft] = useState(reel);
  const [dirty, setDirty] = useState(false);
  // A finished job changes the reel on the server; show that unless there are unsaved edits.
  useEffect(() => {
    if (!dirty) setDraft(reel);
  }, [reel]);
  const running = Boolean(job);
  const edit = (next: Partial<ReelState>) => {
    setDraft({ ...draft, ...next });
    setDirty(true);
  };

  const save = async (override?: Partial<ReelState>) => {
    const next = override ? { ...draft, ...override } : draft;
    const saved = await api.saveReel(reel.id, { title: next.title, lines: next.lines, rpg: next.rpg, news: next.news, proof: next.proof, kinetic: next.kinetic, story: next.story, options: next.options ?? {}, client: next.client, youtube: next.youtube });
    setDirty(false);
    setDraft(saved);
    onChanged(saved);
    return saved;
  };
  const act = (action: "write" | "voice" | "preview" | "render") =>
    (dirty ? save() : Promise.resolve(reel))
      .then(() => api.reelAction(reel.id, action))
      .then(() => toast.success(action === "write" ? "Writing the reel again…" : action === "render" ? "Rendering the reel…" : action === "preview" ? "Making preview frames…" : "Recording the voice…"))
      .catch((error: Error) => toast.error(error.message));

  const instantSwitch = (patch: Partial<ReelState>, runVoice: boolean) => {
    save(patch)
      .then(() => {
        if (runVoice) return api.reelAction(reel.id, "voice").then(() => toast.success("جاري تغيير وتوليد الصوت الجديد…"));
        toast.success("تم حفظ الصوت الجديد");
      })
      .catch((error: Error) => toast.error(error.message));
  };

  // A picture added from an editor is saved at once; keep the draft's other edits.
  const media = (next: ReelState) => {
    setDraft((current) => ({ ...current, media: next.media }));
    onChanged({ ...reel, media: next.media });
  };
  const pending = unvoiced(reel);
  const ready = reel.status === "ready";
  return (
    <div className="grid gap-4 rounded-xl border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input dir="auto" value={draft.title} onChange={(event) => edit({ title: event.target.value })} className="h-9 min-w-64 flex-1 text-base font-semibold" />
        <Badge variant="outline">{REEL_STYLE_INFO[reel.style].label}</Badge>
        <Badge variant="secondary" className="font-mono tabular-nums" title="AI spent on this reel so far: research, writing, voice and timing">
          {formatCost(reel.cost)}
        </Badge>
        <Button size="sm" variant={dirty ? "default" : "outline"} disabled={!dirty} onClick={() => save().then(() => toast.success("Saved")).catch((error: Error) => toast.error(error.message))}>
          <SaveIcon /> Save
        </Button>
        <Button size="sm" variant="outline" disabled={!ready || running} onClick={() => act("preview")} title="Voices the lines if they changed, then shows 6 frames">
          <ScanEyeIcon /> Preview
        </Button>
        <Button size="sm" disabled={!ready || running} onClick={() => act("render")} title="Voices the lines if they changed, then renders the MP4 (about 2 minutes)">
          <ClapperboardIcon /> Render
        </Button>
        {!reel.client && <PublishDialog
          project={{ id: reel.id, channel: reel.channel, title: draft.youtube?.title ?? draft.title, description: draft.youtube?.description ?? "", tags: draft.youtube?.tags ?? [], hasVideo: Boolean(reel.render), youtube: reel.upload }}
          channel={channel}
          projects={scheduled}
          busy={running}
          run={async (start) => {
            if (dirty) await save();
            await start();
            toast.success("Uploading to YouTube…");
          }}
          publish={(options) => api.publishReel(reel.id, options)}
        />}
        <Confirm
          trigger={
            <Button size="sm" variant="ghost" className="text-destructive" disabled={running}>
              <Trash2Icon /> Delete
            </Button>
          }
          title="Delete this reel?"
          description="The reel, its voice, pictures and video are moved to output/.trash."
          action="Delete reel"
          onConfirm={() => api.deleteReel(reel.id).then(onDeleted).catch((error: Error) => toast.error(error.message))}
        />
      </div>

      {job && <JobProgress job={job} compact />}
      {reel.status === "writing" && !running && <p className="text-sm text-muted-foreground">Waiting to be written…</p>}
      {reel.status === "failed" && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-destructive">Failed: {reel.error ?? "unknown error"}</p>
          {!running && (
            <Button size="sm" variant="outline" onClick={() => act("write")}>
              <RefreshCwIcon /> Write again
            </Button>
          )}
        </div>
      )}

      {ready && (
        <div className="grid items-start gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="grid content-start gap-3">
            {reel.render ? (
              <>
                <VideoPlayer src={reelFileUrl(reel.id, reel.render.file, reel.render.at)} shape="9x16" posterAt={2} maxHeight="min(62vh, 568px)" />
                <Button size="sm" asChild>
                  <a href={reelFileUrl(reel.id, reel.render.file, reel.render.at)} download={`${reel.id}.mp4`}>
                    <DownloadIcon /> Download MP4
                  </a>
                </Button>
              </>
            ) : (
              <div className="flex aspect-[9/16] max-h-[568px] items-center justify-center rounded-lg border bg-muted p-6 text-center text-sm text-muted-foreground">Not rendered yet. Preview first to check the frames, then Render.</div>
            )}
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MicIcon className="size-3.5" />
              {reel.voiceCurrent
                ? `Voice up to date · ${reel.voice!.seconds.toFixed(0)}s · Preview and Render cost nothing more`
                : `${pending.length} line${pending.length === 1 ? "" : "s"} to voice on Preview or Render: about ${formatCost(voiceEstimate(pending))}${dirty ? " (after saving)" : ""}`}
            </p>
            {reel.stills && (
              <div className="grid gap-1.5">
                <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Preview frames</span>
                <div className="grid grid-cols-3 gap-1.5">
                  {reel.stills.files.map((file) => (
                    <a key={file} href={reelFileUrl(reel.id, file, reel.stills!.at)} target="_blank" rel="noreferrer">
                      <img src={reelFileUrl(reel.id, file, reel.stills!.at)} className="aspect-[9/16] w-full rounded border bg-black object-cover" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </aside>

          <Tabs defaultValue="info" className="min-w-0">
            <TabsList className="flex-wrap">
              <TabsTrigger value="info">Info · {formatCost(reel.cost)}</TabsTrigger>
              <TabsTrigger value="lines">Lines</TabsTrigger>
              <TabsTrigger value="screens">{reel.style === "rpg" ? "Quests" : "Scenes"}</TabsTrigger>
              <TabsTrigger value="voice">
                <MicIcon className="size-3.5" /> الصوتيات · Voice
              </TabsTrigger>
              <TabsTrigger value="options">Options</TabsTrigger>
              <TabsTrigger value="youtube">YouTube text</TabsTrigger>
            </TabsList>
            <TabsContent value="info" className="pt-3">
              <ReelInfo reel={reel} channel={channel} />
            </TabsContent>
            <TabsContent value="lines" className="pt-3">
              <LinesEditor draft={draft} saved={reel} edit={edit} />
            </TabsContent>
            <TabsContent value="screens" className="pt-3">
              {draft.rpg && <QuestsEditor rpg={draft.rpg} onChange={(rpg) => edit({ rpg })} />}
              {draft.news && <NewsEditor reel={draft} news={draft.news} onChange={(news) => edit({ news })} onMedia={media} />}
              {draft.proof && <ProofEditor reel={draft} proof={draft.proof} onChange={(proof) => edit({ proof })} onMedia={media} />}
              {draft.kinetic && <KineticEditor reel={draft} kinetic={draft.kinetic} onChange={(kinetic) => edit({ kinetic })} onMedia={media} />}
              {draft.story && <StoryEditor reel={draft} story={draft.story} onChange={(story) => edit({ story })} onMedia={media} />}
            </TabsContent>
            <TabsContent value="voice" className="pt-3">
              <VoiceEditor
                draft={draft}
                saved={reel}
                channel={channel}
                running={running}
                edit={edit}
                onInstantSwitch={instantSwitch}
                onVoiceAction={(action) => act(action)}
              />
            </TabsContent>
            <TabsContent value="options" className="pt-3">
              <OptionsEditor reel={draft} options={draft.options ?? {}} accent={channel?.colors.accent ?? "#ff3b30"} onChange={(options) => edit({ options })} />
            </TabsContent>
            <TabsContent value="youtube" className="pt-3">
              <YoutubeEditor draft={draft} edit={edit} />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}

function YoutubeEditor({ draft, edit }: { draft: ReelState; edit: (next: Partial<ReelState>) => void }) {
  const youtube = draft.youtube ?? { title: draft.title, description: "", tags: [] };
  const set = (change: Partial<typeof youtube>) => edit({ youtube: { ...youtube, ...change } });
  return (
    <div className="grid max-w-2xl gap-3">
      <Field label="Title" detail={`${youtube.title.length} chars`}><Input dir="auto" value={youtube.title} onChange={(event) => set({ title: event.target.value })} /></Field>
      <Field label="Description"><Textarea dir="auto" rows={10} value={youtube.description} onChange={(event) => set({ description: event.target.value })} /></Field>
      <Field label="Tags" detail="comma separated"><Input dir="auto" value={youtube.tags.join(", ")} onChange={(event) => set({ tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) })} /></Field>
      {draft.sources?.length ? (
        <Field label="Sources the writer used">
          <ul className="grid gap-1 text-xs">
            {draft.sources.map((source) => (
              <li key={source}><a href={source} target="_blank" rel="noreferrer" className="break-all text-muted-foreground hover:underline">{source}</a></li>
            ))}
          </ul>
        </Field>
      ) : null}
    </div>
  );
}
