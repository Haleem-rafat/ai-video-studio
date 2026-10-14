import { CheckIcon, ClapperboardIcon, DownloadIcon, FilmIcon, Loader2Icon, RefreshCwIcon, ShieldCheckIcon, Trash2Icon, VideoOffIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api, newSceneId, sceneSeconds, type Channel, type Job, type ProjectState, type ProjectSummary, type SceneState, type StyleId } from "../api.ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Preview } from "./Preview.tsx";
import { PublishDialog } from "./PublishDialog.tsx";
import { SceneCard } from "./SceneCard.tsx";
import { ChannelSwatch, Confirm, Field } from "./shared.tsx";
import { Timeline } from "./Timeline.tsx";

type Props = {
  id: string;
  version: number;
  channels: Channel[];
  projects: ProjectSummary[];
  jobs: Job[];
  llmReady: boolean;
  onDeleted: () => void;
};

/** A button with a tooltip that still shows while the button is disabled. */
function Action({ tip, children }: { tip: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={-1}>{children}</span>
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  );
}

export function ProjectView({ id, version, channels, projects, jobs, llmReady, onDeleted }: Props) {
  const [project, setProject] = useState<ProjectState | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<"preview" | "video">("preview");
  const [nonce, setNonce] = useState(0);
  const [time, setTime] = useState(0);
  const [seekTo, setSeekTo] = useState<{ time: number; at: number } | null>(null);
  const edits = useRef(0);
  const pendingSave = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<ProjectState | null>(null);
  const cards = useRef(new Map<string, HTMLDivElement>());

  const busy = jobs.some((job) => job.status === "running" || job.status === "queued");
  const channel = channels.find((candidate) => candidate.id === project?.channel);

  // Reload after any job on this project finishes; rebuilt files mean a fresh preview frame.
  useEffect(() => {
    api.project(id).then((loaded) => {
      setProject(loaded);
      latest.current = loaded;
      setNonce((value) => value + 1);
    }, (failure) => setError(String(failure)));
  }, [id, version]);

  const save = useCallback(async () => {
    if (pendingSave.current) clearTimeout(pendingSave.current);
    pendingSave.current = null;
    const current = latest.current;
    if (!current) return;

    const editAtSend = edits.current;
    setSaving(true);
    try {
      const saved = await api.save(id, { title: current.title, description: current.description, tags: current.tags, style: current.style ?? "motion", scenes: current.scenes });
      // Only take the server's copy if nothing was typed while it was saving.
      if (edits.current === editAtSend) {
        setProject(saved);
        latest.current = saved;
      }
      setError("");
    } catch (failure) {
      setError(`Not saved: ${failure instanceof Error ? failure.message : failure}`);
    } finally {
      setSaving(false);
    }
  }, [id]);

  const edit = useCallback(
    (change: (project: ProjectState) => ProjectState) => {
      if (!latest.current) return;
      const next = change(latest.current);
      latest.current = next;
      edits.current++;
      setProject(next);
      if (pendingSave.current) clearTimeout(pendingSave.current);
      pendingSave.current = setTimeout(save, 600);
    },
    [save],
  );

  const updateScene = (scene: SceneState) => edit((current) => ({ ...current, scenes: current.scenes.map((candidate) => (candidate.id === scene.id ? scene : candidate)) }));

  const moveScene = (from: number, to: number) =>
    edit((current) => {
      const scenes = [...current.scenes];
      const [moved] = scenes.splice(from, 1);
      scenes.splice(to, 0, moved);
      return { ...current, scenes };
    });

  const addAfter = (index: number) => {
    const scene: SceneState = { id: newSceneId(), narration: "", visual: { type: "title", headline: "" }, imagePrompt: "", voiceCurrent: false, imageCurrent: true };
    edit((current) => ({ ...current, scenes: [...current.scenes.slice(0, index + 1), scene, ...current.scenes.slice(index + 1)] }));
    setSelected(scene.id);
  };

  const runJob = async (start: () => Promise<Job>) => {
    await save();
    try {
      await start();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };

  const { starts, lengths } = useMemo(() => {
    const lengths = (project?.scenes ?? []).map(sceneSeconds);
    let cursor = 0;
    const starts = lengths.map((length) => {
      const start = cursor;
      cursor += length;
      return start;
    });
    return { starts, lengths };
  }, [project?.scenes]);

  // Follow the playhead: the scene being played becomes the selected one.
  const onTime = useCallback((t: number) => setTime(t), []);
  const playingIndex = starts.findIndex((start, index) => time >= start && time < start + lengths[index]);

  const selectScene = (sceneId: string, start?: number) => {
    setSelected(sceneId);
    cards.current.get(sceneId)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    if (start !== undefined) setSeekTo({ time: start + 0.05, at: Date.now() });
  };

  if (!project) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
        {error || (
          <>
            <Loader2Icon className="size-4 animate-spin" /> Loading project…
          </>
        )}
      </div>
    );
  }

  const stale = project.scenes.filter((scene) => !scene.voiceCurrent || (scene.imagePrompt && !scene.imageCurrent)).length;
  const voiceChars = project.scenes.filter((scene) => !scene.voiceCurrent).reduce((sum, scene) => sum + scene.narration.length, 0);
  const running = jobs.find((job) => job.status === "running");
  const renderBlocked = busy || stale > 0 || !project.hasComposition;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-start gap-3 border-b px-4 py-3">
        <div className="grid min-w-0 flex-1 gap-1.5">
          <Input
            aria-label="Video title"
            className="h-8 border-transparent bg-transparent px-1.5 text-base font-semibold shadow-none hover:border-input focus-visible:border-ring dark:bg-transparent"
            value={project.title}
            onChange={(event) => edit((current) => ({ ...current, title: event.target.value }))}
          />
          <div className="flex min-w-0 flex-wrap items-center gap-2 px-1.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5 text-foreground">
              <ChannelSwatch color={channel?.colors.accent} />
              {channel?.name}
            </span>
            <Badge variant="outline">{project.format === "short" ? "Short · 9:16" : "Long · 16:9"}</Badge>
            <Select value={project.style ?? "motion"} disabled={busy} onValueChange={(style) => edit((current) => ({ ...current, style: style as StyleId }))}>
              <SelectTrigger size="sm" className="h-6 gap-1 rounded-4xl px-2 text-xs" aria-label="Look">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="motion">Motion graphics</SelectItem>
                <SelectItem value="whiteboard">Whiteboard</SelectItem>
                <SelectItem value="explainer">Explainer</SelectItem>
              </SelectContent>
            </Select>
            {project.topic.trim().toLowerCase() !== project.title.trim().toLowerCase() && (
              <span className="min-w-0 max-w-md truncate" title={project.topic}>
                {project.topic}
              </span>
            )}
            <span className="flex items-center gap-1">
              {saving ? <Loader2Icon className="size-3 animate-spin" /> : <CheckIcon className="size-3" />}
              {saving ? "Saving" : "Saved"}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Action tip={llmReady ? "Bonsai re-checks every claim, date and number" : "Start Bonsai first"}>
            <Button variant="outline" disabled={busy || !llmReady} onClick={() => runJob(() => api.factCheck(id))}>
              <ShieldCheckIcon /> Fact-check
            </Button>
          </Action>
          <Action tip={voiceChars ? `Voices changed scenes (about ${voiceChars.toLocaleString()} ElevenLabs characters) and draws changed pictures` : "Rebuild the preview"}>
            <Button variant={stale ? "default" : "outline"} disabled={busy} onClick={() => runJob(() => api.build(id, true))}>
              <RefreshCwIcon className={busy ? "animate-spin" : undefined} /> Update preview
              {stale > 0 && <span className="ml-0.5 rounded-sm bg-primary-foreground/20 px-1 font-mono text-[11px] tabular-nums">{stale}</span>}
            </Button>
          </Action>
          <Action tip={stale ? "Update the preview first" : "A fast, lower-quality mp4 to check timing"}>
            <Button variant="outline" disabled={renderBlocked} onClick={() => runJob(() => api.render(id, "draft")).then(() => setTab("video"))}>
              <FilmIcon /> Quick render
            </Button>
          </Action>
          <Action tip={stale ? "Update the preview first" : "The upload-quality mp4"}>
            <Button variant={stale ? "outline" : "default"} disabled={renderBlocked} onClick={() => runJob(() => api.render(id, "high")).then(() => setTab("video"))}>
              <ClapperboardIcon /> Final render
            </Button>
          </Action>
          <PublishDialog project={project} channel={channel} projects={projects} busy={busy} run={runJob} />
          <Confirm
            trigger={
              <Button variant="ghost" size="icon" disabled={busy} aria-label="Move project to trash">
                <Trash2Icon />
              </Button>
            }
            title="Move this project to the trash?"
            description={`"${project.title}" moves to the trash folder with its audio, pictures and video.`}
            action="Move to trash"
            onConfirm={async () => {
              await api.remove(id);
              onDeleted();
            }}
          />
        </div>
      </div>

      {running && (
        <div className="flex items-center gap-2 border-b bg-muted/50 px-4 py-1.5 text-xs">
          <Loader2Icon className="size-3.5 shrink-0 animate-spin" />
          <span className="font-medium">{running.label}</span>
          <span className="min-w-0 truncate font-mono text-muted-foreground">{running.log.at(-1) ?? "starting…"}</span>
        </div>
      )}
      {error && <div className="border-b bg-destructive/10 px-4 py-1.5 text-xs text-destructive">{error}</div>}

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(340px,40%)]">
        <div className="min-h-0 overflow-y-auto">
          <div className="grid gap-3 p-4">
            {project.scenes.map((scene, index) => (
              <SceneCard
                key={scene.id}
                ref={(element) => {
                  if (element) cards.current.set(scene.id, element);
                  else cards.current.delete(scene.id);
                }}
                projectId={id}
                format={project.format}
                square={project.style === "whiteboard"}
                scene={scene}
                index={index}
                start={starts[index]}
                seconds={lengths[index]}
                selected={selected === scene.id || (selected === null && index === playingIndex)}
                isFirst={index === 0}
                isLast={index === project.scenes.length - 1}
                canDelete={project.scenes.length > 1}
                onSelect={() => selectScene(scene.id, starts[index])}
                onChange={updateScene}
                onMove={(delta) => moveScene(index, index + delta)}
                onAddAfter={() => addAfter(index)}
                onDelete={() => edit((current) => ({ ...current, scenes: current.scenes.filter((candidate) => candidate.id !== scene.id) }))}
              />
            ))}

            <div className="grid gap-3 rounded-xl border bg-card p-4">
              <div className="text-sm font-medium">YouTube details</div>
              <Field label="Description">
                <Textarea rows={3} value={project.description} onChange={(event) => edit((current) => ({ ...current, description: event.target.value }))} />
              </Field>
              <Field label="Tags" detail="comma separated">
                <Input
                  value={project.tags.join(", ")}
                  onChange={(event) => edit((current) => ({ ...current, tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) }))}
                />
              </Field>
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-col border-t lg:border-t-0 lg:border-l">
          <Tabs value={tab} onValueChange={(value) => setTab(value as "preview" | "video")} className="flex min-h-0 flex-1 flex-col gap-0">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <TabsList>
                <TabsTrigger value="preview">Live preview</TabsTrigger>
                <TabsTrigger value="video">Rendered video</TabsTrigger>
              </TabsList>
              {tab === "video" && project.hasVideo && (
                <Button variant="ghost" size="sm" asChild>
                  <a href={`/files/${id}/video.mp4`} download={`${project.title}.mp4`}>
                    <DownloadIcon /> Download
                  </a>
                </Button>
              )}
            </div>
            <TabsContent value="preview" className="flex min-h-0 flex-1 flex-col">
              {stale > 0 && project.hasComposition && (
                <div className="border-b px-3 py-1.5 text-xs text-muted-foreground">
                  {stale} scene{stale === 1 ? "" : "s"} changed since the last preview. Update the preview to hear and see them.
                </div>
              )}
              <Preview projectId={id} format={project.format} nonce={nonce} available={project.hasComposition} seekTo={seekTo} onTime={onTime} />
            </TabsContent>
            <TabsContent value="video" className="flex min-h-0 flex-1 flex-col">
              {project.hasVideo && project.render ? (
                <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
                  <video key={project.render.renderedAt} controls className="min-h-0 flex-1 rounded-lg bg-black" src={`/files/${id}/video.mp4?v=${encodeURIComponent(project.render.renderedAt)}`} />
                  <div className="font-mono text-[11px] text-muted-foreground tabular-nums">
                    {project.render.seconds.toFixed(1)}s · rendered {new Date(project.render.renderedAt).toLocaleString()}
                  </div>
                </div>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
                  <VideoOffIcon className="size-5" />
                  No rendered video yet. Quick render makes a draft; Final render makes the upload version.
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <Timeline
        projectId={id}
        scenes={project.scenes}
        starts={starts}
        lengths={lengths}
        time={time}
        selected={selected}
        onSelect={selectScene}
        onSeek={(seconds) => setSeekTo({ time: seconds, at: Date.now() })}
        onReorder={moveScene}
      />
    </div>
  );
}
