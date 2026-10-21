import { useCallback, useEffect, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon, CopyIcon, DownloadIcon, ExternalLinkIcon, MonitorSmartphoneIcon, SparklesIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { api, clientFileUrl, formatCost, jobLink, promoFileUrl, type ArtStyleChoice, type ArtStyleInfo, type PictureAmount, type Client, type Idea, type IdeaDay, type Job, type Library, type LibraryItem, type Post } from "../api.ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "./shared.tsx";
import { JobProgress } from "./JobProgress.tsx";
import { KnowledgePanel } from "./KnowledgePanel.tsx";
import { PromptedMode } from "./PromptedMode.tsx";
import { VideoPlayer } from "./VideoPlayer.tsx";

type Props = { id: string; jobs: Job[]; onOpenProject: (id: string) => void; onOpenPromo: (id: string) => void; onChanged: (client: Client) => void };

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

type Filter = "all" | "videos" | "carousels" | "images";
const FILTERS: { id: Filter; label: string; match: (item: LibraryItem) => boolean }[] = [
  { id: "all", label: "All", match: () => true },
  { id: "videos", label: "Videos", match: (item) => item.kind === "reel" || item.kind === "video" || item.kind === "promo" },
  { id: "carousels", label: "Carousels", match: (item) => item.kind === "carousel" },
  { id: "images", label: "Images", match: (item) => item.kind === "single" },
];

const GOAL_LABEL: Record<Idea["goal"], string> = { awareness: "Awareness", details: "Details", offer: "Offer" };
const FORMAT_LABEL: Record<LibraryItem["kind"], string> = { carousel: "Carousel", single: "Single image", reel: "Reel", video: "Marketing video", promo: "Website promo" };

/** A client's Instagram: the day's ideas, the posts made from them, and the profile the ideas are written from. */
export function ClientView({ id, jobs, onOpenProject, onOpenPromo, onChanged }: Props) {
  const [client, setClient] = useState<Client | null>(null);
  const [date, setDate] = useState(today);
  const [day, setDay] = useState<IdeaDay | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [library, setLibrary] = useState<Library | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [styles, setStyles] = useState<ArtStyleInfo[]>([]);
  const page = `/marketing/clients/${id}`;
  const mine = jobs.filter((job) => job.link === page || jobLink(job) === page || job.label === "Art style previews");
  const working = mine.filter((job) => job.status === "queued" || job.status === "running");
  const writingIdeas = mine.some((job) => job.label.startsWith("Ideas: ") && (job.status === "queued" || job.status === "running"));
  const finished = mine.filter((job) => job.status === "done" || job.status === "failed").length;

  const refresh = useCallback(() => {
    api.client(id).then(setClient).catch((error: Error) => toast.error(error.message));
    api.ideas(id, date).then(setDay).catch(() => setDay(null));
    api.posts(id).then(setPosts).catch(() => setPosts([]));
    api.library(id).then(setLibrary).catch(() => setLibrary(null));
    api.artStyles().then(setStyles).catch(() => setStyles([]));
  }, [id, date]);

  // Reload whenever one of this client's jobs finishes.
  useEffect(refresh, [refresh, finished]);

  if (!client) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  const act = (work: Promise<unknown>, done: string) =>
    work
      .then(() => {
        toast.success(done);
        refresh();
      })
      .catch((error: Error) => toast.error(error.message));

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto p-6">
      <div className="mb-4 flex items-center gap-3">
        {client.brand.logo && <img src={clientFileUrl(client.id, client.brand.logo)} alt="" className="size-10 rounded-lg border object-contain" style={{ background: client.brand.colors.background }} />}
        <div className="grid min-w-0 flex-1">
          <span className="truncate font-semibold">{client.name}</span>
          <span className="truncate text-xs text-muted-foreground">
            {client.instagramHandle ? `@${client.instagramHandle} · ` : ""}
            {client.niche}
          </span>
        </div>
        {library && (
          <span className="text-right font-mono text-xs text-muted-foreground tabular-nums" title={`Posts ${formatCost(library.totals.posts)} · videos ${formatCost(library.totals.videos)} · ideas ${formatCost(library.totals.ideas)}`}>
            This month {formatCost(library.totals.month)}
            <br />
            All time {formatCost(library.totals.all)}
          </span>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={!client.url}
          title="The website scrolling on a laptop and a phone, with music (no AI cost)"
          onClick={() =>
            api
              .makePromo(client.url)
              .then((job) => {
                toast.success("Recording the website…");
                onOpenPromo(job.promoId);
              })
              .catch((error: Error) => toast.error(error.message))
          }
        >
          <MonitorSmartphoneIcon /> Website promo
        </Button>
        <Button size="sm" disabled={writingIdeas} onClick={() => act(api.moreIdeas(client.id), "Writing 5 more ideas…")}>
          <SparklesIcon /> {writingIdeas ? "Writing ideas…" : "Get 5 more"}
        </Button>
      </div>

      {working.length > 0 && (
        <div className="mb-4 grid gap-2 rounded-xl border bg-muted/30 p-3">
          <span className="text-xs font-medium text-muted-foreground">Working on {working.length === 1 ? "1 job" : `${working.length} jobs`} for {client.name}</span>
          {working.map((job) => (
            <JobProgress key={job.id} job={job} compact />
          ))}
        </div>
      )}

      <Tabs defaultValue="ideas">
        <TabsList>
          <TabsTrigger value="ideas">Ideas</TabsTrigger>
          <TabsTrigger value="library">Library {library?.items.length ? `(${library.items.length})` : ""}</TabsTrigger>
          <TabsTrigger value="knowledge">Knowledge {client.knowledge ? "" : "·"}</TabsTrigger>
          <TabsTrigger value="prompted">Prompted mode {client.profile && Object.keys(client.profile.answers).length ? `(${Object.keys(client.profile.answers).length})` : "·"}</TabsTrigger>
          <TabsTrigger value="profile">Profile</TabsTrigger>
        </TabsList>

        <TabsContent value="ideas" className="grid gap-4 pt-2">
          <div className="flex flex-wrap items-center gap-2">
            <Input type="date" value={date} max={today()} onChange={(event) => setDate(event.target.value || today())} className="w-44" />
            {day?.trends.length ? <span className="text-xs text-muted-foreground">{day.trends.length} trends from this week's search</span> : null}
            {library?.ideasByDate[date] ? <Badge variant="outline" className="font-mono">ideas {formatCost(library.ideasByDate[date])}</Badge> : null}
          </div>
          {!day?.ideas.length && <p className="text-sm text-muted-foreground">No ideas for this day yet. They are written every morning after 08:00, or press "Get 5 more".</p>}
          <div className="grid gap-3 lg:grid-cols-2">
            {day?.ideas.map((idea) => (
              <IdeaCard
                key={idea.id}
                idea={idea}
                styles={styles}
                defaults={{ artStyle: client.artStyle ?? "flat", pictures: client.pictures ?? "light" }}
                onMake={(options) => {
                  const made = `Making the ${FORMAT_LABEL[idea.format].toLowerCase()}…`;
                  api
                    .makeIdea(client.id, idea.id, options)
                    .then(() => (toast.success(made), refresh()))
                    .catch((error: Error) =>
                      // A repeat of something already made: nothing was spent; offer to make it anyway.
                      error.message.startsWith("Too close to")
                        ? toast.warning(error.message, { duration: 15000, action: { label: "Make anyway", onClick: () => act(api.makeIdea(client.id, idea.id, { ...options, force: true }), made) } })
                        : toast.error(error.message),
                    );
                }}
                onSkip={() => act(api.skipIdea(client.id, idea.id), "Skipped")}
              />
            ))}
          </div>
          {day?.trends.length ? (
            <details className="rounded-xl border p-3 text-sm">
              <summary className="cursor-pointer text-muted-foreground">Trends used</summary>
              <ul className="mt-2 grid gap-1" dir="auto">
                {day.trends.map((trend) => (
                  <li key={trend.url}>
                    <a href={trend.url} target="_blank" rel="noreferrer" className="hover:underline">
                      {trend.title}
                    </a>
                    <span className="text-muted-foreground"> · {trend.summary}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </TabsContent>

        <TabsContent value="library" className="grid gap-4 pt-2">
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((option) => (
              <Button key={option.id} size="sm" variant={filter === option.id ? "default" : "outline"} onClick={() => setFilter(option.id)}>
                {option.label} <span className="font-mono text-xs opacity-70">{library?.items.filter(option.match).length ?? 0}</span>
              </Button>
            ))}
          </div>
          {!library?.items.length && <p className="text-sm text-muted-foreground">Make an idea to see its post here.</p>}
          <div className="grid gap-4 lg:grid-cols-2">
            {library?.items
              .filter(FILTERS.find((option) => option.id === filter)!.match)
              .map((item) => {
                const post = item.postId && item.kind !== "reel" ? posts.find((entry) => entry.id === item.postId) : undefined;
                return post ? (
                  <PostCard key={item.id} client={client} post={post} cost={item.cost} onOpenProject={onOpenProject} onSaved={refresh} />
                ) : item.promoId ? (
                  <PromoCard key={item.id} item={item} onOpen={() => onOpenPromo(item.promoId!)} />
                ) : (
                  <VideoCard key={item.id} item={item} onOpenProject={onOpenProject} />
                );
              })}
          </div>
        </TabsContent>

        <TabsContent value="prompted" className="pt-2">
          <PromptedMode clientId={client.id} onSaved={refresh} />
        </TabsContent>

        <TabsContent value="knowledge" className="pt-2">
          <KnowledgePanel
            key={client.knowledge?.updatedAt ?? "none"}
            client={client}
            working={working.some((job) => job.label.startsWith("Knowledge"))}
            onJob={refresh}
            onSaved={(next) => {
              setClient(next);
              onChanged(next);
            }}
          />
        </TabsContent>

        <TabsContent value="profile" className="pt-2">
          <ProfileForm
            key={client.updatedAt}
            client={client}
            styles={styles}
            onPreviews={() => act(api.drawStylePreviews(), "Drawing one sample picture per style (about $0.30)…")}
            onSaved={(next) => {
              setClient(next);
              onChanged(next);
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

type MakeOptions = { artStyle: ArtStyleChoice; pictures: PictureAmount };

/** The 12 art styles as picture tiles; a style without its sample picture shows its name only. */
function StyleGrid({ styles, value, onChange, size = "md" }: { styles: ArtStyleInfo[]; value: ArtStyleChoice; onChange: (id: ArtStyleChoice) => void; size?: "sm" | "md" }) {
  return (
    <div className={`grid gap-2 ${size === "sm" ? "grid-cols-4 sm:grid-cols-6" : "grid-cols-3 sm:grid-cols-4 lg:grid-cols-6"}`}>
      <button
        type="button"
        onClick={() => onChange("rotate")}
        title="A different style each time: one this client's recent posts haven't used"
        className={`grid gap-1 rounded-lg border p-1 text-center text-[11px] transition ${value === "rotate" ? "border-primary ring-2 ring-primary" : "hover:border-foreground/40"}`}
      >
        <span className="grid aspect-square w-full place-items-center rounded-md bg-muted text-2xl">↻</span>
        Rotate
      </button>
      {styles.map((style) => (
        <button
          key={style.id}
          type="button"
          onClick={() => onChange(style.id)}
          className={`grid gap-1 rounded-lg border p-1 text-center text-[11px] transition ${value === style.id ? "border-primary ring-2 ring-primary" : "hover:border-foreground/40"}`}
        >
          {style.preview ? <img src={`/client-styles/${style.id}.png`} alt="" className="aspect-square w-full rounded-md object-cover" /> : <span className="grid aspect-square w-full place-items-center rounded-md bg-muted text-muted-foreground">{style.label}</span>}
          {style.label}
        </button>
      ))}
    </div>
  );
}

function PictureToggle({ value, onChange }: { value: PictureAmount; onChange: (amount: PictureAmount) => void }) {
  return (
    <div className="flex gap-1.5">
      <Button size="sm" type="button" variant={value === "light" ? "default" : "outline"} onClick={() => onChange("light")}>
        Light · cover + 2 pictures
      </Button>
      <Button size="sm" type="button" variant={value === "rich" ? "default" : "outline"} onClick={() => onChange("rich")}>
        Rich · a picture on every slide
      </Button>
    </div>
  );
}

function IdeaCard({ idea, styles, defaults, onMake, onSkip }: { idea: Idea; styles: ArtStyleInfo[]; defaults: MakeOptions; onMake: (options: Partial<MakeOptions>) => void; onSkip: () => void }) {
  const [choosing, setChoosing] = useState(false);
  const [options, setOptions] = useState<MakeOptions>(defaults);
  const pictured = idea.format !== "reel";
  return (
    <div className={`grid content-start gap-2 rounded-xl border p-4 ${idea.status === "skipped" ? "opacity-50" : ""}`}>
      <div className="flex flex-wrap gap-1.5">
        <Badge>{FORMAT_LABEL[idea.format]}</Badge>
        <Badge variant="outline">{GOAL_LABEL[idea.goal]}</Badge>
        <Badge variant="outline">{idea.angle}</Badge>
        {idea.status !== "new" && <Badge variant="secondary">{idea.status}</Badge>}
      </div>
      <p className="font-medium" dir="auto">
        {idea.hook}
      </p>
      <ol className="list-decimal ps-5 text-sm text-muted-foreground" dir="auto">
        {idea.outline.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ol>
      <p className="text-xs text-muted-foreground" dir="auto">
        {idea.why}
      </p>
      {idea.trend && (
        <a href={idea.trend} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs hover:underline">
          <ExternalLinkIcon className="size-3" /> Trend source
        </a>
      )}
      <div className="flex gap-2">
        {idea.status === "new" && !choosing && (
          <Button size="sm" onClick={() => (pictured ? setChoosing(true) : onMake({}))}>
            Make
          </Button>
        )}
        {idea.status === "new" && (
          <Button size="sm" variant="ghost" onClick={onSkip}>
            <XIcon /> Skip
          </Button>
        )}
        {idea.status === "making" && <span className="text-xs text-muted-foreground">Being made, see the jobs panel</span>}
        {idea.status === "made" && <span className="text-xs text-muted-foreground">Made: see Library</span>}
      </div>
      {choosing && idea.status === "new" && (
        <div className="grid gap-2 rounded-lg border bg-muted/30 p-3">
          <span className="text-xs font-medium">Art style</span>
          <StyleGrid size="sm" styles={styles} value={options.artStyle} onChange={(artStyle) => setOptions({ ...options, artStyle })} />
          {idea.format === "carousel" && <PictureToggle value={options.pictures} onChange={(pictures) => setOptions({ ...options, pictures })} />}
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                setChoosing(false);
                onMake(options);
              }}
            >
              Make it
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setChoosing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** A made post: a swipeable carousel preview with its caption, or a link to the reel's project. */
function PostCard({ client, post, cost, onOpenProject, onSaved }: { client: Client; post: Post; cost?: number; onOpenProject: (id: string) => void; onSaved: () => void }) {
  const [index, setIndex] = useState(0);
  const [caption, setCaption] = useState(post.caption);
  const count = post.slides?.length ?? 0;
  const text = `${post.caption}\n\n${post.hashtags.map((tag) => `#${tag}`).join(" ")}`;
  const stamp = encodeURIComponent(post.updatedAt);

  return (
    <div className="grid content-start gap-3 rounded-xl border p-4">
      <div className="flex items-center gap-2">
        <Badge>{FORMAT_LABEL[post.kind]}</Badge>
        <Badge variant={post.status === "failed" ? "destructive" : "outline"}>{post.status}</Badge>
        {cost !== undefined && (
          <Badge variant="outline" className="font-mono">
            {formatCost(cost)}
          </Badge>
        )}
        {post.review && <ReviewBadge review={post.review} />}
        <span className="ms-auto text-xs text-muted-foreground">{new Date(post.createdAt).toLocaleString()}</span>
      </div>
      {post.error && <p className="text-xs text-destructive">{post.error}</p>}

      {post.kind !== "reel" && post.status === "done" && count > 0 && (
        <div className="relative mx-auto w-full max-w-sm">
          <img src={clientFileUrl(client.id, `posts/${post.id}/slides/${String(index + 1).padStart(2, "0")}.png?v=${stamp}`)} alt="" className="aspect-[4/5] w-full rounded-lg border object-cover" />
          {count > 1 && (
            <div className="absolute inset-x-2 top-1/2 flex -translate-y-1/2 justify-between">
              <Button size="icon" variant="secondary" disabled={index === 0} onClick={() => setIndex(index - 1)}>
                <ChevronLeftIcon />
              </Button>
              <Button size="icon" variant="secondary" disabled={index === count - 1} onClick={() => setIndex(index + 1)}>
                <ChevronRightIcon />
              </Button>
            </div>
          )}
          <p className="mt-1 text-center text-xs text-muted-foreground">
            {index + 1} / {count}
          </p>
        </div>
      )}

      {post.kind === "reel" && post.projectId && (
        <Button variant="outline" onClick={() => onOpenProject(post.projectId!)}>
          Open the reel
        </Button>
      )}

      <Field label="Caption" detail={`${post.hashtags.length} hashtags`}>
        <Textarea value={caption} dir="auto" rows={5} onChange={(event) => setCaption(event.target.value)} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(text).then(() => toast.success("Caption copied"))}>
          <CopyIcon /> Copy caption
        </Button>
        {post.kind !== "reel" && post.status === "done" && (
          <Button size="sm" variant="outline" asChild>
            <a href={`/api/clients/${client.id}/posts/${post.id}/zip`}>
              <DownloadIcon /> Download zip
            </a>
          </Button>
        )}
        {caption !== post.caption && (
          <Button
            size="sm"
            onClick={() =>
              api
                .editPost(client.id, post.id, { caption })
                .then(() => {
                  toast.success("Saving the caption…");
                  onSaved();
                })
                .catch((error: Error) => toast.error(error.message))
            }
          >
            Save caption
          </Button>
        )}
      </div>
    </div>
  );
}

/** The script's quality check: the lowest score shows; hover for all three and the notes. */
function ReviewBadge({ review }: { review: NonNullable<Post["review"]> }) {
  const low = Math.min(review.understand, review.feel, review.truthful);
  return (
    <Badge
      variant="outline"
      className={low >= 4 ? "border-success/50 text-success" : "border-destructive/50 text-destructive"}
      title={`Understands it ${review.understand}/5 · feels personal ${review.feel}/5 · true ${review.truthful}/5${review.rewritten ? " · rewritten once" : ""}\n${review.notes.join("\n")}`}
    >
      Script {low}/5{review.rewritten ? " ↻" : ""}
    </Badge>
  );
}

/** A reel or an earlier marketing video: plays inline, opens its project. */
function VideoCard({ item, onOpenProject }: { item: LibraryItem; onOpenProject: (id: string) => void }) {
  return (
    <div className="grid content-start gap-3 rounded-xl border p-4">
      <div className="flex items-center gap-2">
        <Badge>{FORMAT_LABEL[item.kind]}</Badge>
        <Badge variant="outline">{item.format === "long" ? "16:9" : "9:16"}</Badge>
        <Badge variant="outline" className="font-mono">
          {formatCost(item.cost)}
        </Badge>
        {item.review && <ReviewBadge review={item.review} />}
        <span className="ms-auto text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</span>
      </div>
      <p className="font-medium" dir="auto">
        {item.title}
      </p>
      {item.status === "done" && item.projectId ? (
        <VideoPlayer src={`/files/${item.projectId}/video.mp4`} shape={item.format === "long" ? "16x9" : "9x16"} maxHeight="24rem" />
      ) : (
        <p className="text-xs text-muted-foreground">{item.status === "failed" ? "Failed" : "Not rendered yet"}</p>
      )}
      {item.projectId && (
        <Button size="sm" variant="outline" onClick={() => onOpenProject(item.projectId!)}>
          Open project
        </Button>
      )}
    </div>
  );
}

/** A website promo: its reel-shaped video plays inline; both shapes are on its page. */
function PromoCard({ item, onOpen }: { item: LibraryItem; onOpen: () => void }) {
  return (
    <div className="grid content-start gap-3 rounded-xl border p-4">
      <div className="flex items-center gap-2">
        <Badge>{FORMAT_LABEL[item.kind]}</Badge>
        <Badge variant="outline">16:9 + 9:16</Badge>
        <Badge variant="outline" className="font-mono">
          {formatCost(item.cost)}
        </Badge>
        <span className="ms-auto text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</span>
      </div>
      <p className="font-medium" dir="auto">
        {item.title}
      </p>
      <VideoPlayer src={promoFileUrl(item.promoId!, "promo-9x16.mp4")} shape="9x16" posterAt={4} maxHeight="24rem" />
      <Button size="sm" variant="outline" onClick={onOpen}>
        Open promo
      </Button>
    </div>
  );
}

/** What ideas and posts are written from. */
function ProfileForm({ client, styles, onPreviews, onSaved }: { client: Client; styles: ArtStyleInfo[]; onPreviews: () => void; onSaved: (client: Client) => void }) {
  const [draft, setDraft] = useState(client);
  const brief = draft.brief;
  const [names, setNames] = useState(() => Object.entries(client.pronounce ?? {}).map(([word, said]) => `${word} = ${said}`).join("\n"));
  const setBrief = (change: Partial<Client["brief"]>) => setDraft({ ...draft, brief: { ...brief, ...change } });
  const save = () =>
    api
      .editClient(client.id, {
        name: draft.name,
        instagramHandle: draft.instagramHandle ?? "",
        language: draft.language,
        niche: draft.niche,
        avoid: draft.avoid,
        dailyIdeas: draft.dailyIdeas,
        artStyle: draft.artStyle ?? "flat",
        pronounce: Object.fromEntries(names.split("\n").map((line) => line.split("=").map((part) => part.trim())).filter((pair) => pair.length === 2 && pair[0] && pair[1])),
        pictures: draft.pictures ?? "light",
        brief: { ...brief, problems: brief.problems.map((line) => line.trim()).filter(Boolean), features: brief.features.map((line) => line.trim()).filter(Boolean) },
      })
      .then((next) => {
        toast.success("Saved");
        onSaved(next);
      })
      .catch((error: Error) => toast.error(error.message));

  return (
    <div className="grid max-w-2xl gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name">
          <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </Field>
        <Field label="Instagram handle">
          <Input value={draft.instagramHandle ?? ""} placeholder="risero" onChange={(e) => setDraft({ ...draft, instagramHandle: e.target.value })} />
        </Field>
      </div>
      <Field label="Niche (what the morning search looks for)">
        <Input value={draft.niche} onChange={(e) => setDraft({ ...draft, niche: e.target.value })} />
      </Field>
      <Field label="Business">
        <Textarea dir="auto" value={brief.business} onChange={(e) => setBrief({ business: e.target.value })} />
      </Field>
      <Field label="Audience">
        <Textarea dir="auto" value={brief.audience} onChange={(e) => setBrief({ audience: e.target.value })} />
      </Field>
      <Field label="Their problems (one per line)">
        <Textarea dir="auto" rows={5} value={brief.problems.join("\n")} onChange={(e) => setBrief({ problems: e.target.value.split("\n") })} />
      </Field>
      <Field label="Features (one per line)">
        <Textarea dir="auto" rows={4} value={brief.features.join("\n")} onChange={(e) => setBrief({ features: e.target.value.split("\n") })} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Call to action">
          <Input dir="auto" value={brief.cta.label} onChange={(e) => setBrief({ cta: { ...brief.cta, label: e.target.value } })} />
        </Field>
        <Field label="Link">
          <Input value={brief.cta.url} onChange={(e) => setBrief({ cta: { ...brief.cta, url: e.target.value } })} />
        </Field>
      </div>
      <Field label="Tone">
        <Input dir="auto" value={brief.tone} onChange={(e) => setBrief({ tone: e.target.value })} />
      </Field>
      <Field label="How the voice says names" detail="One per line, e.g. Risero = رايزرو">
        <Textarea dir="auto" rows={2} value={names} placeholder="Risero = رايزرو" onChange={(e) => setNames(e.target.value)} />
      </Field>
      <Field label="Never say">
        <Textarea dir="auto" value={draft.avoid} onChange={(e) => setDraft({ ...draft, avoid: e.target.value })} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={draft.dailyIdeas} onCheckedChange={(dailyIdeas) => setDraft({ ...draft, dailyIdeas })} /> 5 new ideas every morning
      </label>
      <Field label="Default art style for posts" detail={styles.some((style) => !style.preview) ? <button type="button" className="underline" onClick={onPreviews}>Draw style previews (~$0.30)</button> : undefined}>
        <StyleGrid styles={styles} value={draft.artStyle ?? "flat"} onChange={(artStyle) => setDraft({ ...draft, artStyle })} />
      </Field>
      <Field label="Default pictures per carousel">
        <PictureToggle value={draft.pictures ?? "light"} onChange={(pictures) => setDraft({ ...draft, pictures })} />
      </Field>
      <div>
        <Button onClick={save}>Save profile</Button>
      </div>
    </div>
  );
}
