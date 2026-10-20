# Client Library, Costs and Art Styles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (chosen: native). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the cost of everything made for a client, organise a client's work in one Library (including earlier marketing videos), and add 12 art styles with a picture amount that change both pictures and slide look.

**Architecture:** A new `src/clients/library.ts` assembles items and costs from the folders the job runner already writes `usage.json` into. A new `src/clients/styles.ts` holds the style presets, which the carousel writer, the art drawer and the slide renderer read. Routes are added to `src/server/clients.ts`; the screen changes are inside `ClientView`, plus a grouping in the sidebar.

**Tech Stack:** as before (Node 25, AI SDK via the gateway, zod, puppeteer-core, React, `node:test`).

**Spec:** `docs/superpowers/specs/2026-10-20-client-library-styles-design.md`

## Global Constraints

- The current Marketing mode's behaviour does not change; its projects are only listed.
- No new dependencies.
- 12 style ids exactly: `flat, clay, cartoon, isometric, anime, doodle, papercut, riso, glass, line, collage, photo`; default `flat`. Picture amount `light | rich`, default `light`.
- Brand colours, logo and fonts stay in every style.
- Costs in US dollars, from `usage.json` files only (no estimates added here).

## Review Focus

1. **A client whose website matches no projects**: Library shows posts only, totals still add up. Test in Task 1.
2. **A post or project folder with no usage.json** (made before costs, or failed early): cost 0, not a crash. Test in Task 1.
3. **An old client.json or post.json without `artStyle`/`pictures`**: behaves as `flat`/`light`. Test in Task 3.
4. **Rich on a 7-slide carousel**: every slide has art, even slides the writer left without a prompt. Test in Task 3.
5. **The sidebar with a marketing project whose brand URL is malformed**: grouped under "Other", no crash. Test in Task 1 (`hostOf`).

---

### Task 1: Library and costs (pure + server)

**Files:** Create `src/clients/library.ts`, `src/clients/library.test.ts`. Modify `src/server/clients.ts` (library route; client-creation usage target), `src/server/index.ts` (`/api/usage` also reads client and post folders).

**Interfaces — produces:**
- `hostOf(url: string): string` (lower-case host without `www.`; `""` when unparsable)
- `costOf(entries: UsageEntry[]): number`
- `ideasCostByDate(entries: UsageEntry[]): Record<string, number>` (entries whose `job` starts with `Ideas: `, keyed by `localDate(new Date(at))`)
- `buildLibrary(input: { client: Client; posts: Post[]; postCosts: Record<string, number>; projects: Project[]; projectCosts: Record<string, number>; clientEntries: UsageEntry[]; now?: Date }): Library`
- `loadLibrary(clientId: string): Promise<Library>` (reads the folders, then `buildLibrary`)
- `usageFolders(): Promise<string[]>` (every client folder and post folder, for the studio total)

**Tests (`library.test.ts`):**
- `hostOf("https://www.Risero.io/x")` → `"risero.io"`; `hostOf("not a url")` → `""`.
- `ideasCostByDate` groups two `Ideas: Risero` entries on the same day and ignores a `New client…` entry.
- `buildLibrary`: one carousel post (cost 0.17), one reel post linked to project P1 (project cost 0.9), projects P1 (reel) and P2 (same host, a video) and P3 (other host) → items: reel (0.9, kind reel), carousel (0.17), video P2; P3 absent; totals `posts` 0.17, `videos` 0.9 + P2's cost, `ideas` from entries; `all` sums everything incl. client creation; `month` counts only this month's items.
- `buildLibrary` with a post missing from `postCosts` → cost 0.

**Steps:** write tests → run (FAIL: module missing) → implement → run (PASS) → add route `GET /api/clients/:id/library` → change the `New client…` jobs' usage target to `clientDir(result)` → in `/api/usage` add `...(await usageFolders())` to `folders` → `npm test`, `npx tsc --noEmit` → commit "Clients: library with costs for every post, reel, video and day of ideas".

### Task 2: Library screen and sidebar grouping

**Files:** Modify `app/api.ts` (types `Library`, `LibraryItem`; `api.library(id)`), `app/components/ClientView.tsx` (Library tab replaces Posts; header totals; idea day cost), `app/components/Sidebar.tsx` + `app/App.tsx` (group marketing projects by client host).

**Details:**
- Library tab: filter chips All / Videos / Carousels / Images (Images = `single`; Videos = `reel` + `video`). Carousel/single items render the existing `PostCard` with a cost badge; reel/video items show a `<video src="/files/<projectId>/video.mp4#t=1" controls preload="metadata">` (or "Not rendered yet"), title, format, cost, and "Open project".
- Header: `This month $x · All time $y` using `formatCost`.
- Ideas tab: `ideas $x` beside the date picker from `ideasByDate[date]`.
- Sidebar: inside the Marketing group, render one sub-label per client (by `hostOf(project.marketing.brand.url)` matched to `hostOf(client.url)`), then "Other". Uses a small browser-side `hostOf` copy in `app/api.ts`.

**Steps:** implement → `npm run typecheck` and `npx vite build` → screenshot `/marketing/clients/risero` (Library tab) and check no console errors → commit "Studio: client Library with costs; marketing list grouped by client".

### Task 3: Art styles (presets, writer, art, renderer)

**Files:** Create `src/clients/styles.ts`, `src/clients/styles.test.ts`. Modify `src/clients/types.ts` (`Client.artStyle?`, `Client.pictures?`, `Post.artStyle?`, `Post.pictures?`, `ArtStyleId`, `PictureAmount`), `src/clients/carousel.ts` (picture amount; style prompt), `src/clients/make.ts` (options; store on post; re-render keeps them), `src/render/carousel.ts` (`SlideContext.style`; append style CSS).

**Interfaces — produces:**
- `ART_STYLES: Record<ArtStyleId, { id; label; picture: string; css: (colors) => string }>`, `ART_STYLE_IDS`, `styleOf(id?: string): ArtStyle` (falls back to `flat`)
- `withPictures(slides: Slide[], amount: PictureAmount, fallbackPrompt: (slide) => string): Slide[]` — `light`: keep at most 3 (cover first); `rich`: every slide has art, filling missing prompts from `fallbackPrompt`
- `makePost(clientId, ideaId, log, options?: { artStyle?: ArtStyleId; pictures?: PictureAmount })`
- `drawSlideArt(dir, client, slides, log, artStyle)`; `renderSlides(dir, client, folder, slides, log, artStyle)`

**Tests (`styles.test.ts` + additions):**
- all 12 ids exist, each with a non-empty picture direction and css.
- `styleOf(undefined)` and `styleOf("nope")` → flat.
- `withPictures` light on 7 slides with 5 prompts → 3 with art, cover first; rich on 7 slides with 2 prompts → 7 with art.
- `slideHtml` with `style: "cartoon"` contains the cartoon CSS marker; with no style, contains flat's.

**Steps:** tests → FAIL → implement → PASS → `npx tsc --noEmit` → commit "Clients: 12 art styles and picture amount for posts".

### Task 4: Style previews, profile defaults and the Make menu

**Files:** Modify `src/server/clients.ts` (Make body `{ artStyle?, pictures? }` validated against the ids; `POST /api/clients/styles/previews` job; `GET /client-styles/<id>.png`; PUT accepts `artStyle`, `pictures`), `src/server/index.ts` (route prefix `/client-styles/`), `app/api.ts`, `app/components/ClientView.tsx` (Profile: style grid with previews + picture amount; Make: a dropdown "Make…" with style grid and Light/Rich).

**Steps:** implement → typecheck + build → run the previews job once (~$0.30) → screenshot the Profile style grid → commit "Studio: art style picker with previews".

### Task 5: Real run

- Re-render check of the two fixed carousels (queued earlier).
- Make one Risero carousel in **3D clay, Rich** and one in **Cartoon, Light** (from "Get 5 more" ideas); look at every slide.
- Check the Library: every item has a cost; header totals = sum of items + ideas; studio total moved by the same amount.
- Report links, costs and slide screenshots.

### Task 6: No duplicates (added 2026-10-20, approved in chat)

**Files:** Create `src/clients/history.ts`, `src/clients/history.test.ts`. Modify `src/clients/ideas.ts` (history in prompt + duplicate check), `src/clients/reel.ts` (avoid past openings/beat orders/sentences; rotate creativity and voice; one rewrite), `src/clients/carousel.ts` (past slide titles), `src/clients/make.ts` (resolve "rotate" style), `src/clients/styles.ts` (`ArtStyleChoice`, `pickRotation`), `src/server/clients.ts` (Make guard, 409 unless `force`), `app/api.ts` + `app/components/ClientView.tsx` ("Make anyway"; "Rotate" tile).

**Interfaces — produces:**
- `type Made = { id; kind: "carousel" | "single" | "reel" | "video"; title: string; lines: string[]; beats?: string[]; voice?: string; creativity?: string; artStyle?: string; createdAt: string }`
- `loadHistory(clientId): Promise<Made[]>` (posts + reels + the client's marketing videos, newest first)
- `similarity(a: string, b: string): number` (Jaccard of normalized word sets, words ≥ 3 letters, stop words dropped)
- `duplicateOf(text: string, history: Made[], threshold = DUPLICATE_AT): { made: Made; score: number } | null`
- `reelProblems(draft: { beats: string[]; lines: string[] }, history: Made[]): string[]` — same opening beat as either of the last 2 videos/reels; ≥ 50% of positions with the same beat as any earlier video; any sentence ≥ 0.6 similar to an earlier video's sentence
- `nextVoice(history)`, `nextCreativity(history)`; `pickRotation(history, ids)`: the style least recently used by the client's posts

**Tests:** similarity of reordered/punctuated Arabic sentences is high, of unrelated ones low; `duplicateOf` finds today's made carousel from its own idea text; `reelProblems` flags the two real Risero reels' shared patterns and passes a different draft; `nextVoice` rotates; `pickRotation` skips the last styles; calibration printed against the real Risero history before choosing `DUPLICATE_AT`.

**Steps:** tests → FAIL → implement → PASS → wire → typecheck/build → real run (Task 5) → commit.
