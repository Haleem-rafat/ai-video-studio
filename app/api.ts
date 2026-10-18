import type { Channel } from "../src/config.ts";
import type { FormatId, Project, Scene, StyleId } from "../src/types.ts";

export type { Channel, FormatId, Project, Scene, StyleId };

export type SceneState = Scene & { voiceCurrent: boolean; imageCurrent: boolean };
/** `timing`: where each scene really sits in a versus or deep-dive video (they have an intro and gaps). */
export type ProjectState = Omit<Project, "scenes"> & { scenes: SceneState[]; hasComposition: boolean; hasVideo: boolean; timing?: { starts: number[]; lengths: number[] } };
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
  createChannel: (name: string, language: "en" | "ar") => call<Channel>("POST", "/api/channels", { name, language }),
  saveChannel: (id: string, edits: Partial<Channel>) => call<Channel>("PUT", `/api/channels/${id}`, edits),
  addBrandPicture: (id: string, kind: BrandPictureKind, data: string) => call<Channel>("POST", `/api/channels/${id}/assets`, { kind, data }),
  removeBrandPicture: (id: string, file: string) => call<Channel>("DELETE", `/api/channels/${id}/assets/${file}`),
  importChannel: (id: string) => call<Job>("POST", `/api/channels/${id}/import`),
  readStyle: (id: string) => call<Job>("POST", `/api/channels/${id}/style`),
  cloneVoice: (id: string, data: string) => call<Job>("POST", `/api/channels/${id}/voice`, { data, consent: true }),
  makeCharacter: (id: string, description: string) => call<Job>("POST", `/api/channels/${id}/character`, { description }),
  topics: (channel: string, format: FormatId, focus: string) => call<Job>("POST", "/api/topics", { channel, format, focus }),
  job: (id: string) => call<Job>("GET", `/api/jobs/${id}`),
  projects: () => call<ProjectSummary[]>("GET", "/api/projects"),
  project: (id: string) => call<ProjectState>("GET", `/api/projects/${id}`),
  create: (channel: string, format: FormatId, topic: string, style: StyleId) => call<Job>("POST", "/api/projects", { channel, format, topic, style }),
  save: (id: string, edits: Partial<Project>) => call<ProjectState>("PUT", `/api/projects/${id}`, edits),
  remove: (id: string) => call("DELETE", `/api/projects/${id}`),
  build: (id: string, images: boolean) => call<Job>("POST", `/api/projects/${id}/build`, { images }),
  scenePhoto: (id: string, target: string, data: string) => call<ProjectState>("POST", `/api/projects/${id}/photo/${target}`, { data }),
  productPhoto: (id: string, side: "a" | "b", data: string) => call<ProjectState>("POST", `/api/projects/${id}/product/${side}`, { data }),
  render: (id: string, quality: "draft" | "standard" | "high") => call<Job>("POST", `/api/projects/${id}/render`, { quality }),
  factCheck: (id: string) => call<Job>("POST", `/api/projects/${id}/factcheck`),
  youtube: () => call<YouTubeStatus>("GET", "/api/youtube"),
  connectYouTube: (channel: string) => call<Job>("POST", `/api/youtube/${channel}/connect`),
  publish: (id: string, options: { privacy: Privacy; publishAt?: string; force?: boolean }) => call<Job>("POST", `/api/projects/${id}/publish`, options),
};

export type Privacy = "private" | "unlisted" | "public";

export type BrandPictureKind = "logo" | "banner" | "mascot" | "reference" | "photo";

export const brandUrl = (channel: string, file: string) => `/brand/${channel}/${file}`;

/** The fonts a channel can use: system fonts, so every render has them. Mirrors FONTS in src/brand/brand.ts. */
export const CHANNEL_FONTS: Record<string, string> = {
  "Avenir Next": "'Avenir Next', Helvetica, sans-serif",
  "SF Mono": "'SF Mono', Menlo, monospace",
  "Chalkboard": "'Chalkboard SE', 'Comic Sans MS', sans-serif",
  "Arabic (SF Arabic)": "'SF Arabic', 'Geeza Pro', 'Avenir Next', sans-serif",
  "Arabic rounded (Baghdad)": "'Baghdad', 'Geeza Pro', sans-serif",
};

/** Whether uploads are set up, and the YouTube channel each studio channel is signed in to (null = not yet). */
export type YouTubeStatus = { configured: boolean; via: "desktop-client" | "framecast" | null; channels: Record<string, { title: string } | null> };

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
