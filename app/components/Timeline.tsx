import { ArrowLeftRightIcon, BookmarkIcon, ChartColumnIcon, CodeIcon, HashIcon, HeadingIcon, ListIcon, QuoteIcon, ZoomInIcon, ZoomOutIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { formatTime, type SceneState } from "../api.ts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

const ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  title: HeadingIcon,
  chapter: BookmarkIcon,
  stat: HashIcon,
  compare: ArrowLeftRightIcon,
  chart: ChartColumnIcon,
  list: ListIcon,
  quote: QuoteIcon,
  code: CodeIcon,
};

export function Timeline({ projectId, scenes, starts, lengths, time, selected, onSelect, onSeek, onReorder }: Props) {
  const total = lengths.reduce((sum, length) => sum + length, 0) || 1;
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState<number | null>(null);
  const track = useRef<HTMLDivElement>(null);
  const tickEvery = total / zoom > 240 ? 30 : total / zoom > 60 ? 10 : 5;

  const scroller = useRef<HTMLDivElement>(null);
  const seekAt = (clientX: number) => {
    const rect = track.current!.getBoundingClientRect();
    onSeek(Math.max(0, Math.min(total, ((clientX - rect.left) / rect.width) * total)));
  };
  // Press on the ruler or the playhead and drag to scrub.
  const scrub = (event: React.PointerEvent) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    seekAt(event.clientX);
    const move = (moveEvent: PointerEvent) => seekAt(moveEvent.clientX);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // Ctrl/⌘ + scroll zooms around the pointer; plain scroll still scrolls.
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      setZoom((current) => Math.max(1, Math.min(12, current * (event.deltaY < 0 ? 1.15 : 1 / 1.15))));
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col border-t bg-sidebar">
      <div className="flex items-center gap-3 px-3 py-1.5 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Timeline</span>
        <span className="font-mono tabular-nums">
          {formatTime(Math.min(time, total))} / {formatTime(total)}
        </span>
        <span>{scenes.length} scenes · drag to reorder · ⌘ + scroll to zoom</span>
        <div className="ml-auto flex items-center gap-0.5">
          <Button variant="ghost" size="icon-xs" onClick={() => setZoom(Math.max(1, zoom / 1.5))} aria-label="Zoom out">
            <ZoomOutIcon />
          </Button>
          <Button variant="ghost" size="icon-xs" onClick={() => setZoom(Math.min(12, zoom * 1.5))} aria-label="Zoom in">
            <ZoomInIcon />
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-3 pb-3" ref={scroller}>
        <div className="relative" ref={track} style={{ width: `${zoom * 100}%` }}>
          <div className="relative h-5 cursor-ew-resize touch-none border-b select-none" onPointerDown={scrub}>
            {Array.from({ length: Math.floor(total / tickEvery) + 1 }, (_unused, index) => (
              <span
                key={index}
                className="absolute bottom-0 border-l pl-1 font-mono text-[10px] leading-4 text-muted-foreground tabular-nums"
                style={{ left: `${((index * tickEvery) / total) * 100}%` }}
              >
                {formatTime(index * tickEvery)}
              </span>
            ))}
          </div>
          <div className="mt-1.5 flex h-12 gap-px">
            {scenes.map((scene, index) => {
              const Icon = ICON[scene.visual.type] ?? HeadingIcon;
              return (
                <div
                  key={scene.id}
                  className={cn(
                    "relative min-w-0 cursor-grab overflow-hidden rounded-md border bg-muted bg-cover bg-center",
                    selected === scene.id && "ring-2 ring-foreground ring-offset-1 ring-offset-sidebar",
                    dragging === index && "opacity-40",
                  )}
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
                  <span className="absolute top-1 left-1 flex items-center gap-1 rounded bg-background/85 px-1 font-mono text-[10px] leading-4 backdrop-blur-sm">
                    {index + 1}
                    <Icon className="size-2.5" />
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-px flex h-7 gap-px">
            {scenes.map((scene, index) => (
              <div
                key={scene.id}
                className={cn(
                  "min-w-0 cursor-pointer truncate rounded-md border bg-background px-1.5 text-[10px] leading-[26px] text-muted-foreground",
                  !scene.voiceCurrent && "border-dashed text-muted-foreground/60",
                )}
                style={{ width: `${(lengths[index] / total) * 100}%` }}
                onClick={() => onSelect(scene.id, starts[index])}
              >
                {scene.narration}
              </div>
            ))}
          </div>
          <div className="pointer-events-none absolute top-0 bottom-0 w-px bg-primary" style={{ left: `${(Math.min(time, total) / total) * 100}%` }}>
            <span className="pointer-events-auto absolute -top-1 -left-[6px] size-[13px] cursor-ew-resize touch-none rounded-full border-2 border-background bg-primary" onPointerDown={scrub} />
          </div>
        </div>
      </div>
    </div>
  );
}
