# Client library, costs and art styles

Date: 2026-10-20 · Status: approved in chat · Extends `2026-10-20-instagram-clients-design.md`

## Goal

1. **Every thing made shows its cost**: each carousel, single image, reel, marketing video and
   day of ideas, plus per-client totals (this month, all time) and the studio total.
2. **Marketing is organised by client**: a client's page has a **Library** (All / Videos /
   Carousels / Images) that also holds the client's earlier marketing videos (matched by
   website), and the sidebar's Marketing list is grouped by client.
3. **Art styles**: 12 trendy styles that change the AI pictures *and* the slide look, plus a
   picture amount (Light / Rich). The client has defaults; each Make can override them.

The current Marketing mode's behaviour does not change; its videos are only *listed* in a
client's Library.

## 1. Costs

Costs are already recorded by the job runner as `usage.json`:

| Thing | Where its cost lives |
|---|---|
| Carousel / single image | `output/.clients/<id>/posts/<postId>/usage.json` |
| Reel and any marketing video | `output/<projectId>/usage.json` |
| Day of ideas | `output/.clients/<id>/usage.json`, entries whose `job` starts with `Ideas: `, grouped by the local date of `at` |
| Making the client | `output/.clients/<id>/usage.json` (job target changes from the studio ledger to the client folder) |

`/api/usage` (the studio total) also reads every client folder and every post folder.

## 2. Library

`GET /api/clients/:id/library` returns

```ts
type LibraryItem = {
  id: string;                                  // post id or project id
  kind: "carousel" | "single" | "reel" | "video";
  title: string;
  createdAt: string;
  cost: number;                                // US dollars
  status: string;                              // post status, or "done"/"draft" for a project
  postId?: string;
  projectId?: string;
  format?: "short" | "long";                   // videos
  cover?: string;                              // client-files path of the first slide
};
type Library = {
  items: LibraryItem[];                        // newest first
  totals: { all: number; month: number; ideas: number; posts: number; videos: number };
  ideasByDate: Record<string, number>;          // YYYY-MM-DD → cost
};
```

- Videos are marketing projects whose `marketing.brand.url` has the client's host
  (`www.` ignored). A project linked from a reel post is the reel, not a separate video.
- Totals: `all` = ideas + client creation + posts + videos; `month` = the same for the
  current local month.

Screen: the **Posts** tab becomes **Library** with filter chips All / Videos / Carousels /
Images; every card shows its cost; a video card plays its `video.mp4` inline and opens its
project. The header shows "This month $x · All time $y". Each idea day shows its cost next
to the date.

Sidebar: the Marketing project list groups projects under the client whose website they
match; projects of no client stay under "Other".

## 3. Art styles

`src/clients/styles.ts` exports `ART_STYLES`, 12 presets:

| id | Label | Picture direction | Slide look |
|---|---|---|---|
| flat | Flat editorial | flat editorial vector, soft grain | the current look |
| clay | 3D clay | 3D clay/plasticine render, Pixar-like soft light | big radius, soft deep shadows |
| cartoon | Cartoon | bold cartoon, thick outlines, flat bright colour | thick outline cards, hard offset shadow |
| isometric | Isometric 3D | isometric 3D scene, clean geometry | small radius, gradient cards |
| anime | Anime | anime cel-shaded illustration | accent glow, medium radius |
| doodle | Doodle | hand-drawn marker doodle, sketchbook | dashed borders, uneven corners |
| papercut | Paper cut | layered paper-cut craft with depth | stacked offset shadows |
| riso | Risograph | retro risograph print, grain, halftone | grain texture, tight corners |
| glass | Glass neon | glassmorphism, neon glow, futuristic | translucent cards, glowing headings |
| line | Line art | minimal monoline drawing, lots of space | outline-only cards |
| collage | Collage | mixed-media collage, torn paper, stickers | slightly rotated cards with tape |
| photo | Photo | realistic editorial photograph | larger pictures, soft cards |

Each preset is `{ id, label, picture: string, css: string }`; `css` is appended after the
base slide CSS and may use the brand colours. Brand colours, logo and fonts stay in every
style.

**Picture amount** (`"light" | "rich"`): Light = cover + at most 2 others (today's rule);
Rich = every slide gets a picture (the writer is asked for art on every slide, and slides
without it get a prompt built from their own text).

**Settings**: `Client.artStyle` (default `flat`) and `Client.pictures` (default `light`) in the
Profile tab; **Make** opens a small menu to override both for that post. The post stores
`artStyle` and `pictures`; re-renders keep them.

**Previews**: `POST /api/clients/styles/previews` draws one sample per style once (a phone with
a calendar and chat bubbles) into `output/.clients/.styles/<id>.png` (~$0.30 for all 12);
`GET /client-styles/<id>.png` serves them; the picker shows them, or the label alone when
missing.

## Testing

Pure, with `node --test`: host matching, cost grouping by date and month, library assembly
from fixture folders (posts, projects, usage files), style CSS present per style, Rich gives
every slide art, a post's style survives a re-render. Then a real run: previews, one Risero
carousel in 3D clay (Rich) and one in Cartoon, and the Library with costs.
