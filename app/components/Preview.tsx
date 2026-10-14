import { useEffect, useRef, useState } from "react";

import { MonitorPlayIcon, PauseIcon, PlayIcon } from "lucide-react";

import { formatTime, type FormatId } from "../api.ts";
import { Button } from "@/components/ui/button";

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
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
        <MonitorPlayIcon className="size-5" />
        Update the preview to voice the scenes, draw the pictures and play the video here.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg bg-neutral-950" ref={box}>
        <div className="overflow-hidden" style={{ width: width * scale, height: height * scale }}>
          <iframe
            ref={frame}
            key={nonce}
            title="preview"
            src={`/files/${projectId}/index.html?preview&v=${nonce}`}
            className="origin-top-left border-0"
            style={{ width, height, transform: `scale(${scale})` }}
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon-sm" onClick={() => send({ type: playing ? "pause" : "play" })} aria-label={playing ? "Pause" : "Play"}>
          {playing ? <PauseIcon /> : <PlayIcon />}
        </Button>
        <input
          className="scrubber h-1 flex-1 cursor-pointer"
          aria-label="Seek"
          type="range"
          min={0}
          max={duration || 1}
          step={0.01}
          value={time}
          onChange={(event) => send({ type: "seek", time: Number(event.target.value) })}
        />
        <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
          {formatTime(time)} / {formatTime(duration)}
        </span>
      </div>
    </div>
  );
}
