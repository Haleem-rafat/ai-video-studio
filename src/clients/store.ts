import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { OUTPUT_DIR } from "../config.ts";
import type { Project } from "../types.ts";
import type { Client, Idea, IdeaDay, Post } from "./types.ts";

/** output/.clients, or CLIENTS_DIR in tests. */
export function clientsDir(): string {
  return process.env.CLIENTS_DIR ?? join(OUTPUT_DIR, ".clients");
}

const ID = /^[a-z0-9-]+$/;

export function clientDir(id: string): string {
  if (!ID.test(id)) throw new Error(`Bad client id "${id}".`);
  return join(clientsDir(), id);
}

export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40).replace(/-$/, "");
}

/** YYYY-MM-DD on this Mac's calendar. */
export function localDate(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Writes through a temp file so a crash never leaves half a JSON file. */
async function writeJson(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(`${path}.tmp`, JSON.stringify(data, null, 2));
  await rename(`${path}.tmp`, path);
}

export async function loadClient(id: string): Promise<Client> {
  return JSON.parse(await readFile(join(clientDir(id), "client.json"), "utf8")) as Client;
}

export async function saveClient(client: Client): Promise<void> {
  client.updatedAt = new Date().toISOString();
  await writeJson(join(clientDir(client.id), "client.json"), client);
}

export async function listClients(): Promise<Client[]> {
  if (!existsSync(clientsDir())) return [];
  const entries = await readdir(clientsDir(), { withFileTypes: true });
  const clients = await Promise.all(entries.filter((e) => e.isDirectory() && ID.test(e.name)).map((e) => loadClient(e.name).catch(() => null)));
  return clients.filter((c): c is Client => c !== null).sort((a, b) => a.name.localeCompare(b.name));
}

export function ideasPath(id: string, date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Bad date "${date}".`);
  return join(clientDir(id), "ideas", `${date}.json`);
}

export async function loadIdeas(id: string, date: string): Promise<IdeaDay | null> {
  const path = ideasPath(id, date);
  return existsSync(path) ? (JSON.parse(await readFile(path, "utf8")) as IdeaDay) : null;
}

export async function saveIdeas(id: string, day: IdeaDay): Promise<void> {
  await writeJson(ideasPath(id, day.date), day);
}

/** Every idea of the `days` days up to `today` (today included), oldest first. */
export async function recentIdeas(id: string, today: string, days: number): Promise<Idea[]> {
  const dir = join(clientDir(id), "ideas");
  if (!existsSync(dir)) return [];
  const from = new Date(`${today}T00:00:00`);
  from.setDate(from.getDate() - (days - 1));
  const first = localDate(from);
  const files = (await readdir(dir)).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f) && f.slice(0, 10) >= first && f.slice(0, 10) <= today).sort();
  const daysRead = await Promise.all(files.map(async (f) => JSON.parse(await readFile(join(dir, f), "utf8")) as IdeaDay));
  return daysRead.flatMap((day) => day.ideas);
}

export function postDir(clientId: string, postId: string): string {
  if (!ID.test(postId)) throw new Error(`Bad post id "${postId}".`);
  return join(clientDir(clientId), "posts", postId);
}

export async function loadPost(clientId: string, postId: string): Promise<Post> {
  return JSON.parse(await readFile(join(postDir(clientId, postId), "post.json"), "utf8")) as Post;
}

export async function savePost(post: Post): Promise<void> {
  post.updatedAt = new Date().toISOString();
  await writeJson(join(postDir(post.clientId, post.id), "post.json"), post);
}

export async function listPosts(clientId: string): Promise<Post[]> {
  const dir = join(clientDir(clientId), "posts");
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const posts = await Promise.all(entries.filter((e) => e.isDirectory() && ID.test(e.name)).map((e) => loadPost(clientId, e.name).catch(() => null)));
  return posts.filter((p): p is Post => p !== null).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** A client from a marketing project: its brand and brief, no website read. The niche is filled in later. */
export function clientFromProject(project: Project, now = new Date().toISOString()): Client {
  const m = project.marketing;
  if (!m) throw new Error(`${project.id} is not a marketing project.`);
  return {
    id: slugify(m.brand.name) || `client-${Date.now().toString(36)}`,
    name: m.brand.name,
    url: m.brand.url,
    language: m.brand.language === "en" ? "en" : "ar",
    brand: m.brand,
    brief: m.brief,
    niche: "",
    avoid: m.brief.notes ?? "",
    dailyIdeas: true,
    createdAt: now,
    updatedAt: now,
  };
}
