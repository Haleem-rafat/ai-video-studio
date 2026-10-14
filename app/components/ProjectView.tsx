import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api, newSceneId, sceneSeconds, type Channel, type Job, type ProjectState, type SceneState, type StyleId } from "../api.ts";
import { Preview } from "./Preview.tsx";
import { SceneCard } from "./SceneCard.tsx";
import { Timeline } from "./Timeline.tsx";

type Props = {
  id: string;
  version: number;
  channels: Channel[];
  jobs: Job[];
  llmReady: boolean;
  onDeleted: () => void;
};

export function ProjectView({ id, version, channels, jobs, llmReady, onDeleted }: Props) {
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

  if (!project) return <div className="loading">{error || "Loading…"}</div>;

  const stale = project.scenes.filter((scene) => !scene.voiceCurrent || (scene.imagePrompt && !scene.imageCurrent)).length;
  const voiceChars = project.scenes.filter((scene) => !scene.voiceCurrent).reduce((sum, scene) => sum + scene.narration.length, 0);
  const running = jobs.find((job) => job.status === "running");

  return (
    <div className="project">
      <div className="project-header">
        <div className="project-titles">
          <input className="title-input" value={project.title} onChange={(event) => edit((current) => ({ ...current, title: event.target.value }))} />
          <div className="project-sub">
            <span style={{ color: channel?.colors.accent }}>{channel?.name}</span> · {project.format === "short" ? "Short 9:16" : "Long 16:9"} ·{" "}
            <select
              className="style-select"
              value={project.style ?? "motion"}
              disabled={busy}
              title="Switching redraws every picture in the new look on the next Update preview"
              onChange={(event) => {
                const style = event.target.value as StyleId;
                edit((current) => ({ ...current, style }));
              }}
            >
              <option value="motion">🎨 Motion graphics</option>
              <option value="whiteboard">✏️ Whiteboard</option>
            </select>{" "}
            · {project.topic}
            {saving ? <span className="saving"> · saving…</span> : <span className="saved"> · saved</span>}
          </div>
        </div>
        <div className="project-actions">
          <button disabled={busy || !llmReady} title={llmReady ? "Bonsai re-checks every claim" : "Start Bonsai first"} onClick={() => runJob(() => api.factCheck(id))}>
            ✅ Fact-check
          </button>
          <button className={stale ? "primary" : ""} disabled={busy} onClick={() => runJob(() => api.build(id, true))} title={voiceChars ? `Uses about ${voiceChars} ElevenLabs characters` : "Rebuild the preview"}>
            🔄 Update preview{stale ? ` (${stale})` : ""}
          </button>
          <button disabled={busy || stale > 0 || !project.hasComposition} title={stale ? "Update the preview first" : ""} onClick={() => runJob(() => api.render(id, "draft")).then(() => setTab("video"))}>
            🎞 Quick render
          </button>
          <button className="primary" disabled={busy || stale > 0 || !project.hasComposition} onClick={() => runJob(() => api.render(id, "high")).then(() => setTab("video"))}>
            🎬 Final render
          </button>
          <button
            className="danger"
            disabled={busy}
            onClick={async () => {
              if (!confirm(`Move "${project.title}" to the trash folder?`)) return;
              await api.remove(id);
              onDeleted();
            }}
          >
            🗑
          </button>
        </div>
      </div>
      {running && (
        <div className="running-bar">
          ⚙️ {running.label}: {running.log.at(-1) ?? "starting…"}
        </div>
      )}
      {error && <div className="error">{error}</div>}

      <div className="project-body">
        <div className="scene-list">
          {project.scenes.map((scene, index) => (
            <SceneCard
              key={scene.id}
              ref={(element) => {
                if (element) cards.current.set(scene.id, element);
                else cards.current.delete(scene.id);
              }}
              projectId={id}
              scene={scene}
              index={index}
              start={starts[index]}
              seconds={lengths[index]}
              selected={selected === scene.id || (selected === null && index === playingIndex)}
              isFirst={index === 0}
              isLast={index === project.scenes.length - 1}
              onSelect={() => selectScene(scene.id, starts[index])}
              onChange={updateScene}
              onMove={(delta) => moveScene(index, index + delta)}
              onAddAfter={() => addAfter(index)}
              onDelete={() => {
                if (project.scenes.length > 1 && confirm(`Delete scene ${index + 1}?`)) edit((current) => ({ ...current, scenes: current.scenes.filter((candidate) => candidate.id !== scene.id) }));
              }}
            />
          ))}
          <div className="meta-card">
            <label className="field wide">
              <span>YouTube description</span>
              <textarea rows={3} value={project.description} onChange={(event) => edit((current) => ({ ...current, description: event.target.value }))} />
            </label>
            <label className="field wide">
              <span>Tags (comma separated)</span>
              <input
                value={project.tags.join(", ")}
                onChange={(event) => edit((current) => ({ ...current, tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) }))}
              />
            </label>
          </div>
        </div>

        <div className="side-panel">
          <div className="tabs">
            <button className={tab === "preview" ? "active" : ""} onClick={() => setTab("preview")}>
              Live preview
            </button>
            <button className={tab === "video" ? "active" : ""} onClick={() => setTab("video")}>
              Rendered video
            </button>
          </div>
          {tab === "preview" ? (
            <>
              {stale > 0 && project.hasComposition && <div className="stale-note">{stale} scene(s) changed since the last preview. Click “Update preview”.</div>}
              <Preview projectId={id} format={project.format} nonce={nonce} available={project.hasComposition} seekTo={seekTo} onTime={onTime} />
            </>
          ) : project.hasVideo && project.render ? (
            <div className="video-tab">
              <video key={project.render.renderedAt} controls src={`/files/${id}/video.mp4?v=${encodeURIComponent(project.render.renderedAt)}`} />
              <div className="video-meta">
                {project.render.seconds.toFixed(1)}s · rendered {new Date(project.render.renderedAt).toLocaleString()} ·{" "}
                <a href={`/files/${id}/video.mp4`} download={`${project.title}.mp4`}>
                  Download
                </a>
              </div>
            </div>
          ) : (
            <div className="preview-empty">No rendered video yet. Use “Quick render” or “Final render”.</div>
          )}
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
