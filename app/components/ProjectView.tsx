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
import { lookOf } from "../../src/render/looks.ts";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Preview } from "./Preview.tsx";
import { PublishDialog } from "./PublishDialog.tsx";
import { SceneCard } from "./SceneCard.tsx";
import { ChannelSwatch, Confirm, Field } from "./shared.tsx";
import { Timeline } from "./Timeline.tsx";
import { VersusPanel } from "./VersusPanel.tsx";
import { DeepDivePanel } from "./DeepDivePanel.tsx";
import { MarketingPanel } from "./MarketingPanel.tsx";
import { CostPanel } from "./CostPanel.tsx";
import { JobProgress } from "./JobProgress.tsx";
import { formatCost } from "../api.ts";

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
  const [tab, setTab] = useState<"preview" | "video" | "cost">("preview");
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
      const saved = await api.save(id, {
        title: current.title,
        description: current.description,
        tags: current.tags,
        style: current.style ?? "motion",
        soundtrack: current.soundtrack !== false,
        scenes: current.scenes,
        ...(current.versus ? { versus: current.versus } : {}),
        ...(current.deepdive ? { deepdive: current.deepdive } : {}),
        ...(current.marketing ? { marketing: current.marketing } : {}),
      });
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
    if (project?.timing && project.timing.starts.length === project.scenes.length) return project.timing;
    const lengths = (project?.scenes ?? []).map(sceneSeconds);
    let cursor = 0;
    const starts = lengths.map((length) => {
      const start = cursor;
      cursor += length;
      return start;
    });
    return { starts, lengths };
  }, [project?.scenes, project?.timing]);

  // Follow the playhead: the scene being played becomes the selected one.
  const onTime = useCallback((t: number) => setTime(t), []);
  const playingIndex = starts.findIndex((start, index) => time >= start && time < start + lengths[index]);

  const selectScene = (sceneId: string, start?: number) => {
    setSelected(sceneId);
    cards.current.get(sceneId)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    if (start !== undefined) setSeekTo({ time: start + 0.05, at: Date.now() });
  };

  if (!project) {
    if (error) return <div className="flex flex-1 items-center justify-center p-6 text-sm text-destructive">{error}</div>;
    // The page's own shape while it loads: header, scene cards, preview.
    return (
      <div className="flex min-h-0 flex-1 flex-col" aria-busy="true" aria-label="Loading project">
        <div className="flex items-center gap-3 border-b px-4 py-3">
          <div className="grid flex-1 gap-2">
            <Skeleton className="h-6 w-72" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-8 w-28" />
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(340px,40%)]">
          <div className="grid content-start gap-3 p-4">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-36 w-full rounded-xl" />
            ))}
          </div>
          <div className="border-l p-3">
            <Skeleton className="aspect-video w-full rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  const stale = project.scenes.filter((scene) => !scene.voiceCurrent || (scene.imagePrompt && !scene.imageCurrent)).length;
  const voiceChars = project.scenes.filter((scene) => !scene.voiceCurrent).reduce((sum, scene) => sum + scene.narration.length, 0);
  const running = jobs.find((job) => job.status === "running") ?? jobs.find((job) => job.status === "queued");
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
              <ChannelSwatch color={project.marketing?.brand.colors.accent ?? channel?.colors.accent} />
              {project.marketing?.brand.name ?? channel?.name}
            </span>
            <Badge variant="outline">{project.format === "short" ? "Short · 9:16" : "Long · 16:9"}</Badge>
            {project.style === "versus" || project.style === "deepdive" || project.style === "marketing" ? (
              <Badge variant="outline">{project.style === "versus" ? "Versus" : project.style === "marketing" ? "Marketing" : "Deep dive"}</Badge>
            ) : (
            <Select value={project.style ?? "motion"} disabled={busy} onValueChange={(style) => edit((current) => ({ ...current, style: style as StyleId }))}>
              <SelectTrigger size="sm" className="h-6 gap-1 rounded-4xl px-2 text-xs" aria-label="Look">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="motion">Motion graphics</SelectItem>
                <SelectItem value="whiteboard">Whiteboard</SelectItem>
                <SelectItem value="explainer">Explainer</SelectItem>
                <SelectItem value="mixed">Mixed</SelectItem>
              </SelectContent>
            </Select>
            )}
            <label className="flex items-center gap-1.5" title="Background music and sound effects in the rendered video">
              <Switch size="sm" checked={project.soundtrack !== false} disabled={busy} onCheckedChange={(soundtrack) => edit((current) => ({ ...current, soundtrack }))} />
              Music & sound
            </label>
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
          {project.style !== "versus" && project.style !== "deepdive" && project.style !== "marketing" && (
            <Action tip={llmReady ? "Bonsai re-checks every claim, date and number" : "Start Bonsai first"}>
              <Button variant="outline" disabled={busy || !llmReady} onClick={() => runJob(() => api.factCheck(id))}>
                <ShieldCheckIcon /> Fact-check
              </Button>
            </Action>
          )}
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
          {project.marketing ? (
            <>
              <Action tip={project.hasVideo ? "The rendered video, ready to post" : "Render it first"}>
                <Button variant="outline" disabled={!project.hasVideo} asChild={project.hasVideo}>
                  {project.hasVideo ? (
                    <a href={`/files/${id}/video.mp4`} download={`${project.marketing.brand.name}-${project.format}.mp4`}>
                      <DownloadIcon /> Video
                    </a>
                  ) : (
                    <span>
                      <DownloadIcon /> Video
                    </span>
                  )}
                </Button>
              </Action>
              <Action tip="The post's caption and hashtags">
                <Button variant="outline" disabled={!project.hasComposition} asChild={project.hasComposition}>
                  {project.hasComposition ? (
                    <a href={`/files/${id}/post.txt`} download={`${project.marketing.brand.name}-post.txt`}>
                      <DownloadIcon /> Caption
                    </a>
                  ) : (
                    <span>
                      <DownloadIcon /> Caption
                    </span>
                  )}
                </Button>
              </Action>
            </>
          ) : (
            <PublishDialog project={project} channel={channel} projects={projects} busy={busy} run={runJob} />
          )}
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
        <div className="border-b bg-card/60 px-4 py-2.5">
          <JobProgress job={running} compact />
        </div>
      )}
      {error && <div className="border-b bg-destructive/10 px-4 py-1.5 text-xs text-destructive">{error}</div>}

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(340px,40%)]">
        <div className="min-h-0 overflow-y-auto">
          <div className="grid gap-3 p-4">
            {project.versus && (
              <VersusPanel
                project={project}
                busy={busy}
                onEdit={(change) => edit((current) => ({ ...current, versus: change(current.versus!) }))}
                onUploaded={(saved) => {
                  setProject(saved);
                  latest.current = saved;
                }}
              />
            )}
            {project.marketing && <MarketingPanel project={project} busy={busy} onEdit={(change) => edit((current) => ({ ...current, marketing: change(current.marketing!) }))} />}
            {project.deepdive && (
              <DeepDivePanel
                project={project}
                busy={busy}
                onEdit={(change) => edit((current) => ({ ...current, deepdive: change(current.deepdive!) }))}
                onUploaded={(saved) => {
                  setProject(saved);
                  latest.current = saved;
                }}
              />
            )}
            {project.scenes.map((scene, index) => (
              <SceneCard
                key={scene.id}
                ref={(element) => {
                  if (element) cards.current.set(scene.id, element);
                  else cards.current.delete(scene.id);
                }}
                projectId={id}
                format={project.format}
                square={lookOf(project, scene) === "whiteboard"}
                look={project.style === "mixed" ? lookOf(project, scene) : null}
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
                busy={busy}
                onUploaded={(saved) => {
                  setProject(saved);
                  latest.current = saved;
                }}
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
          <Tabs value={tab} onValueChange={(value) => setTab(value as "preview" | "video" | "cost")} className="flex min-h-0 flex-1 flex-col gap-0">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <TabsList>
                <TabsTrigger value="preview">Live preview</TabsTrigger>
                <TabsTrigger value="video">Rendered video</TabsTrigger>
                <TabsTrigger value="cost">
                  Cost{(projects.find((p) => p.id === id)?.cost ?? 0) > 0 && <span className="ml-1 font-mono text-[11px] text-muted-foreground">{formatCost(projects.find((p) => p.id === id)!.cost)}</span>}
                </TabsTrigger>
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
            <TabsContent value="cost" className="flex min-h-0 flex-1 flex-col">
              <CostPanel projectId={id} version={version} />
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
