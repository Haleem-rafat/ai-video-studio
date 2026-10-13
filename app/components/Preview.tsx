import { useEffect, useRef, useState } from "react";

import { formatTime, type FormatId } from "../api.ts";

type Props = {
  projectId: string;
  format: FormatId;
  /** Changes whenever index.html is rebuilt, to reload the frame. */
  nonce: number;
  available: boolean;
  seekTo: { time: number; at: number } | null;
  onTime: (time: number) => void;
};

/**
 * Plays the HyperFrames composition live in an iframe. The server injects a
 * small runtime into it that shows the right scene for each moment and plays
 * the narration, so edits can be checked without rendering an mp4.
 */
export function Preview({ projectId, format, nonce, available, seekTo, onTime }: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [scale, setScale] = useState(0.3);
  const [width, height] = format === "short" ? [1080, 1920] : [1920, 1080];

  const send = (message: object) => frame.current?.contentWindow?.postMessage(message, "*");

  useEffect(() => {
    const listen = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.data?.type !== "preview-time") return;
      setTime(event.data.time);
      setDuration(event.data.duration);
      setPlaying(event.data.playing);
      onTime(event.data.time);
    };
    window.addEventListener("message", listen);
    return () => window.removeEventListener("message", listen);
  }, [onTime]);

  // Fit the full-size composition into whatever space the panel has.
  useEffect(() => {
    if (!box.current) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width: boxWidth, height: boxHeight } = entry.contentRect;
      setScale(Math.min(boxWidth / width, boxHeight / height));
    });
    observer.observe(box.current);
    return () => observer.disconnect();
  }, [width, height]);

  useEffect(() => {
    if (seekTo) send({ type: "seek", time: seekTo.time });
  }, [seekTo]);

  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.code !== "Space" || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      event.preventDefault();
      send({ type: playing ? "pause" : "play" });
    };
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  }, [playing]);

  if (!available) {
    return <div className="preview-empty">Click “Update preview” to voice the scenes, draw the pictures and build the preview.</div>;
  }

  return (
    <div className="preview">
      <div className="preview-stage" ref={box}>
        <div className="preview-scaler" style={{ width: width * scale, height: height * scale }}>
          <iframe
            ref={frame}
            key={nonce}
            title="preview"
            src={`/files/${projectId}/index.html?preview&v=${nonce}`}
            style={{ width, height, transform: `scale(${scale})` }}
          />
        </div>
      </div>
      <div className="preview-controls">
        <button className="play" onClick={() => send({ type: playing ? "pause" : "play" })}>
          {playing ? "❚❚" : "▶"}
        </button>
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.01}
          value={time}
          onChange={(event) => send({ type: "seek", time: Number(event.target.value) })}
        />
        <span className="time">
          {formatTime(time)} / {formatTime(duration)}
        </span>
      </div>
    </div>
  );
}
