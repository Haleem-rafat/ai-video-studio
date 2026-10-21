import { hostOf } from "../clients/library.ts";
import { canChangeMusic, changeMusic, deleteFailedPromos, deletePromo, listPromos, loadPromo, makePromo, mutedFile, promoDir, promoOptions, recoverPromos, renamePromo, startPromo, type Promo } from "../promo/store.ts";
import { addTrack, composeTrack, deleteTrack, listTracks, MOODS, MUSIC_DIR, renameTrack, type Mood } from "../promo/music.ts";
import { rawBody } from "./body.ts";
import type { Ctx } from "./clients.ts";
import { enqueue } from "./jobs.ts";

/** A promo's page in the studio. */
const promoPage = (id: string) => `/marketing/promos/${id}`;

/** A promo as the app sees it: with whether its music can change without recording again. */
const shown = (promo: Promo) => ({ ...promo, canChangeMusic: canChangeMusic(promo.id) });

/** Largest song that can be uploaded. */
const MAX_SONG = 40 * 1024 * 1024;


/** Promos whose job ended with the studio are marked failed, so they can be made again. */
export function startPromos(): void {
  void recoverPromos().catch((error: unknown) => console.error(`promos: ${error instanceof Error ? error.message : error}`));
}

/** Handles /api/promos… and /promo-files/…; false when the path is not one of them. */
export async function handlePromos(ctx: Ctx): Promise<boolean> {
  const { path, method, request, response, json, body, fail } = ctx;
  let match: RegExpMatchArray | null;

  if (path === "/api/promos" && method === "GET") {
    json(response, 200, (await listPromos()).map(shown));
    return true;
  }

  if (path === "/api/promos" && method === "POST") {
    const { url, speed, length } = await body<{ url?: string; speed?: unknown; length?: unknown }>(request);
    const promo = await startPromo(url ?? "", promoOptions({ speed, length })).catch((error: Error) => {
      throw fail(400, error.message);
    });
    // Chrome and ffmpeg only: nothing is paid, so no cost file.
    const job = Object.assign(
      enqueue(`Website promo: ${hostOf(promo.url)}`, async (log) => (await makePromo(promo.id, log)).id, undefined, () => null),
      { link: promoPage(promo.id) },
    );
    json(response, 202, { ...job, promoId: promo.id });
    return true;
  }

  // The music library ("music" would otherwise read as a promo id below).
  if (path === "/api/promos/music" && method === "GET") {
    json(response, 200, await listTracks());
    return true;
  }

  if (path === "/api/promos/music" && method === "POST") {
    const name = ctx.url.searchParams.get("name") ?? "track.mp3";
    const bytes = await rawBody(request, MAX_SONG).catch((error: Error) => {
      throw fail(413, error.message);
    });
    json(
      response,
      201,
      await addTrack(name, bytes).catch((error: Error) => {
        throw fail(400, error.message);
      }),
    );
    return true;
  }

  if (path === "/api/promos/music/new" && method === "POST") {
    const { mood } = await body<{ mood?: string }>(request);
    if (!MOODS.includes(mood as Mood)) throw fail(400, `Pick a mood: ${MOODS.join(", ")}`);
    json(response, 202, Object.assign(enqueue(`New music: ${mood}`, (log) => composeTrack(mood as Mood, log), undefined, () => null), { link: "/marketing/promos" }));
    return true;
  }

  if ((match = path.match(/^\/api\/promos\/music\/([\w.-]+\.mp3)$/i))) {
    const file = match[1];
    const notFound = (error: Error) => {
      throw fail(/No track/.test(error.message) ? 404 : 409, error.message);
    };
    if (method === "PUT") {
      const { name } = await body<{ name?: string }>(request);
      json(response, 200, { file: await renameTrack(file, name ?? "").catch(notFound) });
      return true;
    }
    if (method === "DELETE") {
      await deleteTrack(file).catch(notFound);
      json(response, 200, { deleted: file });
      return true;
    }
  }

  if ((match = path.match(/^\/promo-music\/([\w.-]+\.mp3)$/i))) {
    await ctx.sendFile(request, response, ctx.inside(MUSIC_DIR, match[1]));
    return true;
  }

  if (path === "/api/promos/failed" && method === "DELETE") {
    json(response, 200, { deleted: await deleteFailedPromos() });
    return true;
  }

  if ((match = path.match(/^\/api\/promos\/([a-z0-9-]+)$/)) && method === "DELETE") {
    await deletePromo(match[1]).catch((error: Error) => {
      throw fail(/No promo/.test(error.message) ? 404 : 409, error.message);
    });
    json(response, 200, { deleted: [match[1]] });
    return true;
  }

  if ((match = path.match(/^\/api\/promos\/([a-z0-9-]+)$/)) && method === "GET") {
    json(
      response,
      200,
      shown(
        await loadPromo(match[1]).catch(() => {
          throw fail(404, `No promo "${match![1]}"`);
        }),
      ),
    );
    return true;
  }

  if ((match = path.match(/^\/api\/promos\/([a-z0-9-]+)$/)) && method === "PUT") {
    const { title } = await body<{ title?: string }>(request);
    json(
      response,
      200,
      shown(
        await renamePromo(match[1], title ?? "").catch((error: Error) => {
          throw fail(400, error.message);
        }),
      ),
    );
    return true;
  }

  if ((match = path.match(/^\/api\/promos\/([a-z0-9-]+)\/music$/)) && method === "POST") {
    const id = match[1];
    const promo = await loadPromo(id).catch(() => {
      throw fail(404, `No promo "${id}"`);
    });
    if (!canChangeMusic(id)) throw fail(409, "This promo was made before recordings were kept. Record again to change its music.");
    const { music } = await body<{ music?: string }>(request);
    const wanted = promoOptions({ music }).music ?? "";
    const job = Object.assign(
      enqueue(`Promo music: ${promo.host}`, async (log) => (await changeMusic(id, wanted, log)).id, undefined, () => null),
      { link: promoPage(id) },
    );
    json(response, 202, job);
    return true;
  }

  // A muted copy is made the first time it is asked for.
  if ((match = path.match(/^\/promo-files\/([a-z0-9-]+)\/promo-(16x9|9x16)-muted\.mp4$/))) {
    const muted = await mutedFile(match[1], match[2] as "16x9" | "9x16").catch((error: Error) => {
      throw fail(404, error.message);
    });
    await ctx.sendFile(request, response, muted);
    return true;
  }

  if ((match = path.match(/^\/promo-files\/([a-z0-9-]+)\/(.+)$/))) {
    await ctx.sendFile(request, response, ctx.inside(promoDir(match[1]), match[2]));
    return true;
  }

  return false;
}
