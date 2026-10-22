import { existsSync } from "node:fs";
import { readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { build } from "../pipeline.ts";
import { loadProject } from "../project.ts";
import type { Project } from "../types.ts";
import { renderSlides } from "../render/carousel.ts";
import type { DesignChoice, DesignId } from "./designs.ts";
import type { FormatId } from "./formats.ts";
import type { ReelStyleId } from "./reel-styles.ts";
import { drawSlideArt, writeCarousel } from "./carousel.ts";
import { createReel } from "./reel.ts";
import { captionText, cleanHashtags } from "./rules.ts";
import { clientDir, listPosts, loadClient, loadIdeas, loadPost, postDir, saveIdeas, savePost } from "./store.ts";
import { autoFormat, chooseDesign, loadHistory } from "./history.ts";
import { pickRotation, type ArtStyleChoice, type PictureAmount } from "./styles.ts";
import type { Idea, Post, Slide } from "./types.ts";

/** "<idea id>-<format>", so one idea has one post folder. */
/** The post's folder name: the idea and its kind, plus the variant when several are made to compare. */
export function postIdFor(idea: Pick<Idea, "id" | "format">, variant?: string): string {
  return `${idea.id}-${idea.format}${variant ? `-${variant}` : ""}`;
}

/**
 * A marketing video's message as an idea of the chosen kind, numbered after
 * the day's ideas: the post's first line is the hook, the narration the outline.
 */
export function ideaFromProject(project: Project, format: Idea["format"], date: string, existing: Pick<Idea, "id">[]): Idea {
  const next = Math.max(0, ...existing.map((idea) => Number(idea.id.slice(11)) || 0)) + 1;
  const first = (project.marketing?.post?.caption ?? "").split("\n").map((line) => line.trim()).find(Boolean);
  return {
    id: `${date}-${next}`,
    format,
    goal: "details",
    angle: "trend",
    hook: first || project.title,
    outline: project.scenes.map((scene) => scene.narration.trim()).filter(Boolean).slice(0, 6),
    why: `From the marketing video “${project.title}”.`,
    status: "new",
    fromProject: project.id,
  };
}

const dateOf = (ideaId: string) => ideaId.slice(0, 10);

async function setIdea(clientId: string, ideaId: string, change: (idea: Idea) => void): Promise<Idea> {
  const day = await loadIdeas(clientId, dateOf(ideaId));
  const idea = day?.ideas.find((i) => i.id === ideaId);
  if (!day || !idea) throw new Error(`No idea ${ideaId}`);
  change(idea);
  await saveIdeas(clientId, day);
  return idea;
}

/** Marks an idea as being made; a second make of the same idea is refused. */
export async function claimIdea(clientId: string, date: string, ideaId: string): Promise<Idea> {
  if (dateOf(ideaId) !== date) throw new Error(`Idea ${ideaId} is not from ${date}`);
  return setIdea(clientId, ideaId, (idea) => {
    if (idea.status === "making") throw new Error("This idea is already being made.");
    if (idea.status === "made") throw new Error("This idea was already made; open its post.");
    idea.status = "making";
  });
}

/**
 * Jobs don't survive the studio stopping. Ideas left "making" become makeable
 * again and their unfinished posts are marked failed. Returns how many ideas were freed.
 */
export async function recoverInterrupted(clientId: string): Promise<number> {
  let freed = 0;
  const dir = join(clientDir(clientId), "ideas");
  for (const file of existsSync(dir) ? (await readdir(dir)).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)) : []) {
    const day = await loadIdeas(clientId, file.slice(0, 10));
    const stuck = day?.ideas.filter((idea) => idea.status === "making") ?? [];
    if (!day || !stuck.length) continue;
    // A compare stopped half way keeps the variants it made.
    for (const idea of stuck) idea.status = idea.variants?.length ? "made" : "new";
    freed += stuck.length;
    await saveIdeas(clientId, day);
  }
  for (const post of await listPosts(clientId)) {
    if (post.status === "done" || post.status === "failed") continue;
    post.status = "failed";
    post.error = "Interrupted: the studio stopped while it was being made. Make the idea again.";
    await savePost(post);
  }
  return freed;
}

export type MakeOptions = {
  artStyle?: ArtStyleChoice;
  pictures?: PictureAmount;
  design?: DesignChoice;
  format?: FormatId | "auto";
  reelStyle?: ReelStyleId | "auto";
  /** One of several posts made from the idea to compare: its folder gets this suffix, and `compareVariant` records it on the idea. */
  variant?: string;
};

/** Makes the idea into a post. The idea must have been claimed first (see `claimIdea`); a variant leaves the idea to `compareVariant`. */
export async function makePost(clientId: string, ideaId: string, log: (message: string) => void = console.log, options: MakeOptions = {}): Promise<Post> {
  const client = await loadClient(clientId);
  const idea = (await loadIdeas(clientId, dateOf(ideaId)))?.ideas.find((i) => i.id === ideaId);
  if (!idea) throw new Error(`No idea ${ideaId}`);
  const now = new Date().toISOString();
  const history = await loadHistory(clientId);
  // A client that never chose an art style gets a different one each post.
  const choice = options.artStyle ?? client.artStyle ?? "rotate";
  const artStyle = choice === "rotate" ? pickRotation(history.filter((made) => made.kind === "carousel" || made.kind === "single")) : choice;
  const pictures = options.pictures ?? client.pictures ?? "light";
  // Rotate and Auto never repeat the look or structure of the last posts.
  const design = chooseDesign(options.design ?? client.design, history);
  const format = options.format === "auto" ? autoFormat(idea, history) : options.format;
  const post: Post = { id: postIdFor(idea, options.variant), clientId, ideaId, kind: idea.format, caption: "", hashtags: [], artStyle, pictures, ...(design && idea.format !== "reel" ? { design } : {}), status: "writing", createdAt: now, updatedAt: now };
  await savePost(post);
  try {
    if (idea.format === "reel") {
      const reel = await createReel(client, idea, log, history, options.reelStyle);
      post.projectId = reel.projectId;
      if (reel.reelStyle && reel.reelStyle !== "classic") post.reelStyle = reel.reelStyle;
      if (reel.review) post.review = reel.review;
      post.status = "rendering";
      await savePost(post);
      await build(post.projectId, { quality: "standard" }, log);
      const project = await loadProject(post.projectId);
      post.caption = project.marketing?.post?.caption ?? project.description;
      post.hashtags = cleanHashtags(project.marketing?.post?.hashtags ?? project.tags);
    } else {
      const pastTitles = history.filter((made) => made.kind === "carousel" || made.kind === "single").flatMap((made) => [made.title, ...made.lines.slice(0, 6)]);
      const recentOrders = history.filter((made) => made.kind === "carousel" && made.layouts?.length).map((made) => made.layouts!);
      // Pictures of the client's carousels and reels alike: no picture is used twice.
      const recentPictures = history.flatMap((made) => made.pictures ?? []);
      const written = await writeCarousel(client, idea, log, pictures, pastTitles, format, recentOrders, recentPictures);
      if (written.format) post.postFormat = written.format;
      post.caption = written.caption;
      if (written.review) post.review = written.review;
      post.hashtags = cleanHashtags(written.hashtags);
      post.status = "drawing";
      await savePost(post);
      const dir = postDir(clientId, post.id);
      post.slides = await drawSlideArt(dir, client, written.slides, log, artStyle);
      post.status = "rendering";
      await savePost(post);
      await renderSlides(dir, client, clientDir(clientId), post.slides, log, artStyle, post.design);
    }
    await writeFile(join(postDir(clientId, post.id), "caption.txt"), captionText(post.caption, post.hashtags));
    post.status = "done";
    await savePost(post);
    if (!options.variant)
      await setIdea(clientId, ideaId, (i) => {
        i.status = "made";
        i.postId = post.id;
      });
    return post;
  } catch (error) {
    post.status = "failed";
    post.error = error instanceof Error ? error.message : String(error);
    await savePost(post);
    // The idea can be made again.
    if (!options.variant) await setIdea(clientId, ideaId, (i) => void (i.status = "new"));
    throw error;
  }
}

/**
 * Makes one of several variants of a claimed idea, to compare them. The idea
 * lists every variant made and is "made" once one is; when the last variant
 * is done and none was made, it can be made again.
 */
export async function compareVariant(clientId: string, ideaId: string, options: MakeOptions & { variant: string }, last: boolean, log: (message: string) => void = console.log): Promise<Post | null> {
  try {
    const post = await makePost(clientId, ideaId, log, options);
    await setIdea(clientId, ideaId, (i) => {
      i.variants = [...(i.variants ?? []), post.id];
      i.postId ??= post.id;
      i.status = "made";
    });
    return post;
  } catch (error) {
    if (last) await setIdea(clientId, ideaId, (i) => void (i.status = i.variants?.length ? "made" : "new"));
    throw error;
  }
}

/**
 * Saves edited slides or caption and renders the slides again; art is redrawn
 * only where its prompt changed. A new design only redraws the slides: no AI.
 */
export async function rerenderPost(
  clientId: string,
  postId: string,
  edits: { slides?: Slide[]; caption?: string; hashtags?: string[]; design?: DesignId },
  log: (message: string) => void = console.log,
): Promise<Post> {
  const client = await loadClient(clientId);
  const post = await loadPost(clientId, postId);
  if (edits.caption !== undefined) post.caption = edits.caption;
  if (edits.hashtags) post.hashtags = cleanHashtags(edits.hashtags);
  const dir = postDir(clientId, postId);
  if (edits.design && post.kind !== "reel") post.design = edits.design;
  if ((edits.slides || edits.design) && post.kind !== "reel" && post.slides) {
    const before = post.slides;
    const slides = (edits.slides ?? before).map((slide, i) => (slide.art && slide.art.prompt !== before[i]?.art?.prompt ? { ...slide, art: { prompt: slide.art.prompt } } : slide));
    post.slides = await drawSlideArt(dir, client, slides, log, post.artStyle);
    await renderSlides(dir, client, clientDir(clientId), post.slides, log, post.artStyle, post.design);
  }
  await writeFile(join(dir, "caption.txt"), captionText(post.caption, post.hashtags));
  await savePost(post);
  return post;
}
