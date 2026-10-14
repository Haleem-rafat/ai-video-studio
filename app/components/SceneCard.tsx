import { ArrowDownIcon, ArrowUpIcon, DicesIcon, ImageIcon, ImageOffIcon, MicIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { forwardRef } from "react";

import { formatTime, type FormatId, type SceneState } from "../api.ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Confirm, Field } from "./shared.tsx";
import { VisualEditor } from "./VisualEditor.tsx";

type Props = {
  projectId: string;
  format: FormatId;
  /** Whiteboard pictures are square doodles, not full-frame backgrounds. */
  square: boolean;
  scene: SceneState;
  index: number;
  start: number;
  seconds: number;
  selected: boolean;
  isFirst: boolean;
  isLast: boolean;
  canDelete: boolean;
  onSelect: () => void;
  onChange: (scene: SceneState) => void;
  onMove: (delta: number) => void;
  onAddAfter: () => void;
  onDelete: () => void;
};

function Tool({ tip, children }: { tip: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  );
}

export const SceneCard = forwardRef<HTMLDivElement, Props>(function SceneCard(props, ref) {
  const { projectId, format, square, scene, index, start, seconds, selected } = props;
  const words = scene.narration.split(/\s+/).filter(Boolean).length;
  const voiceStale = !scene.voiceCurrent || scene.audio?.text !== scene.narration;
  const imageStale = Boolean(scene.imagePrompt) && (!scene.imageCurrent || scene.image?.prompt !== scene.imagePrompt || (scene.image?.seed ?? 0) !== (scene.imageSeed ?? 0));

  return (
    <div
      ref={ref}
      onClick={props.onSelect}
      className={cn("scroll-mt-4 rounded-xl border bg-card transition-shadow", selected ? "border-foreground/40 ring-1 ring-foreground/40" : "hover:border-foreground/20")}
    >
      <div className="flex items-center gap-2 border-b px-3 py-1.5">
        <span className="font-mono text-xs font-medium tabular-nums">{String(index + 1).padStart(2, "0")}</span>
        <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
          {formatTime(start)} · {seconds.toFixed(1)}s
        </span>
        {voiceStale && (
          <Badge variant="secondary" className="font-normal">
            <MicIcon /> Needs voice
          </Badge>
        )}
        {imageStale && (
          <Badge variant="secondary" className="font-normal">
            <ImageIcon /> Needs picture
          </Badge>
        )}
        <div className="ml-auto flex items-center gap-0.5" onClick={(event) => event.stopPropagation()}>
          <Tool tip="Move up">
            <Button variant="ghost" size="icon-xs" disabled={props.isFirst} onClick={() => props.onMove(-1)} aria-label="Move up">
              <ArrowUpIcon />
            </Button>
          </Tool>
          <Tool tip="Move down">
            <Button variant="ghost" size="icon-xs" disabled={props.isLast} onClick={() => props.onMove(1)} aria-label="Move down">
              <ArrowDownIcon />
            </Button>
          </Tool>
          <Tool tip="Add a scene after this one">
            <Button variant="ghost" size="icon-xs" onClick={props.onAddAfter} aria-label="Add scene after">
              <PlusIcon />
            </Button>
          </Tool>
          <Confirm
            trigger={
              <Button variant="ghost" size="icon-xs" disabled={!props.canDelete} aria-label="Delete scene" className="hover:text-destructive">
                <Trash2Icon />
              </Button>
            }
            title={`Delete scene ${index + 1}?`}
            description="Its narration, picture and on-screen text are removed from the video."
            action="Delete scene"
            onConfirm={props.onDelete}
          />
        </div>
      </div>

      <div className="grid gap-4 p-3 sm:grid-cols-[8.5rem_minmax(0,1fr)]">
        <div className="grid content-start gap-2">
          <div className={cn("overflow-hidden rounded-lg border bg-muted", square ? "aspect-square bg-white" : format === "short" ? "aspect-[9/16]" : "aspect-video")}>
            {scene.image ? (
              <img src={`/files/${projectId}/${scene.image.path}`} alt="" className={cn("size-full", square ? "object-contain" : "object-cover", imageStale && "opacity-40 grayscale")} />
            ) : (
              <div className="flex size-full flex-col items-center justify-center gap-1 text-[11px] text-muted-foreground">
                <ImageOffIcon className="size-4" />
                No picture
              </div>
            )}
          </div>
          <Button
            variant="outline"
            size="xs"
            disabled={!scene.imagePrompt}
            onClick={(event) => {
              event.stopPropagation();
              props.onChange({ ...scene, imageSeed: (scene.imageSeed ?? 0) + 1 });
            }}
          >
            <DicesIcon /> Redraw
          </Button>
        </div>

        <div className="grid min-w-0 content-start gap-3">
          <Field label="Narration" detail={`${words} words`}>
            <Textarea rows={3} value={scene.narration} onChange={(event) => props.onChange({ ...scene, narration: event.target.value })} />
          </Field>
          {scene.audio && !voiceStale && <audio className="h-8 w-full" controls preload="none" src={`/files/${projectId}/${scene.audio.path}`} />}
          <VisualEditor visual={scene.visual} onChange={(visual) => props.onChange({ ...scene, visual })} />
          <Field label="Picture" detail={scene.imagePrompt ? undefined : "none"}>
            <Textarea rows={2} value={scene.imagePrompt} placeholder="What the picture shows. Leave empty for no picture." onChange={(event) => props.onChange({ ...scene, imagePrompt: event.target.value })} />
          </Field>
        </div>
      </div>
    </div>
  );
});
