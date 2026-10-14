import { AppWindowIcon, CheckIcon, LayersIcon, LightbulbIcon, Loader2Icon, MonitorIcon, PenLineIcon, SmartphoneIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { api, type Channel, type FormatId, type Job, type StyleId, type TopicIdea } from "../api.ts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ChannelSwatch, Field } from "./shared.tsx";

type Props = { channels: Channel[]; llmReady: boolean; jobs: Job[] };

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
  const [format, setFormat] = useState<FormatId>("short");
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

  const writing = jobs.find((candidate) => candidate.label.startsWith("Write script") && (candidate.status === "running" || candidate.status === "queued"));
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
            <div role="radiogroup" aria-label="Format" className="grid gap-2 sm:grid-cols-2">
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
            </div>
            <div role="radiogroup" aria-label="Look" className="grid gap-2 sm:grid-cols-3">
              <Choice active={style === "motion"} onClick={() => setStyle("motion")}>
                <LayersIcon className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium">Motion graphics</span>
                <span className="text-xs text-muted-foreground">Full-frame pictures, animated numbers and captions.</span>
              </Choice>
              <Choice active={style === "whiteboard"} onClick={() => setStyle("whiteboard")}>
                <PenLineIcon className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium">Whiteboard</span>
                <span className="text-xs text-muted-foreground">A hand draws each picture and writes the key words. About $0.025 a picture.</span>
              </Choice>
              <Choice active={style === "explainer"} onClick={() => setStyle("explainer")}>
                <AppWindowIcon className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium">Explainer</span>
                <span className="text-xs text-muted-foreground">A {channels.find((option) => option.id === channel)?.device ?? "phone"} on cream, each scene as an app screen, with karaoke captions. No pictures to pay for.</span>
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
                  const started = await run(() => api.topics(channel, format, focus));
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
              <Textarea rows={3} placeholder="e.g. How Isaac Newton lost a fortune in the South Sea Bubble" value={topic} onChange={(event) => setTopic(event.target.value)} />
            </Field>

            <div className="flex items-center justify-between gap-3 border-t pt-4">
              <p className="text-xs text-muted-foreground">
                {!llmReady
                  ? "Start Bonsai from the sidebar first."
                  : format === "long"
                    ? "A long script takes Bonsai about 30–40 minutes: outline, chapters and fact-checks."
                    : "The project opens here as soon as the script is written and fact-checked."}
              </p>
              <Button disabled={!llmReady || !topic.trim() || Boolean(writing)} onClick={() => run(() => api.create(channel, format, topic, style))}>
                {writing ? <Loader2Icon className="animate-spin" /> : <PenLineIcon />}
                {writing ? "Writing script…" : "Write script"}
              </Button>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
