import { useEffect, useRef, useState } from "react";
import { LoaderCircleIcon, MaximizeIcon, MinimizeIcon, PauseIcon, PlayIcon, Volume2Icon, VolumeXIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

const clock = (seconds: number) => (Number.isFinite(seconds) ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}` : "0:00");

type Props = {
  src: string;
  /** "16x9" fills the width; "9x16" stands upright, at most `maxHeight` tall; "fill" takes the space its parent gives it. */
  shape: "16x9" | "9x16" | "fill";
  /** The second shown before it plays. */
  posterAt?: number;
  maxHeight?: string;
  className?: string;
};

/**
 * The studio's video player: click or Space to play, a seek bar, time, sound
 * and full screen. Keys: Space/K play, ←/→ 5 s, M sound, F full screen.
 */
export function VideoPlayer({ src, shape, posterAt = 1, maxHeight = "70vh", className }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [length, setLength] = useState(0);
  const [muted, setMuted] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [full, setFull] = useState(false);
  const [seeking, setSeeking] = useState<number | null>(null);
  const [idle, setIdle] = useState(false);
  const hideTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const change = () => setFull(document.fullscreenElement === box.current);
    document.addEventListener("fullscreenchange", change);
    return () => document.removeEventListener("fullscreenchange", change);
  }, []);
  // A new file starts from the beginning.
  useEffect(() => {
    setPlaying(false);
    setTime(0);
  }, [src]);

  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  };
  const seek = (to: number) => {
    if (video.current) video.current.currentTime = Math.max(0, Math.min(length || 0, to));
  };
  const fullScreen = () => (document.fullscreenElement ? document.exitFullscreen() : box.current?.requestFullscreen());
  // The controls fade away while it plays and the pointer rests.
  const wake = () => {
    setIdle(false);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setIdle(true), 2200);
  };
  const showControls = !playing || !idle || seeking !== null;

  return (
    <div
      ref={box}
      tabIndex={0}
      onMouseMove={wake}
      onMouseLeave={() => setIdle(true)}
      onKeyDown={(event) => {
        const keys: Record<string, () => void> = {
          " ": toggle,
          k: toggle,
          ArrowLeft: () => seek(time - 5),
          ArrowRight: () => seek(time + 5),
          m: () => setMuted(!muted),
          f: () => void fullScreen(),
        };
        const act = keys[event.key];
        if (!act) return;
        event.preventDefault();
        act();
        wake();
      }}
      className={cn(
        "group/player relative mx-auto overflow-hidden rounded-xl border bg-black outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        shape === "16x9" ? "aspect-video w-full" : shape === "9x16" ? "aspect-[9/16]" : "min-h-0 w-full flex-1",
        full && "flex items-center justify-center rounded-none border-0",
        !playing || !idle ? "cursor-default" : "cursor-none",
        className,
      )}
      style={shape === "9x16" && !full ? { maxHeight, height: maxHeight } : undefined}
    >
      <video
        ref={video}
        src={`${src}${src.includes("#") ? "" : `#t=${posterAt}`}`}
        muted={muted}
        playsInline
        preload="metadata"
        className="size-full object-contain"
        onClick={toggle}
        onDoubleClick={() => void fullScreen()}
        onPlay={() => {
          setPlaying(true);
          wake();
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => setLength(event.currentTarget.duration)}
        onDurationChange={(event) => setLength(event.currentTarget.duration)}
        onWaiting={() => setWaiting(true)}
        onPlaying={() => setWaiting(false)}
        onCanPlay={() => setWaiting(false)}
      />

      {!playing && (
        <button type="button" aria-label="Play" onClick={toggle} className="absolute inset-0 flex items-center justify-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform group-hover/player:scale-105">
            <PlayIcon className="ms-1 size-7 fill-current" />
          </span>
        </button>
      )}
      {waiting && playing && <LoaderCircleIcon className="pointer-events-none absolute top-1/2 left-1/2 size-10 -translate-1/2 animate-spin text-white/80" />}

      <div
        className={cn(
          "absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 pt-10 pb-2 text-white transition-opacity duration-300",
          showControls ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <Button size="icon" variant="ghost" className="size-8 text-white hover:bg-white/15 hover:text-white" aria-label={playing ? "Pause" : "Play"} onClick={toggle}>
          {playing ? <PauseIcon className="fill-current" /> : <PlayIcon className="fill-current" />}
        </Button>
        <span className="font-mono text-xs tabular-nums">{clock(seeking ?? time)}</span>
        <Slider
          aria-label="Seek"
          className="flex-1 [&_[data-slot=slider-thumb]]:size-3 [&_[data-slot=slider-track]]:bg-white/25"
          min={0}
          max={length || 1}
          step={0.1}
          value={[seeking ?? time]}
          onValueChange={([value]) => setSeeking(value)}
          onValueCommit={([value]) => {
            seek(value);
            setSeeking(null);
          }}
        />
        <span className="font-mono text-xs text-white/70 tabular-nums">{clock(length)}</span>
        <Button size="icon" variant="ghost" className="size-8 text-white hover:bg-white/15 hover:text-white" aria-label={muted ? "Sound on" : "Mute"} onClick={() => setMuted(!muted)}>
          {muted ? <VolumeXIcon /> : <Volume2Icon />}
        </Button>
        <Button size="icon" variant="ghost" className="size-8 text-white hover:bg-white/15 hover:text-white" aria-label={full ? "Exit full screen" : "Full screen"} onClick={() => void fullScreen()}>
          {full ? <MinimizeIcon /> : <MaximizeIcon />}
        </Button>
      </div>
    </div>
  );
}
