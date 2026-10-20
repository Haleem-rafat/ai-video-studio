# Website promo

A promo video of any website: the real site scrolling top to bottom on a laptop and a phone, side by side, with music. Approved in chat on 2026-10-20.

## Decisions (from the user)

- A Marketing-mode feature for any URL, not a one-off.
- Both devices together in one frame (laptop large, phone in front of its lower right corner).
- Music only: no captions, no voice.
- Both shapes: 16:9 (1920×1080) and 9:16 (1080×1920).
- Current Marketing mode is unchanged; this is an addition.

## How it works

1. **Record** (`src/promo/record.ts`): Chrome opens the site at 1440×900 (desktop) and 390×844 @2x (phone, each in its own browser with `--force-device-scale-factor` so the frame stream is sharp). Cookie banners, chat bubbles and pop-ups are hidden; the page is scrolled once to wake lazy content. Chrome's frame stream (CDP `Page.startScreencast`) records a 1.6 s hold, a 16 s eased scroll to the bottom (at most 12 000 px), and a 1.8 s hold. Frames keep their paint times, so ffmpeg plays them back at real speed. The page's colors are read without AI.
2. **Compose** (`src/promo/compose.ts`, `layout.ts`): three layers drawn as PNGs: background with the laptop's shadow, the laptop bezel with the phone's shadow, and the phone bezel with a status bar. ffmpeg stacks them with the two recordings, adds a 4 % push-in, fades, and `assets/music/lofi-1.mp3`.
3. **Store** (`src/promo/store.ts`): `output/.promos/<id>/promo.json` plus `promo-16x9.mp4` and `promo-9x16.mp4`. Promos left "making" by a restart are marked failed.

## In the app

- Sidebar → **Website promo** (`/marketing/promos`): paste a URL, watch the job, play and download both videos, record again.
- A client's page → **Website promo** button (uses the client's URL); finished promos of the client's site appear in its Library (Videos filter) at $0.
- Jobs are labelled `Website promo: <host>` and link to the promo's page.

Cost: $0 in AI (Chrome and ffmpeg on the Mac).
