import { useEffect, useRef, useState } from "react";

import { ChevronLeftIcon, ChevronRightIcon, MaximizeIcon, MonitorPlayIcon, PauseIcon, PlayIcon } from "lucide-react";

import { formatTime, type FormatId } from "../api.ts";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** One frame at the 30fps HyperFrames renders. */
const FRAME = 1 / 30;
const ZOOMS = ["0.5", "0.75", "1", "1.5", "2"];

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
  const [fit, setFit] = useState(0.3);
  /** Relative to fitting the panel: 1 fits, 2 is twice that (scroll to look around). */
  const [zoom, setZoom] = useState("1");
  const scale = fit * Number(zoom);
  const stage = useRef<HTMLDivElement>(null);
  const [width, height] = format === "short" ? [1080, 1920] : [1920, 1080];

  const send = (message: object) => frame.current?.contentWindow?.postMessage(message, "*");
  // A rebuilt page reloads at the moment that was showing, so an edit is seen where it was made.
  const shown = useRef(0);
  const resumeAt = useRef(0);
  useEffect(() => {
    resumeAt.current = shown.current;
  }, [nonce]);

  useEffect(() => {
    const listen = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.data?.type !== "preview-time") return;
      setTime(event.data.time);
      shown.current = event.data.time;
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
      setFit(Math.min(boxWidth / width, boxHeight / height));
    });
    observer.observe(box.current);
    return () => observer.disconnect();
  }, [width, height]);

  useEffect(() => {
    if (seekTo) send({ type: "seek", time: seekTo.time });
  }, [seekTo]);

  const seek = (to: number) => send({ type: "seek", time: Math.max(0, Math.min(duration || to, to)) });
  const fullscreen = () => (document.fullscreenElement ? document.exitFullscreen() : stage.current?.requestFullscreen());

  // Space plays and pauses; ←/→ step a frame (with Shift, a second); J/K/L rewind, stop, play; F goes fullscreen.
  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable || event.metaKey || event.ctrlKey) return;
      const key = event.key.toLowerCase();
      const step = event.shiftKey ? 1 : FRAME;
      if (event.code === "Space") send({ type: playing ? "pause" : "play" });
      else if (event.key === "ArrowLeft") (send({ type: "pause" }), seek(time - step));
      else if (event.key === "ArrowRight") (send({ type: "pause" }), seek(time + step));
      else if (key === "j") seek(time - 5);
      else if (key === "k") send({ type: "pause" });
      else if (key === "l") send({ type: "play" });
      else if (key === "f") fullscreen();
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  }, [playing, time, duration]);

  if (!available) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
        <MonitorPlayIcon className="size-5" />
        Update the preview to voice the scenes, draw the pictures and play the video here.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-3" ref={stage}>
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg bg-neutral-950" ref={box}>
        <div className="absolute inset-0 flex overflow-auto">
        <div className="m-auto shrink-0 overflow-hidden" style={{ width: width * scale, height: height * scale }}>
          <iframe
            ref={frame}
            key={nonce}
            title="preview"
            src={`/files/${projectId}/index.html?preview&v=${nonce}`}
            onLoad={() => resumeAt.current > 0 && setTimeout(() => send({ type: "seek", time: resumeAt.current }), 300)}
            className="origin-top-left border-0"
            style={{ width, height, transform: `scale(${scale})` }}
          />
        </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon-sm" onClick={() => seek(time - FRAME)} aria-label="Previous frame" title="Previous frame (←)">
          <ChevronLeftIcon />
        </Button>
        <Button variant="outline" size="icon-sm" onClick={() => send({ type: playing ? "pause" : "play" })} aria-label={playing ? "Pause" : "Play"} title="Play / pause (Space)">
          {playing ? <PauseIcon /> : <PlayIcon />}
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={() => seek(time + FRAME)} aria-label="Next frame" title="Next frame (→)">
          <ChevronRightIcon />
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
        <Select value={zoom} onValueChange={setZoom}>
          <SelectTrigger size="sm" className="h-7 w-[84px] text-xs" aria-label="Zoom">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ZOOMS.map((value) => (
              <SelectItem key={value} value={value}>
                {value === "1" ? "Fit" : `${Number(value) * 100}%`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="icon-sm" onClick={fullscreen} aria-label="Fullscreen" title="Fullscreen (F)">
          <MaximizeIcon />
        </Button>
      </div>
    </div>
  );
}
