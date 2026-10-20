import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { build } from "../pipeline.ts";
import { loadProject } from "../project.ts";
import { renderSlides } from "../render/carousel.ts";
import { drawSlideArt, writeCarousel } from "./carousel.ts";
import { createReel } from "./reel.ts";
import { captionText, cleanHashtags } from "./rules.ts";
import { clientDir, loadClient, loadIdeas, loadPost, postDir, saveIdeas, savePost } from "./store.ts";
import type { ArtStyleId, PictureAmount } from "./styles.ts";
import type { Idea, Post, Slide } from "./types.ts";

/** "<idea id>-<format>", so one idea has one post folder. */
export function postIdFor(idea: Idea): string {
  return `${idea.id}-${idea.format}`;
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

/** Makes the idea into a post. The idea must have been claimed first (see `claimIdea`). */
export async function makePost(clientId: string, ideaId: string, log: (message: string) => void = console.log, options: { artStyle?: ArtStyleId; pictures?: PictureAmount } = {}): Promise<Post> {
  const client = await loadClient(clientId);
  const idea = (await loadIdeas(clientId, dateOf(ideaId)))?.ideas.find((i) => i.id === ideaId);
  if (!idea) throw new Error(`No idea ${ideaId}`);
  const now = new Date().toISOString();
  const artStyle = options.artStyle ?? client.artStyle ?? "flat";
  const pictures = options.pictures ?? client.pictures ?? "light";
  const post: Post = { id: postIdFor(idea), clientId, ideaId, kind: idea.format, caption: "", hashtags: [], artStyle, pictures, status: "writing", createdAt: now, updatedAt: now };
  await savePost(post);
  try {
    if (idea.format === "reel") {
      post.projectId = await createReel(client, idea, log);
      post.status = "rendering";
      await savePost(post);
      await build(post.projectId, { quality: "standard" }, log);
      const project = await loadProject(post.projectId);
      post.caption = project.marketing?.post?.caption ?? project.description;
      post.hashtags = cleanHashtags(project.marketing?.post?.hashtags ?? project.tags);
    } else {
      const written = await writeCarousel(client, idea, log, pictures);
      post.caption = written.caption;
      post.hashtags = cleanHashtags(written.hashtags);
      post.status = "drawing";
      await savePost(post);
      const dir = postDir(clientId, post.id);
      post.slides = await drawSlideArt(dir, client, written.slides, log, artStyle);
      post.status = "rendering";
      await savePost(post);
      await renderSlides(dir, client, clientDir(clientId), post.slides, log, artStyle);
    }
    await writeFile(join(postDir(clientId, post.id), "caption.txt"), captionText(post.caption, post.hashtags));
    post.status = "done";
    await savePost(post);
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
    await setIdea(clientId, ideaId, (i) => void (i.status = "new"));
    throw error;
  }
}

/** Saves edited slides or caption and renders the slides again; art is redrawn only where its prompt changed. */
export async function rerenderPost(
  clientId: string,
  postId: string,
  edits: { slides?: Slide[]; caption?: string; hashtags?: string[] },
  log: (message: string) => void = console.log,
): Promise<Post> {
  const client = await loadClient(clientId);
  const post = await loadPost(clientId, postId);
  if (edits.caption !== undefined) post.caption = edits.caption;
  if (edits.hashtags) post.hashtags = cleanHashtags(edits.hashtags);
  const dir = postDir(clientId, postId);
  if (edits.slides && post.kind !== "reel") {
    const before = post.slides ?? [];
    const slides = edits.slides.map((slide, i) => (slide.art && slide.art.prompt !== before[i]?.art?.prompt ? { ...slide, art: { prompt: slide.art.prompt } } : slide));
    post.slides = await drawSlideArt(dir, client, slides, log, post.artStyle);
    await renderSlides(dir, client, clientDir(clientId), post.slides, log, post.artStyle);
  }
  await writeFile(join(dir, "caption.txt"), captionText(post.caption, post.hashtags));
  await savePost(post);
  return post;
}
