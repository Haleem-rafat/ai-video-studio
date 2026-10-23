import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { OUTPUT_DIR } from "./config.ts";
import type { FormatId, Project } from "./types.ts";

export function projectDir(id: string): string {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`Bad project id "${id}".`);
  return join(OUTPUT_DIR, id);
}

export function newProjectId(channel: string, format: FormatId, topic: string): string {
  const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40).replace(/-$/, "");
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  const base = `${stamp}-${channel}-${format}-${slug}`;
  // Two videos in the same minute whose topics differ only in non-Latin words would share a folder.
  let id = base;
  for (let n = 2; existsSync(join(OUTPUT_DIR, id)); n++) id = `${base}-${n}`;
  return id;
}

export async function loadProject(id: string): Promise<Project> {
  return JSON.parse(await readFile(join(projectDir(id), "project.json"), "utf8")) as Project;
}

/** Writes through a temp file so a crash never leaves half a project.json. */
export async function saveProject(project: Project): Promise<void> {
  const dir = projectDir(project.id);
  await mkdir(dir, { recursive: true });
  project.updatedAt = new Date().toISOString();
  const temp = join(dir, "project.json.tmp");
  await writeFile(temp, JSON.stringify(project, null, 2));
  await rename(temp, join(dir, "project.json"));
}

export async function listProjects(): Promise<Project[]> {
  if (!existsSync(OUTPUT_DIR)) return [];

  const entries = await readdir(OUTPUT_DIR, { withFileTypes: true });
  const projects = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && existsSync(join(OUTPUT_DIR, entry.name, "project.json")))
      .map((entry) => loadProject(entry.name).catch(() => null)),
  );

  return projects.filter((project): project is Project => project !== null).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
