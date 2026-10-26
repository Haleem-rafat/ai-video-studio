# AI Video Studio

Makes YouTube videos for your channels, and Instagram reels, carousels and posts for marketing clients, on this Mac.

```
topic or client idea ─► script (Claude / Bonsai) ─► voice (Gemini or ElevenLabs) ─► pictures (FLUX) or real press media ─► HyperFrames (video.mp4)
```

## Open the studio

Double-click **`Open Studio.command`** in Finder, or run `npm start`. The studio opens at http://localhost:4300.

It has two parts: **YouTube channels** and **Marketing** (clients). Everything slow (writing, voicing, drawing, rendering) runs as a background job, one at a time; the job panel shows each job's log and cost.

## YouTube channels

- **New video:** pick a channel, a format (Short, long, or both) and a style, get topic ideas, then *Write script*.
- **Project screen:**
  - Edit each scene's narration, on-screen graphic and picture; drag scenes on the timeline.
  - The live preview updates as you type (free). *Update preview* re-voices and redraws only what changed.
  - *Quick render* makes a draft mp4; *Final render* the upload version. Each render reports any moment where the picture stands still for 2.5s or more.

| Style | What it is |
|---|---|
| `motion` | Motion graphics, captions and the channel mascot |
| `whiteboard` | A hand drawing the story on a whiteboard |
| `explainer` | Clean explainer cards |
| `mixed` | Scenes in several looks, joined |
| `versus` / `arena` | Product A vs B: spec rows, scores, a winner |
| `proscons` | Review + comparison: pros and cons per chapter, real reviewers' findings, the score and who should buy which |
| `deepdive` | A long, researched video in chapters |

Versus and Pros & Cons research the products on the web and fetch **Apple's official press photos and product-page clips** (Apple products), with a real cut-out product picture; other brands use uploaded or AI pictures.

## Marketing mode (clients)

Give it a client's website, or create a client by hand. Per client:

- **Knowledge and Prompted mode:** what the business does, its customers, objections and rules, from the website and the owner's own answers. Every writer gets it; names of people on the website are never used.
- **Content direction:** promo, value (teach, don't sell: the brand only on the last frame) or a mix; the topics to cover; the dialects. Ideas and posts never repeat a topic, title or angle.
- **Ideas:** a batch of ideas each day, each with when it was made and when to post it.
- **Carousels and single posts:** written, proofread and designed. The carousel editor edits every slide with a live preview. Carousels and posts are always written in **Egyptian Arabic**.
- **Reels:** a marketing video made from an idea, in the client's colours. One look for the whole reel (one background, one soft transition), big captions with the spoken word lit, a step bar for numbered steps, and the viewer's own app screens (chats, notifications, calendars).
- **Make again:** a fresh version of any finished post beside the original, to compare.
- **Library:** everything made for the client. *Export all (zip)* downloads every carousel (or every post) with its slides, caption, pictures and an `index.csv`.
- **Invoices:** every reel, carousel, post, video and day of ideas is a line, with its details, on the client's one open invoice, priced from the client's price list or at its **real API cost** (plus an optional markup). *One sheet (PDF)* is a statement of everything owed; *Pay all at once* spreads one payment over the open invoices. Sent or paid invoices never change.

### Arabic voice and text

- Narration is prepared before it is voiced: English words in Arabic letters (learned per client), numbers in Egyptian words (`1 ساعة` → «ساعة واحدة»).
- Every Gemini take is listened back with Whisper: a misread take, or one that drops the brand's name, is spoken again (the clearest of 3 is kept).
- When a scene's voice text is edited, *Update preview* rewrites its on-screen title, tags and cards to match, keeping the layout.
- A dialect check catches Gulf words in Egyptian text, and the other way round.

## Costs (roughly)

| Piece | Cost |
|---|---|
| Instagram reel (~40s) | $0.80 – $1.20 |
| Carousel | $0.10 – $0.50 |
| A day's ideas | $0.10 – $0.90 |
| Pros & Cons long video | ~$2.40 (most of it web research; Shorts on the same products reuse it) |

Rendering (HyperFrames) and Bonsai run on this Mac for free. Every job's real cost is recorded in the project's or post's `usage.json`.

## Command line

```bash
npm start                                                # build the app and open the studio
npm run server                                           # the studio server only (:4300)
npm run llm                                              # start Bonsai on :8080
npm run topics -- --channel money-mechanics --focus "money history"
npm run video -- --channel dev-pixel --format short --topic "Why switching jobs pays more"
npm run video -- --project <id>                          # rebuild after editing output/<id>/project.json
npm run upload -- <id> [<id> ...]                        # upload video.mp4 to YouTube as private
npm run upload -- <id> --privacy unlisted                # or unlisted / public
npm run mcp                                              # the studio as an MCP server
npm test                                                 # unit tests
npm run typecheck
```

## Working on the studio

- **Server changes** (`src/`) need a server restart. Check that no job is running first (`/api/status`), or the job is lost.
- **App changes** (`app/`) need a build: `npx vite build` (there is no `npm run build`). The server serves `dist/` from disk, so no restart is needed. `npm run app:dev` runs Vite with hot reload.

## YouTube uploads

One-time setup:

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project and enable **YouTube Data API v3**.
2. Under *Google Auth Platform*: set up the consent screen (External), and add your Google account as a test user.
3. Create an OAuth client of type **Desktop app**, download its JSON and save it as `config/youtube/client_secret.json`.

The first upload for each studio channel opens the browser: pick the account/brand channel that channel belongs to.
The sign-in is saved in `config/youtube/<channel>.token.json` (git-ignored). Run `npm run upload -- --sign-in <channel>`
to switch accounts. Uploads are recorded in `project.json`, so the same video is not uploaded twice (`--force` overrides).

Limits: each upload costs 1,600 of the API's 10,000 daily units (about 6 uploads a day). While the OAuth app is in
*Testing*, the sign-in expires every 7 days, and an unverified app's uploads stay private until Google audits it.

## Layout

| Path | What it holds |
|---|---|
| `app/` | The studio screen (React + shadcn, built by Vite into `dist/`) |
| `src/server/` | The studio server: API, background jobs, live-preview runtime, clients and invoices routes |
| `src/pipeline.ts` | The steps both the studio and the CLI run |
| `src/script/` | Scripts: channel videos, versus, Pros & Cons, deep dives, topic ideas, fact-check |
| `src/marketing/` | Marketing videos: website reading, script, art direction, screen-text sync |
| `src/clients/` | Clients: knowledge, direction, ideas, carousels, reels, history, invoices, billing, export |
| `src/media/` | Voice (Gemini / ElevenLabs, listen-back retakes), Arabic speech, pictures, press media, soundtrack, motion check |
| `src/render/` | HyperFrames compositions for every style, carousels, thumbnails |
| `config/channels.json` | Each channel's audience, tone, voice, mascot, picture style and colours |
| `prompts/` | The prompts Bonsai gets (edit freely) |
| `output/<id>/` | One video: `project.json`, `audio/`, `images/`, `press/`, `index.html`, `video.mp4`, `usage.json` |
| `output/.clients/<id>/` | One client: `client.json`, `ideas/`, `posts/`, `invoices/`, `usage.json` |

Keys live in `.env`: `AI_GATEWAY_API_KEY` (Claude, Gemini voice, Whisper, FLUX, web search), `ELEVENLABS_API_KEY` (ElevenLabs voices and music), and `FAL_KEY` (pictures when there is no gateway key). The Bonsai model and its llama.cpp build live in `~/ai/bonsai` (set `BONSAI_DIR` to move them).

## One-time setup (already done on this Mac)

```bash
brew install cmake ffmpeg
cd ~/ai/bonsai && git clone --depth 1 https://github.com/PrismML-Eng/llama.cpp
cd llama.cpp && cmake -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build -j 8 --target llama-server
hf download prism-ml/Ternary-Bonsai-2-27B-gguf Ternary-Bonsai-2-27B-PTQ1_0.gguf --local-dir ~/ai/bonsai
cd /Users/mac/Documents/prsonal/ai-video-studio && npm install
```
