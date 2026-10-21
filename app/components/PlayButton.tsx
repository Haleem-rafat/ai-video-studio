import { useEffect, useState } from "react";
import { PauseIcon, PlayIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

/** One player for the whole app, so starting a track stops the one before. */
const player = typeof Audio === "undefined" ? null : new Audio();
const listeners = new Set<() => void>();
if (player) for (const event of ["play", "pause", "ended", "timeupdate", "emptied"]) player.addEventListener(event, () => listeners.forEach((listener) => listener()));

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

/** Plays or pauses a sound file, showing how far it has played. */
export function PlayButton({ src, label = "Play" }: { src: string; label?: string }) {
  const [, redraw] = useState(0);
  useEffect(() => {
    const listener = () => redraw((n) => n + 1);
    listeners.add(listener);
    return () => void listeners.delete(listener);
  }, []);

  const mine = Boolean(player && player.src && player.src.endsWith(src));
  const playing = mine && !player!.paused;
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="font-mono tabular-nums"
      title={playing ? "Pause" : label}
      onClick={() => {
        if (!player) return;
        if (playing) return player.pause();
        if (!mine) player.src = src;
        void player.play();
      }}
    >
      {playing ? <PauseIcon /> : <PlayIcon />}
      {mine && player!.currentTime > 0 ? clock(player!.currentTime) : label}
    </Button>
  );
}
