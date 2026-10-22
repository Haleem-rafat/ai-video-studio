import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownIcon, ArrowLeftIcon, ArrowUpIcon, CopyIcon, ImageIcon, ImageOffIcon, LoaderCircleIcon, PlusIcon, Trash2Icon, TriangleAlertIcon, Undo2Icon } from "lucide-react";
import { toast } from "sonner";

import { api, clientFileUrl, type Client, type DesignId, type DesignInfo, type Job, type Post, type Slide } from "../api.ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Confirm, Field } from "./shared.tsx";

type Layout = Slide["layout"];

const LAYOUTS: Record<Layout, { label: string; make: () => Slide }> = {
  cover: { label: "Cover", make: () => ({ layout: "cover", title: "New title" }) },
  list: { label: "List", make: () => ({ layout: "list", title: "Title", items: ["First point", "Second point", "Third point"] }) },
  checklist: { label: "Checklist", make: () => ({ layout: "checklist", title: "Title", items: ["First", "Second", "Third"] }) },
  steps: { label: "Steps", make: () => ({ layout: "steps", title: "Title", steps: ["Step one", "Step two", "Step three"] }) },
  stat: { label: "Big number", make: () => ({ layout: "stat", value: "70%", label: "What the number means" }) },
  "myth-fact": { label: "Myth → fact", make: () => ({ layout: "myth-fact", myth: "What people think", fact: "What is true" }) },
  "before-after": { label: "Before / after", make: () => ({ layout: "before-after", before: ["Before"], after: ["After"] }) },
  versus: { label: "Versus", make: () => ({ layout: "versus", title: "Title", left: { label: "Them", points: ["Point"] }, right: { label: "Us", points: ["Point"] } }) },
  faq: { label: "Question & answer", make: () => ({ layout: "faq", question: "The question?", answer: "The answer." }) },
  fix: { label: "Problem → fix", make: () => ({ layout: "fix", problem: "The problem", fix: "The fix" }) },
  chat: { label: "Chat", make: () => ({ layout: "chat", messages: [{ from: "them", text: "Their message" }, { from: "us", text: "Our answer" }] }) },
  quote: { label: "Quote", make: () => ({ layout: "quote", text: "The quote" }) },
  chart: { label: "Bar chart", make: () => ({ layout: "chart", title: "Title", bars: [{ label: "A", value: 10 }, { label: "B", value: 20 }] }) },
  cta: { label: "Call to action", make: () => ({ layout: "cta", title: "Title", button: "Book now", url: "https://" }) },
};

/** The words a slide shows first, for its place in the list. */
function headline(slide: Slide): string {
  const s = slide as Record<string, unknown>;
  for (const key of ["title", "value", "myth", "question", "problem", "text"]) if (typeof s[key] === "string" && s[key]) return s[key] as string;
  if (slide.layout === "before-after") return slide.before[0] ?? "";
  if (slide.layout === "chat") return slide.messages[0]?.text ?? "";
  return "";
}

/** The pictures a save would draw: a prompt no slide had drawn before (same rule as the server's keepArt). */
function newPictures(before: Slide[], after: Slide[]): number {
  return after.filter((slide) => slide.art && !before.some((old) => old.art?.file && old.art.prompt === slide.art!.prompt && (!slide.art!.file || old.art.file === slide.art!.file))).length;
}

const PICTURE_COST = 0.05;

/** Opens a page of the studio, as a click on a link would. */
const go = (path: string) => {
  history.pushState(null, "", path);
  dispatchEvent(new PopStateEvent("popstate"));
};
export const openCarouselEditor = (clientId: string, postId: string) => go(`/marketing/clients/${clientId}/posts/${postId}`);

/**
 * The carousel editor: the slides on the left (reorder, duplicate, delete,
 * add), the chosen slide drawn live in the middle exactly as it will render,
 * and its words, picture, design and the caption on the right. Nothing is
 * spent until Save, which redraws the slides (pictures only for new prompts).
 */
export function CarouselEditor({ clientId, postId, jobs, onBack }: { clientId: string; postId: string; jobs: Job[]; onBack: () => void }) {
  const [client, setClient] = useState<Client | null>(null);
  const [post, setPost] = useState<Post | null>(null);
  const [designs, setDesigns] = useState<DesignInfo[]>([]);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [design, setDesign] = useState<DesignId>("classic");
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [index, setIndex] = useState(0);
  const [saving, setSaving] = useState<string | null>(null);

  const load = () =>
    api
      .post(clientId, postId)
      .then((next) => {
        setPost(next);
        setSlides(structuredClone(next.slides ?? []));
        setDesign(next.design ?? "classic");
        setCaption(next.caption);
        setHashtags(next.hashtags.map((tag) => `#${tag}`).join(" "));
        setIndex((i) => Math.min(i, Math.max(0, (next.slides?.length ?? 1) - 1)));
      })
      .catch((error: Error) => toast.error(error.message));

  useEffect(() => {
    void load();
    api.client(clientId).then(setClient).catch(() => {});
    api.designs(clientId).then(setDesigns).catch(() => {});
  }, [clientId, postId]);

  // The save's redraw finishing: show the new slides.
  const job = saving ? jobs.find((entry) => entry.id === saving) : undefined;
  useEffect(() => {
    if (!job || (job.status !== "done" && job.status !== "failed")) return;
    setSaving(null);
    if (job.status === "failed") toast.error(job.error ?? "The redraw failed");
    else toast.success("Slides redrawn");
    void load();
  }, [job?.status]);

  const tags = hashtags.split(/[\s,]+/).map((tag) => tag.replace(/^#/, "")).filter(Boolean);
  const changed = post && (JSON.stringify(slides) !== JSON.stringify(post.slides ?? []) || design !== (post.design ?? "classic") || caption !== post.caption || tags.join(" ") !== post.hashtags.join(" "));
  // A picture with no description yet is left out rather than drawn from nothing.
  const ready = slides.map((entry) => (entry.art && !entry.art.prompt.trim() ? ({ ...entry, art: undefined } as Slide) : entry));
  const pictures = post ? newPictures(post.slides ?? [], ready) : 0;
  const slide = slides[index];

  const update = (next: Slide) => setSlides((all) => all.map((entry, i) => (i === index ? next : entry)));
  const move = (by: number) => {
    const to = index + by;
    if (to < 0 || to >= slides.length) return;
    setSlides((all) => {
      const next = [...all];
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });
    setIndex(to);
  };
  const insert = (next: Slide) => {
    setSlides((all) => [...all.slice(0, index + 1), next, ...all.slice(index + 1)]);
    setIndex(index + 1);
  };
  const remove = () => {
    setSlides((all) => all.filter((_, i) => i !== index));
    setIndex(Math.max(0, index - 1));
  };

  const save = () => {
    if (!post) return;
    api
      .editPost(clientId, postId, { slides: ready, design, caption, hashtags: tags })
      .then((started) => {
        setSaving(started.id);
        toast.info(pictures ? `Redrawing the slides and ${pictures} new picture${pictures > 1 ? "s" : ""}…` : "Redrawing the slides ($0)…");
      })
      .catch((error: Error) => toast.error(error.message));
  };

  if (!post || !client) {
    return (
      <p className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <LoaderCircleIcon className="size-4 animate-spin" /> Loading the carousel…
      </p>
    );
  }
  if (post.kind === "reel") {
    return (
      <div className="grid gap-3 p-6">
        <p className="text-sm text-muted-foreground">A reel is edited in its video project, not here.</p>
        <Button variant="outline" className="w-fit" onClick={onBack}>
          <ArrowLeftIcon /> Back
        </Button>
      </div>
    );
  }

  const single = post.kind === "single";
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
        <Button size="sm" variant="ghost" onClick={onBack}>
          <ArrowLeftIcon /> {client.name}
        </Button>
        <span className="truncate text-sm font-medium" dir="auto">
          {headline(slides[0] ?? ({} as Slide)) || post.id}
        </span>
        <Badge variant="outline">{single ? "Single image" : `${slides.length} slides`}</Badge>
        {saving && (
          <Badge variant="outline" className="gap-1">
            <LoaderCircleIcon className="size-3 animate-spin" /> Redrawing…
          </Badge>
        )}
        <div className="ms-auto flex items-center gap-2">
          <Select value={design} onValueChange={(value) => setDesign(value as DesignId)}>
            <SelectTrigger size="sm" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {designs.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label.en}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" disabled={!changed || Boolean(saving)} onClick={() => void load()}>
            <Undo2Icon /> Discard
          </Button>
          <Button size="sm" disabled={!changed || Boolean(saving) || !slides.length} onClick={save}>
            Save · {pictures ? `~$${(pictures * PICTURE_COST).toFixed(2)}` : "$0"}
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-auto md:grid-cols-[13rem_1fr_22rem] md:overflow-hidden">
        {/* The slides */}
        <div className="flex min-h-0 flex-col gap-2 overflow-auto border-e p-3">
          {slides.map((entry, i) => (
            <Button
              key={i}
              type="button"
              variant="outline"
              onClick={() => setIndex(i)}
              className={cn("h-auto flex-col items-stretch gap-0.5 p-2 text-start font-normal whitespace-normal", i === index && "border-primary ring-2 ring-primary")}
            >
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="font-mono">{i + 1}</span> {LAYOUTS[entry.layout]?.label ?? entry.layout}
                {entry.art && <ImageIcon className="ms-auto size-3" />}
              </span>
              <span className="line-clamp-2 text-xs" dir="auto">
                {headline(entry) || "…"}
              </span>
            </Button>
          ))}
          {!single && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="secondary">
                  <PlusIcon /> Add slide
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="max-h-80 overflow-auto">
                {(Object.keys(LAYOUTS) as Layout[]).map((layout) => (
                  <DropdownMenuItem key={layout} onSelect={() => insert(LAYOUTS[layout].make())}>
                    {LAYOUTS[layout].label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* The slide, drawn live */}
        <div className="flex min-h-0 flex-col items-center gap-2 overflow-auto bg-muted/40 p-4">
          {slide ? (
            <>
              <div className="flex flex-wrap justify-center gap-1.5">
                <Button size="sm" variant="outline" disabled={index === 0} onClick={() => move(-1)} aria-label="Move up">
                  <ArrowUpIcon />
                </Button>
                <Button size="sm" variant="outline" disabled={index === slides.length - 1} onClick={() => move(1)} aria-label="Move down">
                  <ArrowDownIcon />
                </Button>
                {!single && (
                  <Button size="sm" variant="outline" onClick={() => insert(structuredClone(slide))}>
                    <CopyIcon /> Duplicate
                  </Button>
                )}
                {!single && slides.length > 1 && (
                  <Confirm
                    trigger={
                      <Button size="sm" variant="outline">
                        <Trash2Icon /> Delete slide
                      </Button>
                    }
                    title={`Delete slide ${index + 1}?`}
                    description="It goes when you save; Discard brings it back until then."
                    action="Delete slide"
                    onConfirm={remove}
                  />
                )}
              </div>
              <SlidePreview clientId={clientId} postId={postId} slide={slide} index={index} total={slides.length} design={design} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No slides. Add one.</p>
          )}
        </div>

        {/* Its words, picture and the caption */}
        <div className="min-h-0 overflow-auto border-s p-3">
          <Tabs defaultValue="slide">
            <TabsList className="w-full">
              <TabsTrigger value="slide">Slide {slide ? index + 1 : ""}</TabsTrigger>
              <TabsTrigger value="caption">Caption</TabsTrigger>
            </TabsList>
            <TabsContent value="slide" className="grid gap-3 pt-2">
              {slide && <SlideFields key={`${index}-${slide.layout}`} slide={slide} clientId={clientId} postId={postId} onChange={update} />}
            </TabsContent>
            <TabsContent value="caption" className="grid gap-3 pt-2">
              <Field label="Caption">
                <Textarea value={caption} dir="auto" rows={10} onChange={(event) => setCaption(event.target.value)} />
              </Field>
              <Field label="Hashtags" detail={`${tags.length}`}>
                <Textarea value={hashtags} dir="auto" rows={3} onChange={(event) => setHashtags(event.target.value)} />
              </Field>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

/** The slide as the renderer will draw it, scaled to fit, with whether its words fit. */
function SlidePreview({ clientId, postId, slide, index, total, design }: { clientId: string; postId: string; slide: Slide; index: number; total: number; design: DesignId }) {
  const [html, setHtml] = useState("");
  const [fit, setFit] = useState<"ok" | "tight" | "over" | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(400);
  const frame = useRef<HTMLIFrameElement>(null);

  const input = useMemo(() => JSON.stringify({ slide, index, total, design }), [slide, index, total, design]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      api
        .slidePreview(clientId, postId, JSON.parse(input))
        .then((next) => {
          setFit(null);
          setHtml(next);
        })
        .catch(() => {});
    }, 250);
    return () => window.clearTimeout(timer);
  }, [input]);

  useEffect(() => {
    const listen = (event: MessageEvent) => {
      if (event.source === frame.current?.contentWindow && event.data?.slideFit) setFit(event.data.slideFit);
    };
    window.addEventListener("message", listen);
    return () => window.removeEventListener("message", listen);
  }, []);

  useEffect(() => {
    if (!box.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.min(entry.contentRect.width, 520)));
    observer.observe(box.current);
    return () => observer.disconnect();
  }, []);

  const scale = width / 1080;
  return (
    <div ref={box} className="grid w-full max-w-[520px] justify-items-center gap-2">
      <div className="overflow-hidden rounded-lg border bg-background shadow-sm" style={{ width, height: 1350 * scale }}>
        {html && <iframe ref={frame} title="Slide preview" srcDoc={html} sandbox="allow-scripts" className="origin-top-left border-0" style={{ width: 1080, height: 1350, transform: `scale(${scale})` }} />}
      </div>
      {fit === "tight" && <p className="text-xs text-muted-foreground">The words fit only smaller than usual; shorter reads better.</p>}
      {fit === "over" && (
        <p className="flex items-center gap-1.5 text-xs text-destructive">
          <TriangleAlertIcon className="size-3.5" /> Too long for one slide: the end would be cut off. Shorten it or split it into two slides.
        </p>
      )}
    </div>
  );
}

/** A list typed one item per line; the text is kept as typed so Enter makes a new line. */
function LinesField({ label, value, onChange, rows = 4 }: { label: string; value: string[]; onChange: (lines: string[]) => void; rows?: number }) {
  const [text, setText] = useState(value.join("\n"));
  return (
    <Field label={label} detail="one per line">
      <Textarea
        value={text}
        dir="auto"
        rows={rows}
        onChange={(event) => {
          setText(event.target.value);
          onChange(
            event.target.value
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean),
          );
        }}
      />
    </Field>
  );
}

function TextField({ label, value, onChange, rows = 2 }: { label: string; value: string | undefined; onChange: (text: string) => void; rows?: number }) {
  return (
    <Field label={label}>
      <Textarea value={value ?? ""} dir="auto" rows={rows} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}

/** The chosen slide's words for its layout, and its picture. */
function SlideFields({ slide, clientId, postId, onChange }: { slide: Slide; clientId: string; postId: string; onChange: (slide: Slide) => void }) {
  const set = (patch: Record<string, unknown>) => onChange({ ...slide, ...patch } as Slide);
  const text = (key: string, label: string, rows = 2) => <TextField label={label} value={(slide as Record<string, unknown>)[key] as string} rows={rows} onChange={(value) => set({ [key]: value })} />;
  const lines = (key: string, label: string) => <LinesField label={label} value={(slide as Record<string, unknown>)[key] as string[]} onChange={(value) => set({ [key]: value })} />;

  return (
    <>
      <Badge variant="secondary" className="w-fit">
        {LAYOUTS[slide.layout]?.label ?? slide.layout}
      </Badge>
      {slide.layout === "cover" && (
        <>
          {text("title", "Title", 3)}
          {text("subtitle", "Subtitle", 3)}
        </>
      )}
      {(slide.layout === "list" || slide.layout === "checklist") && (
        <>
          {text("title", "Title")}
          {lines("items", "Points")}
        </>
      )}
      {slide.layout === "steps" && (
        <>
          {text("title", "Title")}
          {lines("steps", "Steps")}
        </>
      )}
      {slide.layout === "stat" && (
        <>
          {text("value", "Number", 1)}
          {text("label", "What it means")}
          {text("note", "Note (e.g. the source)")}
        </>
      )}
      {slide.layout === "myth-fact" && (
        <>
          {text("myth", "Myth", 3)}
          {text("fact", "Fact", 3)}
        </>
      )}
      {slide.layout === "before-after" && (
        <>
          {lines("before", "Before")}
          {lines("after", "After")}
        </>
      )}
      {slide.layout === "versus" && (
        <>
          {text("title", "Title")}
          <Field label="Left side">
            <Input value={slide.left.label} dir="auto" onChange={(event) => set({ left: { ...slide.left, label: event.target.value } })} />
          </Field>
          <LinesField label="Left points" value={slide.left.points} onChange={(points) => set({ left: { ...slide.left, points } })} />
          <Field label="Right side">
            <Input value={slide.right.label} dir="auto" onChange={(event) => set({ right: { ...slide.right, label: event.target.value } })} />
          </Field>
          <LinesField label="Right points" value={slide.right.points} onChange={(points) => set({ right: { ...slide.right, points } })} />
        </>
      )}
      {slide.layout === "faq" && (
        <>
          {text("question", "Question", 3)}
          {text("answer", "Answer", 5)}
        </>
      )}
      {slide.layout === "fix" && (
        <>
          {text("problem", "Problem", 3)}
          {text("fix", "Fix", 4)}
        </>
      )}
      {slide.layout === "quote" && (
        <>
          {text("text", "Quote", 4)}
          {text("by", "Who said it", 1)}
        </>
      )}
      {slide.layout === "cta" && (
        <>
          {text("title", "Title", 3)}
          {text("button", "Button", 1)}
          {text("url", "Link", 1)}
        </>
      )}
      {slide.layout === "chart" && (
        <>
          {text("title", "Title")}
          {text("unit", "Unit", 1)}
          <LinesField
            label="Bars (label | value)"
            value={slide.bars.map((bar) => `${bar.label} | ${bar.value}`)}
            onChange={(rows) => set({ bars: rows.map((row) => row.split("|")).map(([label, value]) => ({ label: label.trim(), value: Number(value) || 0 })) })}
          />
        </>
      )}
      {slide.layout === "chat" && (
        <LinesField
          label="Messages (them: … or us: …)"
          rows={6}
          value={slide.messages.map((message) => `${message.from}: ${message.text}`)}
          onChange={(rows) => set({ messages: rows.map((row) => (/^us\s*:/i.test(row) ? { from: "us", text: row.replace(/^us\s*:\s*/i, "") } : { from: "them", text: row.replace(/^them\s*:\s*/i, "") })) })}
        />
      )}

      <div className="grid gap-2 rounded-lg border p-2.5">
        <span className="text-sm font-medium">Picture</span>
        {slide.art ? (
          <>
            {slide.art.file && <img src={clientFileUrl(clientId, `posts/${postId}/${slide.art.file}`)} alt="" className="aspect-square w-28 rounded-md object-cover" />}
            <Textarea
              value={slide.art.prompt}
              dir="auto"
              rows={3}
              onChange={(event) => set({ art: { prompt: event.target.value } })}
            />
            <p className="text-xs text-muted-foreground">{slide.art.file ? "Changing the description draws a new picture on save (~$0.05)." : "Drawn on save (~$0.05)."}</p>
            <Button size="sm" variant="outline" className="w-fit" onClick={() => set({ art: undefined })}>
              <ImageOffIcon /> Remove picture
            </Button>
          </>
        ) : (
          <Button size="sm" variant="outline" className="w-fit" onClick={() => set({ art: { prompt: "" } })}>
            <ImageIcon /> Add a picture
          </Button>
        )}
      </div>
    </>
  );
}
