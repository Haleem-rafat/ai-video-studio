import { ImagePlusIcon, Loader2Icon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { api, type ProjectState } from "../api.ts";
import type { Photo } from "../../src/types.ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "./shared.tsx";

type DeepDive = NonNullable<ProjectState["deepdive"]>;

const readFile = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const SOURCES: Record<NonNullable<Photo["source"]>, string> = { commons: "Wikimedia Commons", upload: "Your photo", ai: "AI picture", press: "Official press photo" };

/** Where a photo came from, with its credit as the tooltip. */
export function PhotoSource({ photo }: { photo?: Photo }) {
  if (!photo?.path || !photo.source) return null;
  return (
    <Badge variant="outline" title={photo.credit}>
      {SOURCES[photo.source]}
    </Badge>
  );
}

/** A button that uploads a photo for one scene (or "cover") and hands back the saved project. */
export function PhotoUpload({ projectId, target, busy, onUploaded }: { projectId: string; target: string; busy: boolean; onUploaded: (project: ProjectState) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          setUploading(true);
          try {
            onUploaded(await api.scenePhoto(projectId, target, await readFile(file)));
          } catch (failure) {
            toast.error(failure instanceof Error ? failure.message : String(failure));
          } finally {
            setUploading(false);
          }
        }}
      />
      <Button
        variant="outline"
        size="xs"
        disabled={busy || uploading}
        onClick={(event) => {
          event.stopPropagation();
          input.current?.click();
        }}
      >
        {uploading ? <Loader2Icon className="animate-spin" /> : <ImagePlusIcon />}
        {uploading ? "Uploading…" : "Upload photo"}
      </Button>
    </>
  );
}

type Props = {
  project: ProjectState;
  busy: boolean;
  onEdit: (change: (deepdive: DeepDive) => DeepDive) => void;
  onUploaded: (project: ProjectState) => void;
};

/** The intro hook and the thumbnail (cover photo and text) of a deep-dive video. */
export function DeepDivePanel({ project, busy, onEdit, onUploaded }: Props) {
  const deepdive = project.deepdive!;
  const thumb = deepdive.thumbnail ?? { headline: "" };
  const cover = deepdive.cover;
  return (
    <div className="grid gap-3 rounded-xl border bg-card p-4">
      <div className="text-sm font-medium">Deep dive</div>
      <Field label="Intro hook on screen">
        <Input value={deepdive.hook ?? ""} disabled={busy} onChange={(event) => onEdit((current) => ({ ...current, hook: event.target.value }))} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem_8rem]">
        <Field label="Thumbnail headline">
          <Input value={thumb.headline} disabled={busy} onChange={(event) => onEdit((current) => ({ ...current, thumbnail: { ...thumb, headline: event.target.value } }))} />
        </Field>
        <Field label="Word in accent colour">
          <Input value={thumb.highlight ?? ""} disabled={busy} onChange={(event) => onEdit((current) => ({ ...current, thumbnail: { ...thumb, highlight: event.target.value } }))} />
        </Field>
        <Field label="Sticker">
          <Input value={thumb.tag ?? ""} disabled={busy} placeholder="3nm" onChange={(event) => onEdit((current) => ({ ...current, thumbnail: { ...thumb, tag: event.target.value } }))} />
        </Field>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Thumbnail photo" detail="search words, English" className="min-w-60 flex-1">
          <Input value={cover?.query ?? ""} disabled={busy} onChange={(event) => onEdit((current) => ({ ...current, cover: { query: event.target.value } }))} />
        </Field>
        <PhotoSource photo={cover} />
        <PhotoUpload projectId={project.id} target="cover" busy={busy} onUploaded={onUploaded} />
      </div>
      <p className="text-[11px] text-muted-foreground">
        Photos are found on Wikimedia Commons (free licences, credited in the description) on the next preview update. Change the search words to find another, or upload your own.
      </p>
      {project.hasComposition && (
        <img src={`/files/${project.id}/thumbnail.png?v=${encodeURIComponent(project.updatedAt)}`} alt="Thumbnail" className="w-full max-w-md rounded-lg border" onError={(event) => (event.currentTarget.style.display = "none")} />
      )}
    </div>
  );
}
