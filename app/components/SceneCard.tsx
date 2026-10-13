import { forwardRef } from "react";

import { formatTime, type SceneState } from "../api.ts";
import { VisualEditor } from "./VisualEditor.tsx";

type Props = {
  projectId: string;
  scene: SceneState;
  index: number;
  start: number;
  seconds: number;
  selected: boolean;
  isFirst: boolean;
  isLast: boolean;
  onSelect: () => void;
  onChange: (scene: SceneState) => void;
  onMove: (delta: number) => void;
  onAddAfter: () => void;
  onDelete: () => void;
};

export const SceneCard = forwardRef<HTMLDivElement, Props>(function SceneCard(props, ref) {
  const { projectId, scene, index, start, seconds, selected } = props;
  const words = scene.narration.split(/\s+/).filter(Boolean).length;
  const voiceStale = !scene.voiceCurrent || scene.audio?.text !== scene.narration;
  const imageStale = Boolean(scene.imagePrompt) && (!scene.imageCurrent || scene.image?.prompt !== scene.imagePrompt || (scene.image?.seed ?? 0) !== (scene.imageSeed ?? 0));

  return (
    <div ref={ref} className={`scene-card ${selected ? "selected" : ""}`} onClick={props.onSelect}>
      <div className="scene-head">
        <span className="scene-number">{index + 1}</span>
        <span className="scene-time">
          {formatTime(start)} · {seconds.toFixed(1)}s
        </span>
        {voiceStale && <span className="badge warn">🎙 needs voice</span>}
        {imageStale && <span className="badge warn">🖼 needs picture</span>}
        <span className="scene-tools" onClick={(event) => event.stopPropagation()}>
          <button title="Move up" disabled={props.isFirst} onClick={() => props.onMove(-1)}>
            ↑
          </button>
          <button title="Move down" disabled={props.isLast} onClick={() => props.onMove(1)}>
            ↓
          </button>
          <button title="Add a scene after this one" onClick={props.onAddAfter}>
            ＋
          </button>
          <button title="Delete scene" className="danger" onClick={props.onDelete}>
            🗑
          </button>
        </span>
      </div>

      <div className="scene-body">
        <div className="scene-thumb">
          {scene.image ? <img src={`/files/${projectId}/${scene.image.path}`} alt="" className={imageStale ? "stale" : ""} /> : <div className="no-image">no picture</div>}
          <button
            title="Draw a different picture"
            onClick={(event) => {
              event.stopPropagation();
              props.onChange({ ...scene, imageSeed: (scene.imageSeed ?? 0) + 1 });
            }}
          >
            🎲 Redraw
          </button>
        </div>

        <div className="scene-fields">
          <label className="field wide">
            <span>
              Narration <em>{words} words</em>
            </span>
            <textarea rows={3} value={scene.narration} onChange={(event) => props.onChange({ ...scene, narration: event.target.value })} />
          </label>
          {scene.audio && !voiceStale && <audio className="scene-audio" controls preload="none" src={`/files/${projectId}/${scene.audio.path}`} />}
          <VisualEditor visual={scene.visual} onChange={(visual) => props.onChange({ ...scene, visual })} />
          <label className="field wide">
            <span>Background picture</span>
            <textarea rows={2} value={scene.imagePrompt} placeholder="Empty = no picture" onChange={(event) => props.onChange({ ...scene, imagePrompt: event.target.value })} />
          </label>
        </div>
      </div>
    </div>
  );
});
