import type { Channel } from "../src/config.ts";
import type { FormatId, Project, Scene, StyleId } from "../src/types.ts";

export type { Channel, FormatId, Project, Scene, StyleId };

export type SceneState = Scene & { voiceCurrent: boolean; imageCurrent: boolean };
export type ProjectState = Omit<Project, "scenes"> & { scenes: SceneState[]; hasComposition: boolean; hasVideo: boolean };
export type ProjectSummary = Omit<Project, "scenes"> & { sceneCount: number; hasVideo: boolean };

export type Job = {
  id: string;
  label: string;
  projectId?: string;
  status: "queued" | "running" | "done" | "failed";
  log: string[];
  result?: unknown;
  error?: string;
  createdAt: number;
  finishedAt?: number;
};

export type Status = {
  llm: boolean;
  llmStarting: boolean;
  llmLog: string[];
  credit: { used: number; limit: number } | null;
  jobs: Job[];
};

export type TopicIdea = { topic: string; title: string; why: string };

async function call<T>(method: string, path: string, data?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: data === undefined ? undefined : { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((result as { error?: string }).error ?? `${response.status}`);
  return result as T;
}

export const api = {
  status: () => call<Status>("GET", "/api/status"),
  startLlm: () => call("POST", "/api/llm/start"),
  channels: () => call<Channel[]>("GET", "/api/channels"),
  topics: (channel: string, format: FormatId, focus: string) => call<Job>("POST", "/api/topics", { channel, format, focus }),
  job: (id: string) => call<Job>("GET", `/api/jobs/${id}`),
  projects: () => call<ProjectSummary[]>("GET", "/api/projects"),
  project: (id: string) => call<ProjectState>("GET", `/api/projects/${id}`),
  create: (channel: string, format: FormatId, topic: string, style: StyleId) => call<Job>("POST", "/api/projects", { channel, format, topic, style }),
  save: (id: string, edits: Partial<Project>) => call<ProjectState>("PUT", `/api/projects/${id}`, edits),
  remove: (id: string) => call("DELETE", `/api/projects/${id}`),
  build: (id: string, images: boolean) => call<Job>("POST", `/api/projects/${id}/build`, { images }),
  render: (id: string, quality: "draft" | "standard" | "high") => call<Job>("POST", `/api/projects/${id}/render`, { quality }),
  factCheck: (id: string) => call<Job>("POST", `/api/projects/${id}/factcheck`),
};

/** Same spacing the composition uses, so the timeline matches the preview. */
export const SCENE_GAP = 0.3;

export function sceneSeconds(scene: Scene): number {
  if (scene.audio && scene.audio.text === scene.narration) return scene.audio.seconds + SCENE_GAP;
  // Unvoiced: estimate at ElevenLabs' ~2.5 words a second.
  return scene.narration.split(/\s+/).filter(Boolean).length / 2.5 + SCENE_GAP;
}

export function newSceneId(): string {
  return `s${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

export function formatTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
