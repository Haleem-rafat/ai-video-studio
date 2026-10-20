import { hostOf } from "../clients/library.ts";
import { listPromos, loadPromo, makePromo, promoDir, recoverPromos, startPromo } from "../promo/store.ts";
import type { Ctx } from "./clients.ts";
import { enqueue } from "./jobs.ts";

/** A promo's page in the studio. */
const promoPage = (id: string) => `/marketing/promos/${id}`;

/** Promos whose job ended with the studio are marked failed, so they can be made again. */
export function startPromos(): void {
  void recoverPromos().catch((error: unknown) => console.error(`promos: ${error instanceof Error ? error.message : error}`));
}

/** Handles /api/promos… and /promo-files/…; false when the path is not one of them. */
export async function handlePromos(ctx: Ctx): Promise<boolean> {
  const { path, method, request, response, json, body, fail } = ctx;
  let match: RegExpMatchArray | null;

  if (path === "/api/promos" && method === "GET") {
    json(response, 200, await listPromos());
    return true;
  }

  if (path === "/api/promos" && method === "POST") {
    const { url } = await body<{ url?: string }>(request);
    const promo = await startPromo(url ?? "").catch((error: Error) => {
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

  if ((match = path.match(/^\/api\/promos\/([a-z0-9-]+)$/)) && method === "GET") {
    json(
      response,
      200,
      await loadPromo(match[1]).catch(() => {
        throw fail(404, `No promo "${match![1]}"`);
      }),
    );
    return true;
  }

  if ((match = path.match(/^\/promo-files\/([a-z0-9-]+)\/(.+)$/))) {
    await ctx.sendFile(request, response, ctx.inside(promoDir(match[1]), match[2]));
    return true;
  }

  return false;
}
