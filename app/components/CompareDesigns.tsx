import { useEffect, useRef, useState } from "react";
import { CheckIcon, LoaderCircleIcon, PaletteIcon } from "lucide-react";
import { toast } from "sonner";

import { api, clientFileUrl, type Client, type DesignId, type DesignInfo, type Post } from "../api.ts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * The post's own first slides in every design, side by side, to pick from.
 * Drawn by Chrome from the post's text and pictures: no AI, $0.
 */
export function CompareDesigns({ client, post, designs, onChosen }: { client: Client; post: Post; designs: DesignInfo[]; onChosen: () => void }) {
  const [open, setOpen] = useState(false);
  const [drawn, setDrawn] = useState<DesignId[] | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [stamp, setStamp] = useState(() => Date.now());
  const poll = useRef<number | undefined>(undefined);
  const current = post.design ?? "classic";

  const load = () =>
    api
      .postDesigns(client.id, post.id)
      .then((list) => {
        setDrawn(list);
        return list;
      })
      .catch(() => setDrawn([]));
  useEffect(() => {
    if (open) void load();
    return () => window.clearInterval(poll.current);
  }, [open]);

  const draw = () => {
    setDrawing(true);
    api
      .drawPostDesigns(client.id, post.id)
      .then(() => {
        // The job takes a few seconds; the grid fills in as it finishes.
        poll.current = window.setInterval(async () => {
          const list = await load();
          if (list && list.length >= designs.length) {
            window.clearInterval(poll.current);
            setDrawing(false);
            setStamp(Date.now());
          }
        }, 1500);
      })
      .catch((error: Error) => {
        setDrawing(false);
        toast.error(error.message);
      });
  };

  const choose = (design: DesignId) =>
    api
      .editPost(client.id, post.id, { design })
      .then(() => {
        toast.success(`Redrawing the post in ${designs.find((each) => each.id === design)?.label.en} ($0)…`);
        setOpen(false);
        onChosen();
      })
      .catch((error: Error) => toast.error(error.message));

  const image = (design: DesignId, n: number) => clientFileUrl(client.id, `posts/${post.id}/designs/${design}-${n}.png?v=${stamp}`);
  const ready = drawn && drawn.length > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <PaletteIcon /> Compare designs
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Compare designs on this post</DialogTitle>
          <DialogDescription>Its own first slides in every design. Pick one to redraw the whole post in it: only the slides change, no AI, $0.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          {drawn === null ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircleIcon className="size-4 animate-spin" /> Loading…
            </p>
          ) : !ready && !drawing ? (
            <div className="grid place-items-center gap-3 py-10 text-center">
              <p className="max-w-md text-sm text-muted-foreground">Draw this post's cover and second slide in all {designs.length} designs, in a few seconds and for free.</p>
              <Button onClick={draw}>
                <PaletteIcon /> Draw all designs ($0)
              </Button>
            </div>
          ) : (
            <>
              {drawing && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <LoaderCircleIcon className="size-4 animate-spin" /> Drawing {drawn?.length ?? 0} of {designs.length}…
                </p>
              )}
              <div role="radiogroup" aria-label="Design" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {designs.map((design) => {
                  const has = drawn?.includes(design.id);
                  const on = current === design.id;
                  return (
                    <Button
                      key={design.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      variant="outline"
                      disabled={!has || on}
                      title={design.description.en}
                      onClick={() => choose(design.id)}
                      className={cn("group/design h-auto flex-col items-stretch gap-1.5 p-1.5 font-normal whitespace-normal disabled:opacity-100", on && "border-primary ring-2 ring-primary")}
                    >
                      <span className="relative block aspect-[4/5] w-full overflow-hidden rounded-md bg-muted">
                        {has ? (
                          <>
                            <img src={image(design.id, 1)} alt="" loading="lazy" className="absolute inset-0 size-full object-cover transition-opacity group-hover/design:opacity-0" />
                            <img src={image(design.id, 2)} alt="" loading="lazy" className="absolute inset-0 size-full object-cover opacity-0 transition-opacity group-hover/design:opacity-100" />
                          </>
                        ) : (
                          <LoaderCircleIcon className="absolute top-1/2 left-1/2 size-5 -translate-1/2 animate-spin text-muted-foreground" />
                        )}
                        {on && (
                          <span className="absolute top-1.5 end-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                            <CheckIcon className="size-3.5" />
                          </span>
                        )}
                      </span>
                      <span className="truncate text-center text-xs">{on ? `${design.label.en} · now` : design.label.en}</span>
                    </Button>
                  );
                })}
              </div>
            </>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
