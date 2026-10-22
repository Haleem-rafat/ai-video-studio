import { CheckIcon, PaletteIcon, RefreshCwIcon } from "lucide-react";

import { clientFileUrl, type DesignInfo } from "../api.ts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  clientId: string;
  designs: DesignInfo[];
  value: string;
  onChange: (id: DesignInfo["id"] | "rotate") => void;
  /** Draws the previews in this client's brand (free); shown while any is missing. */
  onDrawPreviews?: () => void;
  drawing?: boolean;
  lang?: "en" | "ar";
  size?: "sm" | "md";
  /** Changes when previews are redrawn, so the browser fetches the new ones. */
  version?: string;
};

/** Carousel designs as preview cards in the client's own brand; hovering shows a list slide. */
export function DesignPicker({ clientId, designs, value, onChange, onDrawPreviews, drawing, lang = "en", size = "md", version = "" }: Props) {
  const missing = designs.some((design) => design.previews.length < 2);
  const image = (id: string, slide: string) => clientFileUrl(clientId, `designs/${id}-${slide}.png${version ? `?v=${encodeURIComponent(version)}` : ""}`);
  return (
    <div className="grid gap-2">
      {missing && onDrawPreviews && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <PaletteIcon className="size-4" /> See every design in this client's colours, fonts and logo.
          <Button size="sm" variant="outline" className="ms-auto" disabled={drawing} onClick={onDrawPreviews}>
            {drawing ? "Drawing previews…" : "Draw previews ($0)"}
          </Button>
        </div>
      )}
      <div role="radiogroup" aria-label="Design" className={cn("grid gap-2", size === "sm" ? "grid-cols-3 sm:grid-cols-4 lg:grid-cols-6" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6")}>
        <Button
          type="button"
          role="radio"
          aria-checked={value === "rotate"}
          variant="outline"
          title="A different design each post: one this client's recent posts haven't used"
          onClick={() => onChange("rotate")}
          className={cn("h-auto flex-col items-stretch gap-1.5 p-1.5 font-normal whitespace-normal", value === "rotate" && "border-primary ring-2 ring-primary")}
        >
          <span className="grid aspect-[4/5] w-full place-items-center rounded-md bg-muted text-muted-foreground">
            <RefreshCwIcon className="size-6" />
          </span>
          <span className={cn("truncate text-center", size === "sm" ? "text-[11px]" : "text-xs")}>{lang === "ar" ? "تبديل" : "Rotate"}</span>
        </Button>
        {designs.map((design) => {
          const on = value === design.id;
          const has = design.previews.includes("cover");
          return (
            <Button
              key={design.id}
              type="button"
              role="radio"
              aria-checked={on}
              variant="outline"
              title={design.description[lang]}
              onClick={() => onChange(design.id)}
              className={cn("group/design h-auto flex-col items-stretch gap-1.5 p-1.5 font-normal whitespace-normal", on && "border-primary ring-2 ring-primary")}
            >
              <span className="relative block aspect-[4/5] w-full overflow-hidden rounded-md bg-muted">
                {has ? (
                  <>
                    <img src={image(design.id, "cover")} alt="" loading="lazy" className="absolute inset-0 size-full object-cover transition-opacity group-hover/design:opacity-0" />
                    {design.previews.includes("list") && <img src={image(design.id, "list")} alt="" loading="lazy" className="absolute inset-0 size-full object-cover opacity-0 transition-opacity group-hover/design:opacity-100" />}
                  </>
                ) : (
                  <span className="grid size-full place-items-center p-2 text-center text-[11px] text-muted-foreground">{design.description[lang]}</span>
                )}
                {on && (
                  <span className="absolute top-1.5 end-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <CheckIcon className="size-3.5" />
                  </span>
                )}
              </span>
              <span className={cn("truncate text-center", size === "sm" ? "text-[11px]" : "text-xs")}>{design.label[lang]}</span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
