import { useCallback, useEffect, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon, CopyIcon, DownloadIcon, ExternalLinkIcon, SparklesIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { api, clientFileUrl, type Client, type Idea, type IdeaDay, type Job, type Post } from "../api.ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "./shared.tsx";

type Props = { id: string; jobs: Job[]; onOpenProject: (id: string) => void; onChanged: (client: Client) => void };

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const GOAL_LABEL: Record<Idea["goal"], string> = { awareness: "Awareness", details: "Details", offer: "Offer" };
const FORMAT_LABEL: Record<Idea["format"], string> = { carousel: "Carousel", single: "Single image", reel: "Reel" };

/** A client's Instagram: the day's ideas, the posts made from them, and the profile the ideas are written from. */
export function ClientView({ id, jobs, onOpenProject, onChanged }: Props) {
  const [client, setClient] = useState<Client | null>(null);
  const [date, setDate] = useState(today);
  const [day, setDay] = useState<IdeaDay | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const mine = jobs.filter((job) => client && (job.label === `Ideas: ${client.name}` || job.label.includes(`: ${client.name}: `) || job.label.startsWith("Re-render post: ")));
  const writingIdeas = mine.some((job) => job.label.startsWith("Ideas: ") && (job.status === "queued" || job.status === "running"));
  const finished = mine.filter((job) => job.status === "done" || job.status === "failed").length;

  const refresh = useCallback(() => {
    api.client(id).then(setClient).catch((error: Error) => toast.error(error.message));
    api.ideas(id, date).then(setDay).catch(() => setDay(null));
    api.posts(id).then(setPosts).catch(() => setPosts([]));
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
        <Button size="sm" disabled={writingIdeas} onClick={() => act(api.moreIdeas(client.id), "Writing 5 more ideas…")}>
          <SparklesIcon /> {writingIdeas ? "Writing ideas…" : "Get 5 more"}
        </Button>
      </div>

      <Tabs defaultValue="ideas">
        <TabsList>
          <TabsTrigger value="ideas">Ideas</TabsTrigger>
          <TabsTrigger value="posts">Posts {posts.length ? `(${posts.length})` : ""}</TabsTrigger>
          <TabsTrigger value="profile">Profile</TabsTrigger>
        </TabsList>

        <TabsContent value="ideas" className="grid gap-4 pt-2">
          <div className="flex flex-wrap items-center gap-2">
            <Input type="date" value={date} max={today()} onChange={(event) => setDate(event.target.value || today())} className="w-44" />
            {day?.trends.length ? <span className="text-xs text-muted-foreground">{day.trends.length} trends from this week's search</span> : null}
          </div>
          {!day?.ideas.length && <p className="text-sm text-muted-foreground">No ideas for this day yet. They are written every morning after 08:00, or press "Get 5 more".</p>}
          <div className="grid gap-3 lg:grid-cols-2">
            {day?.ideas.map((idea) => (
              <IdeaCard key={idea.id} idea={idea} onMake={() => act(api.makeIdea(client.id, idea.id), `Making the ${FORMAT_LABEL[idea.format].toLowerCase()}…`)} onSkip={() => act(api.skipIdea(client.id, idea.id), "Skipped")} />
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

        <TabsContent value="posts" className="grid gap-4 pt-2 lg:grid-cols-2">
          {!posts.length && <p className="text-sm text-muted-foreground">Make an idea to see its post here.</p>}
          {posts.map((post) => (
            <PostCard key={post.id} client={client} post={post} onOpenProject={onOpenProject} onSaved={refresh} />
          ))}
        </TabsContent>

        <TabsContent value="profile" className="pt-2">
          <ProfileForm
            key={client.updatedAt}
            client={client}
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

function IdeaCard({ idea, onMake, onSkip }: { idea: Idea; onMake: () => void; onSkip: () => void }) {
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
        {idea.status === "new" && (
          <Button size="sm" onClick={onMake}>
            Make
          </Button>
        )}
        {idea.status === "new" && (
          <Button size="sm" variant="ghost" onClick={onSkip}>
            <XIcon /> Skip
          </Button>
        )}
        {idea.status === "making" && <span className="text-xs text-muted-foreground">Being made, see the jobs panel</span>}
        {idea.status === "made" && <span className="text-xs text-muted-foreground">Made: see Posts</span>}
      </div>
    </div>
  );
}

/** A made post: a swipeable carousel preview with its caption, or a link to the reel's project. */
function PostCard({ client, post, onOpenProject, onSaved }: { client: Client; post: Post; onOpenProject: (id: string) => void; onSaved: () => void }) {
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

/** What ideas and posts are written from. */
function ProfileForm({ client, onSaved }: { client: Client; onSaved: (client: Client) => void }) {
  const [draft, setDraft] = useState(client);
  const brief = draft.brief;
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
      <Field label="Never say">
        <Textarea dir="auto" value={draft.avoid} onChange={(e) => setDraft({ ...draft, avoid: e.target.value })} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={draft.dailyIdeas} onCheckedChange={(dailyIdeas) => setDraft({ ...draft, dailyIdeas })} /> 5 new ideas every morning
      </label>
      <div>
        <Button onClick={save}>Save profile</Button>
      </div>
    </div>
  );
}
