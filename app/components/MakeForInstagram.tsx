import { useEffect, useState } from "react";
import { ImagePlusIcon, TriangleAlertIcon } from "lucide-react";
import { toast } from "sonner";

import { api, type FormatInfo, type PictureAmount, type PostFormatId, type ReelStyleId, type ReelStyleInfo } from "../api.ts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from "./shared.tsx";

type Kind = "carousel" | "single" | "reel";
const KINDS: { id: Kind; label: string }[] = [
  { id: "carousel", label: "Carousel" },
  { id: "single", label: "Single image" },
  { id: "reel", label: "Reel" },
];

/** About what making it costs (the same estimate as the client page). */
function estimate(kind: Kind, pictures: PictureAmount): string {
  if (kind === "reel") return "$1.00";
  const count = pictures === "none" ? 0 : kind === "single" ? 1 : pictures === "rich" ? 7 : 3;
  return `$${(0.12 + count * 0.05).toFixed(2)}`;
}

/** Opens a page of the studio, as a click on a link would. */
const go = (path: string) => {
  history.pushState(null, "", path);
  dispatchEvent(new PopStateEvent("popstate"));
};

/**
 * Marketing mode → Instagram: this video's message made into a carousel,
 * single image or reel for the website's client, branded from the website,
 * with the client's knowledge and no-repeat memory.
 */
export function MakeForInstagram({ projectId, disabled }: { projectId: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("carousel");
  const [format, setFormat] = useState<PostFormatId | "auto">("auto");
  const [reelStyle, setReelStyle] = useState<ReelStyleId | "auto">("auto");
  const [pictures, setPictures] = useState<PictureAmount>("light");
  const [formats, setFormats] = useState<FormatInfo[]>([]);
  const [styles, setStyles] = useState<ReelStyleInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [repeat, setRepeat] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setRepeat(null);
    void api.formats().then(setFormats).catch(() => setFormats([]));
    void api.reelStyles().then(setStyles).catch(() => setStyles([]));
  }, [open]);

  const make = (force = false) => {
    setBusy(true);
    api
      .makeFromProject(projectId, { format: kind, ...(kind === "carousel" ? { postFormat: format } : {}), ...(kind === "reel" ? { reelStyle } : { pictures, design: "rotate" }), ...(force ? { force: true } : {}) })
      .then(({ clientId }) => {
        setOpen(false);
        toast.success(`Making the ${kind === "single" ? "image" : kind} for Instagram…`, { action: { label: "Open client", onClick: () => go(`/marketing/clients/${clientId}`) } });
      })
      // A repeat is refused before anything is spent; it can be made anyway on purpose.
      .catch((error: Error) => (error.message.startsWith("Too close to") ? setRepeat(error.message.split(". Make anyway")[0]) : toast.error(error.message)))
      .finally(() => setBusy(false));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={disabled}>
          <ImagePlusIcon /> Make for Instagram
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Make this video's message for Instagram</DialogTitle>
          <DialogDescription>For the website's client (created once if it has none), in its brand, with its knowledge, and never repeating its earlier posts' pictures or styles.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Field label="Kind">
            <div role="radiogroup" className="flex flex-wrap gap-1.5">
              {KINDS.map((option) => (
                <Button key={option.id} type="button" size="sm" role="radio" aria-checked={kind === option.id} variant={kind === option.id ? "default" : "outline"} onClick={() => setKind(option.id)}>
                  {option.label}
                </Button>
              ))}
            </div>
          </Field>
          {kind === "carousel" && (
            <Field label="Format">
              <Select value={format} onValueChange={(value) => setFormat(value as PostFormatId | "auto")}>
                <SelectTrigger size="sm" className="w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto: one not used lately</SelectItem>
                  {formats.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label.en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          {kind === "reel" && (
            <Field label="Reel style">
              <Select value={reelStyle} onValueChange={(value) => setReelStyle(value as ReelStyleId | "auto")}>
                <SelectTrigger size="sm" className="w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto: one not used lately</SelectItem>
                  {styles.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label.en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          {kind !== "reel" && (
            <Field label="Pictures" detail="the design rotates, so each post looks new">
              <div role="radiogroup" className="flex flex-wrap gap-1.5">
                {(["none", "light", "rich"] as const).map((amount) => (
                  <Button key={amount} type="button" size="sm" role="radio" aria-checked={pictures === amount} variant={pictures === amount ? "default" : "outline"} onClick={() => setPictures(amount)}>
                    {amount === "none" ? "No pictures" : amount === "light" ? "Light" : "Rich"}
                  </Button>
                ))}
              </div>
            </Field>
          )}
          {repeat && (
            <p className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-sm text-amber-700 dark:text-amber-400">
              <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
              <span dir="auto">{repeat}. Nothing was spent. Make it anyway only if you mean to pay for that message again.</span>
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          {repeat ? (
            <Button variant="destructive" disabled={busy} onClick={() => make(true)}>
              Make anyway · ~{estimate(kind, pictures)}
            </Button>
          ) : (
            <Button disabled={busy} onClick={() => make()}>
              Make · ~{estimate(kind, pictures)}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
