import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { listProjects, projectDir } from "../project.ts";
import type { Project } from "../types.ts";
import { readUsage, type UsageEntry } from "../usage.ts";
import { clientDir, clientsDir, listClients, listPosts, loadClient, localDate, postDir } from "./store.ts";
import type { Client, Post } from "./types.ts";

export type LibraryItem = {
  /** The post id, or the project id of a video. */
  id: string;
  kind: "carousel" | "single" | "reel" | "video";
  title: string;
  createdAt: string;
  /** US dollars. */
  cost: number;
  status: string;
  postId?: string;
  projectId?: string;
  format?: "short" | "long";
  /** A carousel's first slide, relative to the client's folder. */
  cover?: string;
};

export type Library = {
  /** Newest first. */
  items: LibraryItem[];
  totals: { all: number; month: number; ideas: number; posts: number; videos: number };
  /** YYYY-MM-DD → what that day's ideas cost. */
  ideasByDate: Record<string, number>;
};

/** A website's host without "www.", for matching a client to its marketing videos; "" when it isn't a URL. */
export function hostOf(url: string): string {
  if (!url.trim()) return "";
  try {
    const host = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase().replace(/^www\./, "");
    return host.includes(".") ? host : "";
  } catch {
    return "";
  }
}

export function costOf(entries: UsageEntry[]): number {
  return entries.reduce((sum, entry) => sum + entry.cost, 0);
}

/** What each day's ideas cost, by the day they were written on this Mac. */
export function ideasCostByDate(entries: UsageEntry[]): Record<string, number> {
  const byDate: Record<string, number> = {};
  for (const entry of entries) {
    if (!entry.job.startsWith("Ideas: ")) continue;
    const date = localDate(new Date(entry.at));
    byDate[date] = (byDate[date] ?? 0) + entry.cost;
  }
  return byDate;
}

const titleOf = (post: Post) => (post.slides?.[0] && "title" in post.slides[0] ? post.slides[0].title : post.caption.split("\n")[0]);

/** Everything made for a client, with its cost, and the client's totals. */
export function buildLibrary(input: {
  client: Pick<Client, "url">;
  posts: Post[];
  postCosts: Record<string, number>;
  projects: Project[];
  projectCosts: Record<string, number>;
  clientEntries: UsageEntry[];
  now?: Date;
}): Library {
  const { client, posts, postCosts, projects, projectCosts, clientEntries } = input;
  const month = localDate(input.now ?? new Date()).slice(0, 7);
  const inMonth = (iso: string) => localDate(new Date(iso)).slice(0, 7) === month;
  const host = hostOf(client.url);
  const byId = new Map(projects.map((project) => [project.id, project]));
  const reelProjects = new Set(posts.map((post) => post.projectId).filter(Boolean));

  const postItems: LibraryItem[] = posts.map((post) => {
    const project = post.projectId ? byId.get(post.projectId) : undefined;
    return {
      id: post.id,
      kind: post.kind,
      title: project?.title ?? titleOf(post),
      createdAt: post.createdAt,
      cost: post.projectId ? (projectCosts[post.projectId] ?? 0) + (postCosts[post.id] ?? 0) : (postCosts[post.id] ?? 0),
      status: post.status,
      postId: post.id,
      ...(post.projectId ? { projectId: post.projectId, format: project?.format } : {}),
      ...(post.kind !== "reel" && post.slides?.length ? { cover: `posts/${post.id}/slides/01.png` } : {}),
    };
  });
  const videoItems: LibraryItem[] = projects
    .filter((project) => host && project.marketing && hostOf(project.marketing.brand.url) === host && !reelProjects.has(project.id))
    .map((project) => ({
      id: project.id,
      kind: "video",
      title: project.title,
      createdAt: project.createdAt,
      cost: projectCosts[project.id] ?? 0,
      status: project.render ? "done" : "draft",
      projectId: project.id,
      format: project.format,
    }));

  const items = [...postItems, ...videoItems].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const ideasByDate = ideasCostByDate(clientEntries);
  const sum = (list: { cost: number }[]) => list.reduce((total, item) => total + item.cost, 0);
  const posts$ = sum(postItems.filter((item) => item.kind !== "reel"));
  const videos$ = sum(postItems.filter((item) => item.kind === "reel")) + sum(videoItems);
  const ideas$ = costOf(clientEntries.filter((entry) => entry.job.startsWith("Ideas: ")));
  const own$ = costOf(clientEntries);
  return {
    items,
    totals: {
      posts: posts$,
      videos: videos$,
      ideas: ideas$,
      all: posts$ + videos$ + own$,
      month: sum(items.filter((item) => inMonth(item.createdAt))) + costOf(clientEntries.filter((entry) => inMonth(entry.at))),
    },
    ideasByDate,
  };
}

/** Reads a client's posts, projects and cost files, then builds its library. */
export async function loadLibrary(clientId: string): Promise<Library> {
  const client = await loadClient(clientId);
  const [posts, projects, clientEntries] = await Promise.all([listPosts(clientId), listProjects(), readUsage(clientDir(clientId))]);
  const host = hostOf(client.url);
  const linked = new Set(posts.map((post) => post.projectId).filter(Boolean));
  const mine = projects.filter((project) => linked.has(project.id) || (host && project.marketing && hostOf(project.marketing.brand.url) === host));
  const postCosts = Object.fromEntries(await Promise.all(posts.map(async (post) => [post.id, costOf(await readUsage(postDir(clientId, post.id)))] as const)));
  const projectCosts = Object.fromEntries(await Promise.all(mine.map(async (project) => [project.id, costOf(await readUsage(projectDir(project.id)))] as const)));
  return buildLibrary({ client, posts, postCosts, projects: mine, projectCosts, clientEntries });
}

/** Every client folder and post folder: where costs of Instagram work are written, for the studio total. */
export async function usageFolders(): Promise<string[]> {
  if (!existsSync(clientsDir())) return [];
  const folders: string[] = [];
  for (const client of await listClients()) {
    folders.push(clientDir(client.id));
    const posts = join(clientDir(client.id), "posts");
    if (existsSync(posts)) for (const entry of await readdir(posts, { withFileTypes: true })) if (entry.isDirectory()) folders.push(join(posts, entry.name));
  }
  return folders;
}
