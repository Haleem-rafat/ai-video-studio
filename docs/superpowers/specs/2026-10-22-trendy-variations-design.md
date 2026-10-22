# Trendy variations: carousel designs, post formats, reel styles, compare

Approved in chat on 2026-10-22. The aim: many trendy, selectable variations for carousels and reels, branded from the client's website as today, in Marketing mode and on client pages.

## Decisions (from the user)

- The studio picks the styles from current trends (Instagram's "trending post ideas for business" page and 2026 carousel and Reel roundups).
- One shared catalog for client pages and Marketing mode. Marketing mode turns its website into a client, as the studio already can, so posts land in a client Library with costs, Knowledge and Prompted mode.
- Variations: visual designs, post formats, reel styles, and making several at once to compare.
- Nothing changes by default: the Classic design and the Classic reel are today's output.

## Parts (each usable on its own)

1. **Carousel designs**: 12 looks, each in the brand's colours, fonts, logo, name and @handle.
   - The looks: Classic (today), Bold type, Dark neon, Magazine, Minimal, Glass, Neo-brutal, Notes app, Tweet/thread, DM chat, Sticky notes, Swiss grid.
   - The design sets the slide look; the art style sets the pictures. With any design but Classic, the art style no longer restyles the slides.
   - Free previews: sample slides in the client's brand, drawn with Chrome (no AI).
   - Chosen per post, with a default on the client.
2. **Post formats**: List, Checklist, Mistakes, Myth vs fact, Before/after, Step by step, This vs that, Teardown, Story, Stats, FAQ, Comment-to-get.
   - Each gives the writer a structure; new layouts as needed (versus, chat bubbles, tweet, checklist).
3. **Reel styles**: Classic, Kinetic text, Website tour, Two-voice debate, Before→after reveal, Countdown list, Stat punch, DM/notification story, Myth buster, Lo-fi caption.
   - Each is a recipe (scene types, order, pace, captions) for the existing marketing writer, with 1–2 new scene types if needed.
4. **Marketing mode and Compare**:
   - Marketing mode gets "Carousel" and "Reel" buttons beside the video.
   - Compare makes one post per chosen variation (2–4) side by side, with the cost estimated before starting.

## Part 1 detail

- `src/clients/designs.ts`: `DESIGN_IDS`, `DESIGNS` (label, description, `css(ctx)` with `ctx` = colours, Arabic, name, handle, logo, index, total), `designOf`.
- `src/render/carousel.ts`: `SlideContext.design`; design CSS after the base; art style CSS only with Classic; `renderSlides(…, style, design)`.
- `Post.design`, `Client.design` (the default); `makePost(…, { design })`; re-render keeps the post's design.
- Previews: `renderDesignPreviews(client)` draws a cover and a list slide per design into `<client>/designs/`. Server routes list the designs, draw the previews (a job, $0) and serve the files.
- UI: a design picker in the Make chooser and in Profile (default), with previews; a design badge on Library cards.
- Tests: the catalog; Classic HTML identical to today; design CSS present and art style CSS dropped for non-Classic designs; text escaped and right to left in Arabic; every design renders a non-blank slide.
