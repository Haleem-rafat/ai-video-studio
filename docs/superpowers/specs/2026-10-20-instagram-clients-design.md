# Instagram marketing for clients: daily ideas, infographic carousels, reels

Date: 2026-10-20 · Status: approved

**Update 2026-10-20:** everything lives inside **Marketing mode** (a Clients list under
"Marketing video", routes `/marketing/clients/:id`, and an "Instagram client" button on a
marketing project). Every idea has a **goal**: `awareness` (reach new people),
`details` (explain a feature or how it works) or `offer` (sell, with the call to action);
each day's 5 ideas cover all three goals.

## Goal

For each **client business**, the studio suggests **5 Instagram post ideas every
day** grounded in fresh trends of the client's niche, and makes any idea into a
ready-to-post **infographic carousel**, **single image** or **reel** with caption
and hashtags, carrying the client's brand lightly. Nothing is posted to
Instagram automatically.

First real client: **Risero** (`https://diaaeziada.risero.io/`, Egyptian Arabic),
created from the existing project `202610182235-marketing-short-risero-v2`.

## Decisions (from the chat)

| Question | Answer |
|---|---|
| Whose Instagram | Client businesses (from a website) |
| Daily ideas | Automatic each morning; catch-up when the studio opens; "Get 5 more" by hand |
| Carousel look | Designed HTML layouts + a little AI art (FLUX) |
| Trend source | AI + live web search |
| Approach | A new **Client** workspace on top of the existing marketing pieces |

## Out of scope

Auto-posting to Instagram, analytics, scheduling posts, multiple brands per client,
editing slide text on a canvas (text is edited as fields, then re-rendered).

## 1. Client

`output/.clients/<id>/client.json`:

```ts
type Client = {
  id: string;                 // slug of the name, e.g. "risero"
  name: string;
  url: string;
  instagramHandle?: string;   // shown on slides, without "@"
  language: "en" | "ar";
  brand: SiteBrand;           // existing type; its shots/ (logo included) copied to output/.clients/<id>/shots/
  brief: MarketingBrief;      // existing type: business, audience, problems, result, features, cta, tone, voice…
  niche: string;              // e.g. "booking pages for coaches and service providers"
  avoid: string;              // claims or topics never to use (e.g. unconfirmed features)
  dailyIdeas: boolean;        // default true
  createdAt: string; updatedAt: string;
};
```

Created two ways:

- **From a marketing project** (`POST /api/clients { fromProject }`): copies
  `marketing.brand`, `marketing.brief` and the `shots/` folder; `avoid` starts as the
  brief's notes. The niche is asked of the LLM from the brief in one call. No
  website read. This is how Risero is created.
- **From a URL** (`POST /api/clients { url }`): runs the existing `readSite`
  as a background job, then fills the brief and niche from the brand in one LLM call.

The profile is editable in the Profile tab (`PUT /api/clients/:id`).

## 2. Daily ideas

`output/.clients/<id>/ideas/YYYY-MM-DD.json` → `{ date, trends: Trend[], ideas: Idea[] }`.
"Get 5 more" appends 5 to the same day's file.

```ts
type Trend = { title: string; summary: string; url: string };
type Idea = {
  id: string;                         // "<date>-<n>"
  format: "carousel" | "single" | "reel";
  goal: "awareness" | "details" | "offer";
  angle: "myth" | "mistakes" | "list" | "before-after" | "trend" | "how-to" | "story" | "stat" | "question";
  hook: string;                       // the first line, in the client's language
  outline: string[];                  // slide or scene beats, 3–7 items
  why: string;                        // why it can reach the niche / go viral
  trend?: string;                     // the trend url it rides, if any
  status: "new" | "making" | "made" | "skipped";
  postId?: string;
};
```

**Steps** (`src/clients/ideas.ts`):

1. **Trends:** one call to `perplexity/sonar` through the AI Gateway: "the 5–8
   freshest news, debates and trending formats this week for <niche> aimed at
   <audience>", JSON with source urls. On failure, continue with no trends (log it).
2. **Ideas:** one call to the existing gateway text model (the one `write.ts`
   uses), given profile, brand summary, trends, and the angles + hooks of the last
   14 days' ideas. Returns 5 ideas, validated with zod.
3. **Rules checked in code**, with one retry asking to fix what failed: exactly 5;
   ≥1 reel and ≥2 carousels; every goal at least once; no two with the same angle; no hook repeating a hook
   of the last 14 days (normalized text equality); hook ≤ 120 characters.

**Schedule** (`src/clients/schedule.ts`, started by the server): every hour and
once 10 s after start, for each client with `dailyIdeas`, if local time ≥ 08:00
and today's file is missing, enqueue an "Ideas for <client>" job. A client with a
job already queued or running is skipped.

## 3. Posts

`output/.clients/<id>/posts/<postId>/post.json` plus its files:

```ts
type Post = {
  id: string;                 // "<date>-<slug of hook>"
  clientId: string;
  ideaId?: string;
  kind: "carousel" | "single" | "reel";
  slides?: Slide[];           // carousel and single
  projectId?: string;         // reel: the marketing project that renders it
  caption: string;            // ≤ 2,200 characters including hashtags
  hashtags: string[];         // ≤ 30, without "#"
  status: "writing" | "drawing" | "rendering" | "done" | "failed";
  error?: string;
  createdAt: string; updatedAt: string;
};
```

### Carousel and single image (the default infographic style)

**Writing** (`src/clients/carousel.ts`): one LLM call turns the idea into
5–8 slides (single image: 1), each a typed layout:

```ts
type Slide =
  | { layout: "cover"; title: string; subtitle?: string; art?: string }
  | { layout: "stat"; value: string; label: string; note?: string }
  | { layout: "list"; title: string; items: string[] }            // 2–5 items
  | { layout: "myth-fact"; myth: string; fact: string }
  | { layout: "before-after"; before: string[]; after: string[] }
  | { layout: "steps"; title: string; steps: string[] }           // 2–4
  | { layout: "quote"; text: string; by?: string }
  | { layout: "chart"; title: string; bars: { label: string; value: number }[]; unit?: string }  // 2–5 bars
  | { layout: "cta"; title: string; button: string; url: string };
```

The first slide is always `cover`, the last always `cta` (carousels only). Text
limits per field are enforced in code by asking for a rewrite of the overflowing
slide once, then truncating with an ellipsis. Numbers that are not in the profile or
a trend source are labelled as examples ("مثال" / "example"), following the
existing marketing brief rule.

**Art:** the cover plus up to 2 other slides get `art` (a FLUX prompt). One art
style per carousel: flat editorial illustration in the brand's accent and panel
colours, plain background, no text. Drawn with the existing `media/images.ts`
call at 1024×1024 and saved as `art/<n>.png`.

**Rendering** (`src/render/carousel.ts`): one HTML page per slide at
**1080×1350**, screenshotted with puppeteer-core in the same Chrome that
`marketing/site.ts` uses, to `slides/01.png …`. Style:

- Background: the brand `background` with a soft radial tint of `accent`;
  cards in `panel`; text in `text`; highlights and the CTA button in `cta`.
- Fonts: the brand heading/body fonts from Google Fonts when `googleFonts`
  lists them, else system fonts (SF Arabic / SF Pro).
- `dir="rtl"` and Arabic-friendly line height when the language is `ar`.
- Light branding: logo 56 px in the top corner (start side), `@handle` and
  `n / total` at the bottom, nothing else from the website. No screenshots, no photos.
- Text sizes fit by measuring in the page: shrink the font in steps until no
  element overflows, with a floor (titles 44 px, body 28 px).

Files: `slides/*.png`, `caption.txt` (caption, blank line, hashtags), and
`GET /api/clients/:id/posts/:postId/zip` streams a zip of both (`zip` CLI).

### Reel

`src/clients/reel.ts` turns the idea into the existing marketing pipeline: a
`MarketingBrief` copied from the client profile with `seconds: 45` (cap 60),
`platforms: ["Instagram Reels"]`, `notes` = goal + hook + outline + "say the hook in the
first 2 seconds", creativity `creative`, format `short`. It then runs the same
write → art → voice → render steps the marketing session uses, as one job, and
stores `projectId`. The reel's caption and hashtags come from the project's
`marketing.post`. The reel is opened in the existing project view.

## 4. Studio screen

- Sidebar: under "Marketing video", a **Clients** group listing clients. A client is
  created from a URL on the marketing start page, or with **Instagram client** on a
  marketing project's panel.
- Route `/marketing/clients/:id` with tabs:
  - **Today**: trends used (title + link), 5 idea cards (format and goal badges, angle,
    hook, outline, why) with **Make** / **Skip**, a date picker for past days, and
    **Get 5 more**.
  - **Posts**: grid of posts; a carousel opens as a swipeable 4:5 preview with
    caption, **Copy caption**, **Download zip**, **Edit slides** (fields per slide,
    then re-render; art is not redrawn unless its prompt changes); a reel links to
    its project.
  - **Profile**: the profile fields, handle, language, daily ideas on/off,
    brand colours and logo (read-only preview).
- Making anything is a background job with progress, like renders today.

## 5. API

| Method | Path | Does |
|---|---|---|
| GET | `/api/clients` | list |
| POST | `/api/clients` | create `{ fromProject }` or `{ url }` |
| GET / PUT | `/api/clients/:id` | read / edit profile |
| GET | `/api/clients/:id/ideas?date=` | that day's file (today by default) |
| POST | `/api/clients/:id/ideas` | job: 5 more ideas for today |
| POST | `/api/clients/:id/ideas/:ideaId/skip` | mark skipped |
| POST | `/api/clients/:id/ideas/:ideaId/make` | job: make the post |
| GET | `/api/clients/:id/posts` | list |
| GET / PUT | `/api/clients/:id/posts/:postId` | read / edit slides + caption, PUT re-renders |
| GET | `/api/clients/:id/posts/:postId/zip` | download |
| GET | `/api/clients/:id/files/*` | slide PNGs, art, logo |

## 6. Errors and costs

- Every LLM reply is validated with zod; one retry with the validation errors, then
  the job fails with a readable message on the post or idea.
- Trend search failing never blocks ideas.
- Chrome missing → the same error `site.ts` gives.
- Costs are recorded with the existing `usage.ts` helpers. Expected: ideas
  ≈ $0.01–0.03 per client per day; carousel ≈ $0.05 (3 FLUX pictures); reel = the
  existing marketing video cost.

## 7. Testing

`node --test` (built in, no new dependency), files in `src/**/*.test.ts`, script
`npm test`:

- idea rules: format mix, angle repeats, hook repeats against history, counts;
- slide validation: first `cover`, last `cta`, item counts, text limits;
- caption builder: ≤ 2,200 characters and ≤ 30 hashtags, `#` stripped/added once;
- client from a marketing project: field mapping;
- carousel render smoke test: render a 3-slide fixture in Arabic, assert 3 PNGs of
  1080×1350.

Then a real run on Risero: create the client from the project, make today's 5
ideas, make one carousel and one reel, and look at every slide.
