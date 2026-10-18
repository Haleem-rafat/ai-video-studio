import { AppWindowIcon, CheckIcon, Columns2Icon, MicroscopeIcon, SwordsIcon, ShapesIcon, LayersIcon, LightbulbIcon, Loader2Icon, MonitorIcon, PenLineIcon, SmartphoneIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { api, type Channel, type FormatId, type Job, type StyleId, type TopicIdea } from "../api.ts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ChannelSwatch, Field } from "./shared.tsx";
import { JobProgress } from "./JobProgress.tsx";

type Props = { channels: Channel[]; llmReady: boolean; jobs: Job[] };

/** A short silent loop of a real video made in this look, so the choice shows rather than tells. */
export function ModeClip({ mode }: { mode: string }) {
  return <video src={`/modes/${mode}.mp4`} autoPlay muted loop playsInline preload="metadata" className="mb-1.5 aspect-video w-full rounded-md border bg-black object-cover" />;
}

/** A selectable card in a group; behaves as a radio button. */
function Choice({ active, onClick, children, className }: { active: boolean; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "relative flex flex-col items-start gap-1 rounded-lg border bg-card p-3 text-left transition-colors outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50",
        active && "border-foreground/80 bg-muted/40 ring-1 ring-foreground/80",
        className,
      )}
    >
      {active && <CheckIcon className="absolute top-2.5 right-2.5 size-3.5" />}
      {children}
    </button>
  );
}

export function NewVideo({ channels, llmReady, jobs }: Props) {
  const [channel, setChannel] = useState("");
  const [format, setFormat] = useState<FormatId | "both">("both");
  const [style, setStyle] = useState<StyleId>("motion");
  const [topic, setTopic] = useState("");
  const [focus, setFocus] = useState("");
  const [ideasJob, setIdeasJob] = useState<string | null>(null);
  const [ideas, setIdeas] = useState<TopicIdea[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!channel && channels[0]) setChannel(channels[0].id);
  }, [channels, channel]);

  const job = jobs.find((candidate) => candidate.id === ideasJob);
  useEffect(() => {
    if (job?.status === "done" && Array.isArray(job.result)) setIdeas(job.result as TopicIdea[]);
    if (job?.status === "failed") setError(job.error ?? "Topic ideas failed.");
  }, [job?.status, job?.result, job?.error]);

  const scriptJobs = jobs.filter((candidate) => candidate.label.startsWith("Write script") && !candidate.label.includes("marketing") && (candidate.status === "running" || candidate.status === "queued"));
  const writing = scriptJobs[0];
  const thinking = job?.status === "running" || job?.status === "queued";

  const run = async (action: () => Promise<Job>) => {
    setError("");
    try {
      return await action();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto grid max-w-3xl gap-6 px-6 py-8">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">New video</h1>
          <p className="text-sm text-muted-foreground">Bonsai writes and fact-checks the script, ElevenLabs narrates it, FLUX draws the pictures and HyperFrames renders it.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Channel</CardTitle>
            <CardDescription>Sets the audience, tone, voice and picture style.</CardDescription>
          </CardHeader>
          <CardContent>
            <div role="radiogroup" aria-label="Channel" className="grid gap-2 sm:grid-cols-3">
              {channels.map((option) => (
                <Choice key={option.id} active={channel === option.id} onClick={() => setChannel(option.id)}>
                  <span className="flex items-center gap-2 pr-5 text-sm font-medium">
                    <ChannelSwatch color={option.colors.accent} />
                    {option.name}
                  </span>
                  <span className="line-clamp-2 text-xs text-muted-foreground">{option.audience}</span>
                </Choice>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Format and look</CardTitle>
            <CardDescription>The look can be changed later on the project screen.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div role="radiogroup" aria-label="Format" className="grid gap-2 sm:grid-cols-3">
              <Choice active={format === "short"} onClick={() => setFormat("short")}>
                <SmartphoneIcon className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium">Short</span>
                <span className="text-xs text-muted-foreground">9:16 · about 70 seconds</span>
              </Choice>
              <Choice active={format === "long"} onClick={() => setFormat("long")}>
                <MonitorIcon className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium">Long</span>
                <span className="text-xs text-muted-foreground">16:9 · about 8 minutes</span>
              </Choice>
              <Choice active={format === "both"} onClick={() => setFormat("both")}>
                <Columns2Icon className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium">Both</span>
                <span className="text-xs text-muted-foreground">A long video and a Short, each written for its shape</span>
              </Choice>
            </div>
            <div role="radiogroup" aria-label="Look" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <Choice active={style === "motion"} onClick={() => setStyle("motion")}>
                <ModeClip mode="motion" />
                <LayersIcon className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium">Motion graphics</span>
                <span className="text-xs text-muted-foreground">Full-frame pictures, animated numbers and captions.</span>
              </Choice>
              <Choice active={style === "whiteboard"} onClick={() => setStyle("whiteboard")}>
                <ModeClip mode="whiteboard" />
                <PenLineIcon className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium">Whiteboard</span>
                <span className="text-xs text-muted-foreground">A hand draws each picture and writes the key words. About $0.025 a picture.</span>
              </Choice>
              <Choice active={style === "explainer"} onClick={() => setStyle("explainer")}>
                <ModeClip mode="explainer" />
                <AppWindowIcon className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium">Explainer</span>
                <span className="text-xs text-muted-foreground">A {channels.find((option) => option.id === channel)?.device ?? "phone"} on cream, each scene as an app screen, with karaoke captions. No pictures to pay for.</span>
              </Choice>
              <Choice active={style === "mixed"} onClick={() => setStyle("mixed")}>
                <ModeClip mode="mixed" />
                <ShapesIcon className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium">Mixed</span>
                <span className="text-xs text-muted-foreground">Each scene picks its look: whiteboard for ideas, the device for code and steps, motion for numbers.</span>
              </Choice>
              <Choice active={style === "versus"} onClick={() => setStyle("versus")}>
                <ModeClip mode="versus" />
                <SwordsIcon className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium">Versus</span>
                <span className="text-xs text-muted-foreground">
                  Two products face off: spec tables with winners, a live score, red wipes, your character and logo, and a subscribe click. Researched on the web and written in the
                  channel's language; makes its own thumbnail and chapters. Type the topic as "A vs B".
                </span>
              </Choice>
              <Choice active={style === "arena"} onClick={() => setStyle("arena")}>
                <ModeClip mode="arena" />
                <SwordsIcon className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium">Arena</span>
                <span className="text-xs text-muted-foreground">
                  Versus as a fighting-game match: health bars drain as a product loses, a "ROUND" card and glitch cut per topic, numbers race as bars, real photos behind every round, karaoke
                  captions and a winner reveal. Add each product's press photos on the project page. Type the topic as "A vs B".
                </span>
              </Choice>
              <Choice active={style === "deepdive"} onClick={() => setStyle("deepdive")}>
                <ModeClip mode="deepdive" />
                <MicroscopeIcon className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium">Deep dive</span>
                <span className="text-xs text-muted-foreground">
                  A long explainer in the versus look: real photos from Wikimedia Commons (credited), chip maps that light up part by part, numbered steps, big numbers and tables. Researched on
                  the web; makes its own thumbnail and chapters.
                </span>
              </Choice>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Topic</CardTitle>
            <CardDescription>Type one, or ask Bonsai for ideas this channel's audience is likely to click.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex gap-2">
              <Input placeholder="Optional focus, e.g. surprising money history" value={focus} onChange={(event) => setFocus(event.target.value)} />
              <Button
                variant="outline"
                disabled={!llmReady || thinking}
                onClick={async () => {
                  setIdeas([]);
                  const started = await run(() => api.topics(channel, format === "both" ? "long" : format, focus));
                  if (started) setIdeasJob(started.id);
                }}
              >
                {thinking ? <Loader2Icon className="animate-spin" /> : <LightbulbIcon />}
                {thinking ? "Thinking…" : "Suggest topics"}
              </Button>
            </div>

            {ideas.length > 0 && (
              <div role="radiogroup" aria-label="Topic ideas" className="divide-y overflow-hidden rounded-lg border">
                {ideas.map((idea) => {
                  const active = topic === idea.topic;
                  return (
                    <button
                      key={idea.title}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setTopic(idea.topic)}
                      className={cn("flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/60", active && "bg-muted")}
                    >
                      <span className={cn("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border", active && "border-foreground bg-foreground text-background")}>
                        {active && <CheckIcon className="size-3" />}
                      </span>
                      <span className="grid gap-0.5">
                        <span className="text-sm font-medium">{idea.title}</span>
                        <span className="text-xs text-muted-foreground">{idea.why}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <Field label="What is the video about?" detail={topic.trim() ? `${topic.trim().split(/\s+/).length} words` : undefined}>
              <Textarea
                rows={3}
                placeholder={style === "deepdive" ? "e.g. How a smartphone SoC works, why it's a System on a Chip, and how chips are made" : style === "versus" || style === "arena" ? "e.g. iPhone 17 Pro Max vs iPhone 18 Pro Max (add a question after a colon: Apple M5 vs Intel x86: why is M faster?)" : "e.g. How Isaac Newton lost a fortune in the South Sea Bubble"}
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
              />
            </Field>

            <div className="flex items-center justify-between gap-3 border-t pt-4">
              <p className="text-xs text-muted-foreground">
                {style === "deepdive"
                  ? "Research and writing take 2–3 minutes, through the AI Gateway."
                  : style === "versus" || style === "arena"
                  ? /\s(vs\.?|versus|ضد|ولا|مقابل)\s/i.test(topic)
                    ? "Research and writing take about a minute, through the AI Gateway."
                    : 'Write it as "Product A vs Product B".'
                  : !llmReady
                  ? "Start Bonsai from the sidebar first."
                  : format !== "short"
                    ? "A long script takes Bonsai about 30–40 minutes: outline, chapters and fact-checks."
                    : "The project opens here as soon as the script is written and fact-checked."}
              </p>
              <Button disabled={(style !== "versus" && style !== "arena" && style !== "deepdive" && !llmReady) || !topic.trim() || Boolean(writing)} onClick={() => run(() => api.create(channel, format, topic, style))}>
                {writing ? <Loader2Icon className="animate-spin" /> : <PenLineIcon />}
                {writing ? "Writing script…" : "Write script"}
              </Button>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            {scriptJobs.map((job) => (
              <JobProgress key={job.id} job={job} />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
