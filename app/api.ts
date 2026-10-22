import type { Channel } from "../src/config.ts";
import type { Creativity, FormatId, MarketingBrief, Project, Scene, SiteBrand, StyleId } from "../src/types.ts";
import type { ChatMessage, Session } from "../src/marketing/session.ts";
import type { UsageEntry, UsageSummary } from "../src/usage.ts";
import type { Progress } from "../src/server/jobs.ts";
import type { Client, Idea, IdeaDay, Post, Slide, Trend } from "../src/clients/types.ts";
import type { Library, LibraryItem } from "../src/clients/library.ts";
import type { Knowledge } from "../src/clients/knowledge.ts";
import type { Promo } from "../src/promo/store.ts";
import type { PromoOptions } from "../src/promo/record.ts";
import type { ProfileView } from "../src/clients/profile.ts";
import type { AnswerError, Purpose, Value } from "../src/clients/questionnaire.ts";
import type { Preview as ChatPreview } from "../src/clients/client-prompt.ts";
import type { ArtStyleChoice, ArtStyleId, PictureAmount } from "../src/clients/styles.ts";
import type { DesignId } from "../src/clients/designs.ts";
import type { FormatId as PostFormatId } from "../src/clients/formats.ts";
import type { ReelStyleId } from "../src/clients/reel-styles.ts";
import type { Currency, Invoice, InvoiceItem, InvoiceState, InvoiceView, Payment, PaymentMethod } from "../src/clients/invoices.ts";
export type { Currency, Invoice, InvoiceItem, InvoiceState, InvoiceView, Payment, PaymentMethod };

export type { Knowledge, Promo, PromoOptions };
export type { AnswerError, ChatPreview, ProfileView, Purpose, Value };
export type ImportPreview = { count: number; answers: Record<string, Value>; errors: AnswerError[] };
/** A promo with whether its music can change without recording again. */
export type PromoState = Promo & { canChangeMusic: boolean };
export type { ArtStyleChoice, ArtStyleId, Client, Idea, IdeaDay, Library, LibraryItem, PictureAmount, Post, Slide, Trend };
export type ArtStyleInfo = { id: ArtStyleId; label: string; preview: boolean };
export type { DesignId, PostFormatId, ReelStyleId };
export type ReelStyleInfo = { id: ReelStyleId; label: { en: string; ar: string }; description: { en: string; ar: string } };
export type FormatInfo = { id: PostFormatId; label: { en: string; ar: string }; description: { en: string; ar: string } };
/** A carousel design, with which of its previews exist for the client asked about. */
export type DesignInfo = { id: DesignId; label: { en: string; ar: string }; description: { en: string; ar: string }; previews: string[] };
export type { Channel, ChatMessage, Creativity, FormatId, MarketingBrief, Progress, Project, Scene, Session, SiteBrand, StyleId, UsageEntry, UsageSummary };

/** What one video, or the whole studio, has cost. */
export type ProjectUsage = { entries: UsageEntry[]; summary: UsageSummary };
export type StudioUsage = { total: UsageSummary; month: UsageSummary; videos: number; perVideo: number; balance: number | null };

export type SceneState = Scene & { voiceCurrent: boolean; imageCurrent: boolean };
/** `timing`: where each scene really sits in a versus or deep-dive video (they have an intro and gaps). */
export type ProjectState = Omit<Project, "scenes"> & { scenes: SceneState[]; hasComposition: boolean; hasVideo: boolean; timing?: { starts: number[]; lengths: number[] } };
export type ProjectSummary = Omit<Project, "scenes"> & { sceneCount: number; hasVideo: boolean; cost: number };

export type Job = {
  id: string;
  label: string;
  projectId?: string;
  /** The studio page that shows this job's work. */
  link?: string;
  status: "queued" | "running" | "done" | "failed";
  log: string[];
  /** Every stage reached so far; the last one is current. */
  stages: Progress[];
  /** US dollars spent on AI so far. */
  cost: number;
  startedAt?: number;
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
  create: (channel: string, format: FormatId | "both", topic: string, style: StyleId) => call<Job>("POST", "/api/projects", { channel, format, topic, style }),
  usage: (id: string) => call<ProjectUsage>("GET", `/api/projects/${id}/usage`),
  studioUsage: () => call<StudioUsage>("GET", "/api/usage"),
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
  marketingScript: (language: "en" | "ar") => call<{ script: string }>("GET", `/api/marketing/script?language=${language}`),
  marketingSessions: () => call<Session[]>("GET", "/api/marketing"),
  startMarketing: (input: { url: string; language: "en" | "ar"; format: FormatId | "both"; creativity: Creativity; script: string }) => call<{ session: Session; job: Job }>("POST", "/api/marketing", input),
  marketingSession: (id: string) => call<Session>("GET", `/api/marketing/${id}`),
  editMarketing: (id: string, edits: { brief?: Partial<MarketingBrief>; script?: string; colors?: Record<string, string> }) => call<Session>("PUT", `/api/marketing/${id}`, edits),
  sendMarketing: (id: string, text: string) => call<Session>("POST", `/api/marketing/${id}/messages`, { text }),
  createMarketing: (id: string) => call<Job>("POST", `/api/marketing/${id}/create`),
  clients: () => call<Client[]>("GET", "/api/clients"),
  client: (id: string) => call<Client>("GET", `/api/clients/${id}`),
  newClient: (input: { fromProject?: string; url?: string }) => call<Job>("POST", "/api/clients", input),
  editClient: (id: string, edits: Partial<Pick<Client, "name" | "instagramHandle" | "language" | "niche" | "avoid" | "dailyIdeas" | "brief" | "artStyle" | "pictures" | "pronounce" | "knowledge" | "design">>) => call<Client>("PUT", `/api/clients/${id}`, edits),
  ideas: (id: string, date?: string) => call<IdeaDay>("GET", `/api/clients/${id}/ideas${date ? `?date=${date}` : ""}`),
  moreIdeas: (id: string) => call<Job>("POST", `/api/clients/${id}/ideas`),
  formats: () => call<FormatInfo[]>("GET", "/api/clients/formats"),
  postDesigns: (id: string, postId: string) => call<DesignId[]>("GET", `/api/clients/${id}/posts/${postId}/designs`),
  drawPostDesigns: (id: string, postId: string) => call<Job>("POST", `/api/clients/${id}/posts/${postId}/designs`),
  compareIdea: (id: string, ideaId: string, variants: string[], options: { artStyle?: ArtStyleChoice; pictures?: PictureAmount; design?: DesignId | "rotate" } = {}) =>
    call<Job[]>("POST", `/api/clients/${id}/ideas/${ideaId}/compare`, { variants, ...options }),
  /** Marketing mode: a marketing video's message made into a post for its website's client. */
  makeFromProject: (projectId: string, input: { format: "carousel" | "single" | "reel"; postFormat?: PostFormatId | "auto"; reelStyle?: ReelStyleId | "auto"; pictures?: PictureAmount; design?: DesignId | "rotate"; force?: boolean }) =>
    call<{ job: Job; clientId: string; ideaId: string }>("POST", `/api/clients/from-project/${projectId}/make`, input),
  reelStyles: () => call<ReelStyleInfo[]>("GET", "/api/clients/reel-styles"),
  designs: (clientId?: string) => call<DesignInfo[]>("GET", `/api/clients/designs${clientId ? `?client=${clientId}` : ""}`),
  drawDesignPreviews: (id: string) => call<Job>("POST", `/api/clients/${id}/designs/previews`),
  makeIdea: (id: string, ideaId: string, options: { artStyle?: ArtStyleChoice; pictures?: PictureAmount; design?: DesignId | "rotate"; format?: PostFormatId | "auto"; reelStyle?: ReelStyleId | "auto"; force?: boolean } = {}) => call<Job>("POST", `/api/clients/${id}/ideas/${ideaId}/make`, options),
  artStyles: () => call<ArtStyleInfo[]>("GET", "/api/clients/styles"),
  drawStylePreviews: () => call<Job>("POST", "/api/clients/styles/previews"),
  skipIdea: (id: string, ideaId: string) => call<IdeaDay>("POST", `/api/clients/${id}/ideas/${ideaId}/skip`),
  posts: (id: string) => call<Post[]>("GET", `/api/clients/${id}/posts`),
  library: (id: string) => call<Library>("GET", `/api/clients/${id}/library`),
  draftKnowledge: (id: string) => call<Job>("POST", `/api/clients/${id}/knowledge/draft`),
  answerKnowledge: (id: string, questionId: string, answer: string) => call<Job>("POST", `/api/clients/${id}/knowledge/answer`, { questionId, answer }),
  profile: (id: string) => call<ProfileView>("GET", `/api/clients/${id}/profile`),
  saveProfile: (id: string, answers: Record<string, Value>, confirmed: string[] = []) => call<ProfileView & { errors: AnswerError[] }>("PUT", `/api/clients/${id}/profile`, { answers, confirmed }),
  clientPrompt: (id: string, lang: "en" | "ar") => call<{ lang: string; text: string }>("GET", `/api/clients/${id}/profile/prompt?lang=${lang}`),
  /** The exact block comes back read at once; free text starts an AI job whose result is the preview. */
  readClientAnswers: (id: string, text: string) => call<{ preview?: ChatPreview; job?: Job }>("POST", `/api/clients/${id}/profile/chat`, { text }),
  saveClientAnswers: (id: string, answers: Record<string, Value>, redraftKnowledge: boolean) =>
    call<ProfileView & { errors: AnswerError[]; job?: Job }>("POST", `/api/clients/${id}/profile/chat/save`, { answers, redraftKnowledge }),
  profileContext: (id: string, purpose: Purpose) => call<{ purpose: Purpose; text: string }>("GET", `/api/clients/${id}/profile/context?purpose=${purpose}`),
  /** Reads a filled questionnaire; with `dryRun` nothing is saved. */
  importProfile: async <T,>(id: string, file: File, options: { dryRun?: boolean; force?: boolean } = {}): Promise<T> => {
    const format = /\.json$/i.test(file.name) ? "json" : "docx";
    const query = new URLSearchParams({ format, ...(options.dryRun ? { dryRun: "1" } : {}), ...(options.force ? { force: "1" } : {}) });
    const response = await fetch(`/api/clients/${id}/profile/import?${query}`, { method: "POST", body: file });
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(data.error ?? `Import failed (${response.status})`), { status: response.status });
    return data as T;
  },
  promos: () => call<PromoState[]>("GET", "/api/promos"),
  promo: (id: string) => call<PromoState>("GET", `/api/promos/${id}`),
  renamePromo: (id: string, title: string) => call<PromoState>("PUT", `/api/promos/${id}`, { title }),
  changePromoMusic: (id: string, music: string) => call<Job>("POST", `/api/promos/${id}/music`, { music }),
  renameTrack: (file: string, name: string) => call<{ file: string }>("PUT", `/api/promos/music/${file}`, { name }),
  deleteTrack: (file: string) => call<{ deleted: string }>("DELETE", `/api/promos/music/${file}`),
  newTrack: (mood: string) => call<Job>("POST", "/api/promos/music/new", { mood }),
  /** Sends the song's bytes as they are; the server checks it is audio. */
  uploadTrack: async (file: File) => {
    const response = await fetch(`/api/promos/music?name=${encodeURIComponent(file.name)}`, { method: "POST", body: file });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? `Upload failed (${response.status})`);
    return data as { file: string; seconds: number };
  },
  promoMusic: () => call<{ file: string; seconds: number }[]>("GET", "/api/promos/music"),
  deletePromo: (id: string) => call<{ deleted: string[] }>("DELETE", `/api/promos/${id}`),
  deleteFailedPromos: () => call<{ deleted: string[] }>("DELETE", "/api/promos/failed"),
  makePromo: (url: string, options?: PromoOptions) => call<Job & { promoId: string }>("POST", "/api/promos", { url, ...options }),
  editPost: (id: string, postId: string, edits: { slides?: Slide[]; caption?: string; hashtags?: string[]; design?: DesignId }) => call<Job>("PUT", `/api/clients/${id}/posts/${postId}`, edits),
  post: (id: string, postId: string) => call<Post>("GET", `/api/clients/${id}/posts/${postId}`),
  deletePost: (id: string, postId: string) => call<{ ok: true }>("DELETE", `/api/clients/${id}/posts/${postId}`),
  setPostAt: (id: string, postId: string, postAt: string) => call<Post>("PATCH", `/api/clients/${id}/posts/${postId}`, { postAt }),
  setIdeaPostAt: (id: string, ideaId: string, postAt: string) => call<Idea>("PATCH", `/api/clients/${id}/ideas/${ideaId}`, { postAt }),
  /** One slide as the carousel editor's live preview (HTML, $0). */
  slidePreview: async (id: string, postId: string, input: { slide: Slide; index: number; total: number; design?: DesignId }) => {
    const response = await fetch(`/api/clients/${id}/posts/${postId}/preview`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    if (!response.ok) throw new Error(((await response.json().catch(() => ({}))) as { error?: string }).error ?? `${response.status}`);
    return response.text();
  },
  invoices: (id: string) => call<{ invoices: InvoiceView[]; summary: Record<string, { invoiced: number; paid: number; outstanding: number; overdue: number }> }>("GET", `/api/clients/${id}/invoices`),
  createInvoice: (id: string, input: Partial<Invoice> = {}) => call<InvoiceView>("POST", `/api/clients/${id}/invoices`, input),
  saveInvoice: (id: string, invoiceId: string, input: Partial<Invoice>) => call<InvoiceView>("PUT", `/api/clients/${id}/invoices/${invoiceId}`, input),
  deleteInvoice: (id: string, invoiceId: string) => call<{ ok: true }>("DELETE", `/api/clients/${id}/invoices/${invoiceId}`),
  addPayment: (id: string, invoiceId: string, payment: Omit<Payment, "id">) => call<InvoiceView>("POST", `/api/clients/${id}/invoices/${invoiceId}/payments`, payment),
  deletePayment: (id: string, invoiceId: string, paymentId: string) => call<InvoiceView>("DELETE", `/api/clients/${id}/invoices/${invoiceId}/payments/${paymentId}`),
};

export const invoicePdfUrl = (id: string, invoiceId: string) => `/api/clients/${id}/invoices/${invoiceId}/pdf`;

/** A picture of a marketing chat (a website screenshot or logo), before it has a project. */
export const sessionUrl = (session: string, file: string) => `/marketing-files/${session}/${file}`;

/** A website's host without "www.", to match marketing videos to their client (same rule as the server). */
export function hostOf(url: string): string {
  if (!url.trim()) return "";
  try {
    const host = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase().replace(/^www\./, "");
    return host.includes(".") ? host : "";
  } catch {
    return "";
  }
}

/**
 * The page a job's work shows up on: what it made once it is done (a new
 * project or client), else the page it was started from, else its project.
 */
export function jobLink(job: Job): string | undefined {
  const made = job.status === "done" && typeof job.result === "string" && /^[a-z0-9-]+$/.test(job.result) ? job.result : undefined;
  if (made && job.label.startsWith("Write script")) return `/projects/${made}`;
  if (made && job.label.startsWith("New client")) return `/marketing/clients/${made}`;
  return job.link ?? (job.projectId ? `/projects/${job.projectId}` : undefined);
}

/** A client's file: its logo, or a post's slides and art. */
export const clientFileUrl = (client: string, file: string) => `/client-files/${client}/${file}`;

/** The prompt a client pastes into their own AI, as a text file. */
export const clientPromptUrl = (id: string, lang: "en" | "ar") => `/api/clients/${id}/profile/prompt?lang=${lang}&download=1`;

/** A client's questionnaire as a file to send them. */
export const profileExportUrl = (id: string, format: "docx" | "pdf" | "json", lang: "en" | "ar") => `/api/clients/${id}/profile/export?format=${format}&lang=${lang}`;

/** A website promo's video; `version` makes the browser fetch it again after its music changes. */
export const promoFileUrl = (promo: string, file: string, version?: string) => `/promo-files/${promo}/${file}${version ? `?v=${encodeURIComponent(version)}` : ""}`;

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

/** "$0.42", or "<$0.01" for the tiny costs of a single call. */
export function formatCost(dollars: number): string {
  if (!dollars) return "$0";
  if (dollars < 0.01) return "<$0.01";
  return `$${dollars < 10 ? dollars.toFixed(2) : dollars.toFixed(1)}`;
}

/** Which day bucket a date falls in, for grouping lists: Today, Yesterday, This week, This month or the month's name. */
export function dayGroup(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(now) - day(date)) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return "This week";
  if (date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()) return "This month";
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/** A short date and time: "14:32" today, "Mon 14:32" this week, "18 Oct 14:32" before that. */
export function formatWhen(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const time = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const group = dayGroup(iso, now);
  if (group === "Today") return time;
  if (group === "Yesterday" || group === "This week") return `${date.toLocaleDateString(undefined, { weekday: "short" })} ${time}`;
  return `${date.toLocaleDateString(undefined, { day: "numeric", month: "short" })} ${time}`;
}

/** The full date and time, for tooltips and headers. */
export const formatDate = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function formatTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** How long ago: "just now", "5 min ago", "3 h ago", "2 days ago". */
export function formatAgo(iso: string, now = Date.now()): string {
  const minutes = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} h ago`;
  const days = Math.round(minutes / (24 * 60));
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
