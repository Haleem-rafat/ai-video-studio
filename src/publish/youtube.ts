import { createReadStream, existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { Readable } from "node:stream";
import { execFile } from "node:child_process";

import { ROOT } from "../config.ts";
import type { Project } from "../types.ts";

/** client_secret.json (an OAuth "Desktop app" client) and one token file per studio channel. */
export const YOUTUBE_DIR = join(ROOT, "config", "youtube");

const SCOPES = ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"];
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API_URL = "https://www.googleapis.com/youtube/v3";
const UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos";
// "Education". See videoCategories.list for the others.
const CATEGORY_ID = "27";

export type Privacy = "private" | "unlisted" | "public";

/** `redirect_uri` is set when the client is Framecast's, whose registered callback hands the code back to the studio. */
type Client = { client_id: string; client_secret: string; redirect_uri?: string };

type Token = {
  refresh_token: string;
  access_token?: string;
  /** Epoch ms. */
  expires_at?: number;
  youtubeChannel: { id: string; title: string };
};

/** Where the local Framecast checkout lives; its `.env.local` holds the Google client local Framecast signs in with. */
const FRAMECAST_DIR = process.env.FRAMECAST_DIR ?? join(ROOT, "..", "ai-youtube-app");

/**
 * The same Google client local Framecast (localhost:3000) uses, read at run
 * time and never copied. Google only sends a sign-in back to a callback it
 * has on file, so the studio uses Framecast's; Framecast's callback hands any
 * `studio.` sign-in on to this server (STUDIO_OAUTH_RETURN_URL there).
 */
function framecastClient(): Client | null {
  const path = join(FRAMECAST_DIR, ".env.local");
  if (!existsSync(path)) return null;
  const vars = new Map<string, string>();
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match) vars.set(match[1], match[2].replace(/^(["'])(.*)\1$/, "$2"));
  }
  const id = vars.get("GOOGLE_CLIENT_ID"), secret = vars.get("GOOGLE_CLIENT_SECRET"), base = vars.get("BETTER_AUTH_URL");
  if (!id || !secret || !base || !vars.get("STUDIO_OAUTH_RETURN_URL")) return null;
  return { client_id: id, client_secret: secret, redirect_uri: `${base.replace(/\/$/, "")}/api/youtube/callback` };
}

async function loadClient(): Promise<Client> {
  const path = join(YOUTUBE_DIR, "client_secret.json");
  if (!existsSync(path)) {
    const framecast = framecastClient();
    if (framecast) return framecast;
    throw new Error(`Missing ${path}, and no local Framecast at ${FRAMECAST_DIR} to borrow from. Create a "Desktop app" OAuth client in Google Cloud Console and save its JSON there.`);
  }
  const json = JSON.parse(await readFile(path, "utf8")) as { installed?: Client; web?: Client };
  const client = json.installed ?? json.web;
  if (!client) throw new Error(`${path} is not an OAuth client file.`);
  return client;
}

function tokenPath(channel: string): string {
  return join(YOUTUBE_DIR, `${channel}.token.json`);
}

/** What the studio screen needs to know: is uploading set up, and which YouTube channel each studio channel posts to. */
export async function connectionStatus(
  channels: string[],
): Promise<{ configured: boolean; via: "desktop-client" | "framecast" | null; channels: Record<string, { title: string } | null> }> {
  const entries = await Promise.all(
    channels.map(async (channel) => {
      try {
        const token = JSON.parse(await readFile(tokenPath(channel), "utf8")) as Token;
        return [channel, { title: token.youtubeChannel.title }] as const;
      } catch {
        return [channel, null] as const;
      }
    }),
  );
  const via = existsSync(join(YOUTUBE_DIR, "client_secret.json")) ? "desktop-client" : framecastClient() ? "framecast" : null;
  return { configured: via !== null, via, channels: Object.fromEntries(entries) };
}

/** A sign-in nobody finishes must not hold the studio's job queue forever. */
const SIGN_IN_TIMEOUT_MS = 5 * 60_000;

async function postToken(params: Record<string, string>): Promise<{ access_token: string; expires_in: number; refresh_token?: string }> {
  const response = await fetch(TOKEN_URL, { method: "POST", body: new URLSearchParams(params) });
  if (!response.ok) throw new Error(`Google sign-in failed (${response.status}): ${await response.text()}`);
  return response.json() as Promise<{ access_token: string; expires_in: number; refresh_token?: string }>;
}

async function myChannel(accessToken: string): Promise<Token["youtubeChannel"]> {
  const response = await fetch(`${API_URL}/channels?part=snippet&mine=true`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(`Could not read your YouTube channel (${response.status}): ${await response.text()}`);
  const { items = [] } = (await response.json()) as { items?: { id: string; snippet: { title: string } }[] };
  if (!items[0]) throw new Error("That Google account has no YouTube channel. Sign in again and pick the channel's account.");
  return { id: items[0].id, title: items[0].snippet.title };
}

/** Sign-ins waiting for Framecast's callback to hand their code over, by state. */
const pending = new Map<string, { resolve: (code: string) => void; reject: (error: Error) => void }>();

/**
 * The studio server's /api/youtube/callback, reached through Framecast's
 * callback. Returns the page to show in the browser tab.
 */
export function completeSignIn(params: URLSearchParams): { ok: boolean; message: string } {
  const waiting = pending.get(params.get("state") ?? "");
  if (!waiting) return { ok: false, message: "This sign-in was not started by the studio, or it timed out. Click Connect again." };
  pending.delete(params.get("state")!);
  const code = params.get("code");
  if (!code) {
    waiting.reject(new Error(`Google sign-in failed: ${params.get("error") ?? "no code"}`));
    return { ok: false, message: "Google sign-in was cancelled." };
  }
  waiting.resolve(code);
  return { ok: true, message: "Connected. You can close this tab and go back to the studio." };
}

/** Waits for a code from Google: through Framecast's callback, or a loopback server for a Desktop client. */
async function waitForCode(client: Client, channel: string): Promise<{ code: string; redirectUri: string }> {
  const authUrl = (redirectUri: string, state: string) =>
    `${AUTH_URL}?${new URLSearchParams({
      client_id: client.client_id,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: SCOPES.join(" "),
      access_type: "offline",
      prompt: "select_account consent",
      state,
    })}`;
  const open = (url: string) => {
    console.log(`Opening the browser to sign in to YouTube for "${channel}". If it does not open, visit:\n${url}\n`);
    execFile("open", [url]);
  };
  const timeout = (reject: (error: Error) => void) => setTimeout(() => reject(new Error("YouTube sign-in timed out after 5 minutes. Try again.")), SIGN_IN_TIMEOUT_MS).unref();

  if (client.redirect_uri) {
    const redirectUri = client.redirect_uri;
    const state = `studio.${channel}.${crypto.randomUUID()}`;
    const code = await new Promise<string>((resolve, reject) => {
      pending.set(state, { resolve, reject });
      open(authUrl(redirectUri, state));
      timeout(reject);
    }).finally(() => pending.delete(state));
    return { code, redirectUri };
  }

  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  const redirectUri = `http://127.0.0.1:${port}`;
  const state = crypto.randomUUID();
  const code = await new Promise<string>((resolve, reject) => {
    server.on("request", (req, res) => {
      const params = new URL(req.url ?? "/", redirectUri).searchParams;
      if (!params.has("code") && !params.has("error")) return void res.writeHead(404).end();

      const ok = params.get("state") === state && params.get("code");
      res.writeHead(200, { "Content-Type": "text/html" }).end(ok ? "<h2>Signed in. You can close this tab.</h2>" : "<h2>Sign-in failed.</h2>");
      if (ok) resolve(params.get("code")!);
      else reject(new Error(`Google sign-in failed: ${params.get("error") ?? "state mismatch"}`));
    });
    open(authUrl(redirectUri, state));
    timeout(reject);
  }).finally(() => server.close());
  return { code, redirectUri };
}

/**
 * Browser sign-in. Google shows an account picker, so a brand-account channel
 * can be chosen per studio channel.
 */
export async function signIn(channel: string): Promise<Token> {
  const client = await loadClient();
  const { code, redirectUri } = await waitForCode(client, channel);

  const tokens = await postToken({
    code,
    client_id: client.client_id,
    client_secret: client.client_secret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  if (!tokens.refresh_token) throw new Error("Google returned no refresh token. Remove the app at myaccount.google.com/permissions and try again.");

  const token: Token = {
    refresh_token: tokens.refresh_token,
    access_token: tokens.access_token,
    expires_at: Date.now() + tokens.expires_in * 1000,
    youtubeChannel: await myChannel(tokens.access_token),
  };
  await mkdir(YOUTUBE_DIR, { recursive: true });
  await writeFile(tokenPath(channel), JSON.stringify(token, null, 2), { mode: 0o600 });
  console.log(`Signed in as YouTube channel "${token.youtubeChannel.title}" (${token.youtubeChannel.id}).`);
  return token;
}

/** Returns a fresh access token, signing in through the browser the first time. */
async function authorize(channel: string): Promise<{ accessToken: string; youtubeChannel: Token["youtubeChannel"] }> {
  const path = tokenPath(channel);
  let token = existsSync(path) ? (JSON.parse(await readFile(path, "utf8")) as Token) : await signIn(channel);

  if (!token.access_token || !token.expires_at || token.expires_at < Date.now() + 60_000) {
    const client = await loadClient();
    try {
      const fresh = await postToken({
        refresh_token: token.refresh_token,
        client_id: client.client_id,
        client_secret: client.client_secret,
        grant_type: "refresh_token",
      });
      token = { ...token, access_token: fresh.access_token, expires_at: Date.now() + fresh.expires_in * 1000 };
      await writeFile(path, JSON.stringify(token, null, 2), { mode: 0o600 });
    } catch (error) {
      // Refresh tokens of OAuth apps still in "Testing" expire after 7 days.
      console.warn(`Saved YouTube sign-in no longer works (${error instanceof Error ? error.message : error}). Signing in again.`);
      token = await signIn(channel);
    }
  }

  return { accessToken: token.access_token!, youtubeChannel: token.youtubeChannel };
}

/** YouTube's limits: title 100 chars, no angle brackets; description 5000 bytes; tags 500 chars in total. */
function metadata(project: Project, privacy: Privacy, madeForKids: boolean, publishAt?: string) {
  const clean = (text: string) => text.replace(/[<>]/g, "");
  const hashtags = project.tags.map((tag) => `#${tag.replace(/\s+/g, "")}`).join(" ");
  const tags: string[] = [];
  let tagChars = 0;
  for (const tag of project.tags) {
    // Tags with spaces count their surrounding quotes, plus a comma between tags.
    const cost = tag.length + (tag.includes(" ") ? 2 : 0) + 1;
    if (tagChars + cost > 500) break;
    tags.push(tag);
    tagChars += cost;
  }

  return {
    snippet: {
      title: clean(project.title).slice(0, 100),
      description: clean(`${project.description}\n\n${hashtags}`).slice(0, 4900),
      tags,
      categoryId: CATEGORY_ID,
      defaultLanguage: "en",
      defaultAudioLanguage: "en",
    },
    // A scheduled video must go up private; YouTube makes it public at publishAt.
    status: publishAt
      ? { privacyStatus: "private", publishAt, selfDeclaredMadeForKids: madeForKids, embeddable: true }
      : { privacyStatus: privacy, selfDeclaredMadeForKids: madeForKids, embeddable: true },
  };
}

export type Upload = { videoId: string; url: string; privacy: Privacy; youtubeChannel: string; uploadedAt: string; scheduledFor?: string };

/** Resumable upload of output/<id>/video.mp4: one session, then the file streamed in a single PUT. */
export async function uploadVideo(project: Project, videoPath: string, options: { privacy: Privacy; madeForKids: boolean; publishAt?: string }): Promise<Upload> {
  const { accessToken, youtubeChannel } = await authorize(project.channel);
  const { size } = await stat(videoPath);
  console.log(
    `Uploading to YouTube channel "${youtubeChannel.title}" ${options.publishAt ? `scheduled for ${new Date(options.publishAt).toLocaleString()}` : `as ${options.privacy}`}: ${project.title}`,
  );

  const session = await fetch(`${UPLOAD_URL}?uploadType=resumable&part=snippet,status`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": "video/mp4",
      "X-Upload-Content-Length": String(size),
    },
    body: JSON.stringify(metadata(project, options.privacy, options.madeForKids, options.publishAt)),
  });
  const location = session.headers.get("location");
  if (!session.ok || !location) throw new Error(`YouTube refused the upload (${session.status}): ${await session.text()}`);

  let sent = 0;
  let lastPercent = -1;
  const file = createReadStream(videoPath).on("data", (chunk) => {
    sent += chunk.length;
    const percent = Math.floor((sent / size) * 100);
    if (percent % 10 === 0 && percent !== lastPercent) {
      lastPercent = percent;
      console.log(`  ${percent}%`);
    }
  });

  const response = await fetch(location, {
    method: "PUT",
    headers: { "Content-Type": "video/mp4", "Content-Length": String(size) },
    body: Readable.toWeb(file) as ReadableStream,
    duplex: "half",
  } as RequestInit);
  if (!response.ok) throw new Error(`YouTube upload failed (${response.status}): ${await response.text()}`);

  const video = (await response.json()) as { id: string; status?: { privacyStatus?: Privacy } };
  return {
    videoId: video.id,
    url: project.format === "short" ? `https://youtube.com/shorts/${video.id}` : `https://youtu.be/${video.id}`,
    privacy: video.status?.privacyStatus ?? options.privacy,
    youtubeChannel: youtubeChannel.title,
    uploadedAt: new Date().toISOString(),
    ...(options.publishAt ? { scheduledFor: options.publishAt } : {}),
  };
}
