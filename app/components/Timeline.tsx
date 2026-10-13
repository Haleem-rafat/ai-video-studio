import { useRef, useState } from "react";

import { formatTime, type SceneState } from "../api.ts";

type Props = {
  projectId: string;
  scenes: SceneState[];
  starts: number[];
  lengths: number[];
  time: number;
  selected: string | null;
  onSelect: (id: string, start: number) => void;
  onSeek: (time: number) => void;
  onReorder: (from: number, to: number) => void;
};

const ICON: Record<string, string> = { title: "T", chapter: "§", stat: "#", compare: "⇄", chart: "▥", list: "☰", quote: "❝", code: "</>" };

export function Timeline({ projectId, scenes, starts, lengths, time, selected, onSelect, onSeek, onReorder }: Props) {
  const total = lengths.reduce((sum, length) => sum + length, 0) || 1;
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState<number | null>(null);
  const track = useRef<HTMLDivElement>(null);
  const tickEvery = total / zoom > 240 ? 30 : total / zoom > 60 ? 10 : 5;

  const seekFromClick = (event: React.MouseEvent) => {
    const rect = track.current!.getBoundingClientRect();
    onSeek(Math.max(0, Math.min(total, ((event.clientX - rect.left) / rect.width) * total)));
  };

  return (
    <div className="timeline">
      <div className="timeline-head">
        <span>Timeline · {formatTime(total)} · {scenes.length} scenes · drag scenes to reorder</span>
        <span className="zoom">
          <button onClick={() => setZoom(Math.max(1, zoom / 1.5))}>−</button>
          <button onClick={() => setZoom(Math.min(12, zoom * 1.5))}>＋</button>
        </span>
      </div>
      <div className="timeline-scroll">
        <div className="timeline-inner" ref={track} style={{ width: `${zoom * 100}%` }}>
          <div className="ruler" onClick={seekFromClick}>
            {Array.from({ length: Math.floor(total / tickEvery) + 1 }, (_unused, index) => (
              <span key={index} style={{ left: `${((index * tickEvery) / total) * 100}%` }}>
                {formatTime(index * tickEvery)}
              </span>
            ))}
          </div>
          <div className="track video-track">
            {scenes.map((scene, index) => (
              <div
                key={scene.id}
                className={`clip-block ${selected === scene.id ? "selected" : ""} ${dragging === index ? "dragging" : ""}`}
                style={{ width: `${(lengths[index] / total) * 100}%`, backgroundImage: scene.image ? `url(/files/${projectId}/${scene.image.path})` : undefined }}
                draggable
                onDragStart={() => setDragging(index)}
                onDragEnd={() => setDragging(null)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (dragging !== null && dragging !== index) onReorder(dragging, index);
                  setDragging(null);
                }}
                onClick={() => onSelect(scene.id, starts[index])}
                title={scene.narration}
              >
                <span className="clip-label">
                  <b>{index + 1}</b> {ICON[scene.visual.type]}
                </span>
              </div>
            ))}
          </div>
          <div className="track caption-track">
            {scenes.map((scene, index) => (
              <div key={scene.id} className={`caption-block ${!scene.voiceCurrent ? "stale" : ""}`} style={{ width: `${(lengths[index] / total) * 100}%` }} onClick={() => onSelect(scene.id, starts[index])}>
                {scene.narration}
              </div>
            ))}
          </div>
          <div className="playhead" style={{ left: `${(Math.min(time, total) / total) * 100}%` }} />
        </div>
      </div>
    </div>
  );
}
