import type { Post } from "./types.ts";

/**
 * Exporting a client's posts in one zip: a folder per post (slides, caption,
 * art, data) and an index.csv that lists them all.
 */

export type ExportKind = Post["kind"] | "all";

/** The finished posts of a kind, oldest first. */
export function postsToExport(posts: Post[], kind: ExportKind): Post[] {
  return posts.filter((post) => post.status === "done" && (kind === "all" || post.kind === kind)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

const cell = (value: string | number) => {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const DIALECT: Record<string, string> = { egyptian: "Egyptian", gulf: "Gulf" };

/** The index of an export, as CSV with a byte-order mark so Excel reads the Arabic. `titles`: each idea's hook, by idea id. */
export function exportIndex(posts: Post[], titles: Record<string, string>): string {
  const rows = posts.map((post) =>
    [post.id, post.kind, post.createdAt.slice(0, 10), post.postAt?.replace("T", " ") ?? "", DIALECT[post.dialect ?? ""] ?? "", post.slides?.length ?? "", (post.ideaId && titles[post.ideaId]) || post.topic || "", post.caption].map(cell).join(","),
  );
  return `﻿${["folder,kind,made,post at,dialect,slides,title,caption", ...rows].join("\r\n")}\r\n`;
}
