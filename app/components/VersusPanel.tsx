import { ImagePlusIcon, Loader2Icon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { api, type ProjectState } from "../api.ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "./shared.tsx";

type Versus = NonNullable<ProjectState["versus"]>;

type Props = {
  project: ProjectState;
  busy: boolean;
  onEdit: (change: (versus: Versus) => Versus) => void;
  /** The project after a photo upload, straight from the server. */
  onUploaded: (project: ProjectState) => void;
};

const readFile = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

/** One product: its names, colour and picture, with a button to replace the AI picture by a real photo. */
function ProductCard({ project, side, busy, onEdit, onUploaded }: Props & { side: "a" | "b" }) {
  const product = project.versus![side];
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const set = (change: Partial<typeof product>) => onEdit((versus) => ({ ...versus, [side]: { ...versus[side], ...change } }));

  return (
    <div className="grid gap-3 rounded-lg border p-3">
      <div className="flex items-start gap-3">
        <div
          className="flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border"
          style={{ background: `radial-gradient(${product.color}55, transparent 70%), #0b0b0d` }}
        >
          {product.image ? (
            <img src={`/files/${project.id}/${product.image}`} alt="" className="size-full object-contain p-1" />
          ) : (
            <span className="px-2 text-center text-[11px] text-white/60">Drawn on the next preview update</span>
          )}
        </div>
        <div className="grid min-w-0 flex-1 gap-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">{side.toUpperCase()}</span>
            {product.imageSource && <Badge variant="outline">{product.imageSource === "photo" ? "Real photo" : "AI picture"}</Badge>}
          </div>
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
                onUploaded(await api.productPhoto(project.id, side, await readFile(file)));
              } catch (failure) {
                toast.error(failure instanceof Error ? failure.message : String(failure));
              } finally {
                setUploading(false);
              }
            }}
          />
          <Button variant="outline" size="sm" className="w-fit" disabled={busy || uploading} onClick={() => input.current?.click()}>
            {uploading ? <Loader2Icon className="animate-spin" /> : <ImagePlusIcon />}
            {uploading ? "Cutting out…" : "Upload real photo"}
          </Button>
          <p className="text-[11px] text-muted-foreground">The background is removed automatically. Official press photos look best.</p>
        </div>
      </div>
      <div className="grid grid-cols-[1fr_8rem_4rem] gap-2">
        <Field label="Name">
          <Input value={product.name} disabled={busy} onChange={(event) => set({ name: event.target.value })} />
        </Field>
        <Field label="Short">
          <Input value={product.short} disabled={busy} onChange={(event) => set({ short: event.target.value })} />
        </Field>
        <Field label="Colour">
          <input type="color" value={product.color} disabled={busy} onChange={(event) => set({ color: event.target.value })} className="h-9 w-full cursor-pointer rounded-md border bg-transparent p-1" />
        </Field>
      </div>
    </div>
  );
}

/** The two products, the intro hook and the thumbnail text of a versus video. */
export function VersusPanel(props: Props) {
  const { project, busy, onEdit } = props;
  const versus = project.versus!;
  const thumb = versus.thumbnail ?? { headline: "" };
  return (
    <div className="grid gap-3 rounded-xl border bg-card p-4">
      <div className="text-sm font-medium">Products</div>
      <div className="grid gap-3 xl:grid-cols-2">
        <ProductCard {...props} side="a" />
        <ProductCard {...props} side="b" />
      </div>
      <Field label="Intro hook on screen">
        <Input value={versus.hook ?? ""} disabled={busy} onChange={(event) => onEdit((current) => ({ ...current, hook: event.target.value }))} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem_8rem]">
        <Field label="Thumbnail headline">
          <Input value={thumb.headline} disabled={busy} onChange={(event) => onEdit((current) => ({ ...current, thumbnail: { ...thumb, headline: event.target.value } }))} />
        </Field>
        <Field label="Word in accent colour">
          <Input value={thumb.highlight ?? ""} disabled={busy} onChange={(event) => onEdit((current) => ({ ...current, thumbnail: { ...thumb, highlight: event.target.value } }))} />
        </Field>
        <Field label="Sticker">
          <Input value={thumb.tag ?? ""} disabled={busy} placeholder="+$100" onChange={(event) => onEdit((current) => ({ ...current, thumbnail: { ...thumb, tag: event.target.value } }))} />
        </Field>
      </div>
      {project.hasComposition && (
        <img src={`/files/${project.id}/thumbnail.png?v=${encodeURIComponent(project.updatedAt)}`} alt="Thumbnail" className="w-full max-w-md rounded-lg border" onError={(event) => (event.currentTarget.style.display = "none")} />
      )}
    </div>
  );
}
