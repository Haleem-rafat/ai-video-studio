# Reels (1080×1920, 30 fps)

Code-drawn reel styles, rendered frame by frame in Chrome and encoded with ffmpeg.
A reel is a folder ("job") with a script, a voice, and one JSON per style.

| Style | Page | Look |
| --- | --- | --- |
| `rpg` | `rpg/rpg.js`, `rpg/character.js` | 16-bit RPG UI: HUD + XP bar, quest log that checks off with the voice, scrolling code + frame counter, talking pixel portrait with typed Arabic, voice visualizer, starfield + CRT lines |
| `news` | `news/news.js` | Breaking news in the channel's colours (`brand`): header (initial, handle, pulsing عاجل, company logo), media card with Ken Burns, word-by-word headline with an accent phrase, stat cards that count up, source line; bottom 25% left empty for Instagram |
| `proof` | `proof/proof.js` | Top half: real page screenshots in a Mac browser window, big stat cards; bottom half: the channel's cartoon character (mascot poses) at a desk; English hook card, captions in a dark box, «comment KEYWORD» at the end |
| `kinetic` | `kinetic/kinetic.js` | Motion reel: kinetic words on black with a faint grid, one key word per line in an italic serif inside a Figma-style selection box, UI mockups (chat, DM, browser, phone), rolling counters, a clicking cursor |
| `diagram` | `diagram/diagram.js` | Calm explainer on charcoal: headline with a gold punch phrase, one picture per scene (floating press photo with brackets and a scan line, exploded layer stack that lights up layer by layer, press quote, red stamp, price tag counting up, bars with a sticker, spec chips, a pick-one choice, the follow card) and the word being said alone and big under it |
| `editorial` | `editorial/editorial.js` | Story reel cutting between a dark spotlight stage and light grid paper: the line at the top with its key word selected like editor text, product photo in the light, press article with the phrase highlighted + red pull quote, red stamp, big price box, price bar chart with sticker, spec pills, choice, follow card with a pulse line |
| `aurora` | `aurora/aurora.js` | Aurora glass: 5 blurred colour lights drifting on slow paths over deep indigo, frosted glass cards (backdrop blur, 1px light edge), every piece fades up 8 px on sine curves, the line in a glass pill, a soft pad under it |
| `variety` | `variety/variety.js` | Variety captions: sun-yellow rays, fat words with a white stroke + coloured outer stroke + drop shadow that pop 0 → 1.15 → 1 and wiggle while they hold, burst frames for numbers and stamps, sparkles, boings and dings |
| `flat` | `flat/flat.js` | Flat vector: a flat colour field per scene, a circle wipe carries each cut, pieces land with anticipation → stretch → squash → overshoot, geometric shapes hop one at a time |
| `sketch` | `sketch/sketch.js` | Sketch notebook: lined paper, taped notes, a marker that circles the scene's big thing, highlighter over the key word, a hand-made wobble every 4 frames, pencil scribbles |

The last four (after [mg-styles-15](https://github.com/Vincentwei1021/mg-styles-15) and [bang-motion](https://github.com/bangtutorial/bang-motion), both MIT) share `lib/scenes.js`: it builds the scenes once and asks the look how scenes cut, how pieces pop and how words appear. They also draw two scene kinds of their own: `point` (a big number or sign with one short tip) and `chat` (2–4 bubbles), and work for a marketing **client** as well as a channel (`src/reels/client.ts`: the client's colours, logo, Gemini voice and dialect, written from its brief, knowledge and content direction).

## In the studio

**Reels** in the sidebar (or the two reel looks on **New video**): pick a style and a channel, type a
topic, and the writer researches it, writes the lines and the quests or scenes, and (news) downloads the
maker's press photos. Edit it there, then **Preview** (6 frames) or **Render**; changed lines are voiced
again, unchanged ones come from the cache. Reels live in `output/.reels/<id>/` (src/reels, src/server/reels.ts).

## Make a reel from the command line

```sh
# 1. lines.json: ["first line", ...] in Egyptian Arabic, numbers as digits, names in English
node reels/voice.mjs <job>/lines.json haleemrafat   # → voice.mp3 + timing.json (unchanged lines are cached)

# 2. look at a few frames first
node reels/render.mjs <job>/rpg.json --stills 2,10,30   # → <job>/stills-rpg/*.png

# 3. render
node reels/render.mjs <job>/rpg.json    # → <job>/rpg.mp4
node reels/render.mjs <job>/news.json   # → <job>/news.mp4
```

You can also bring your own `voice.mp3` and give `start`/`end` seconds instead of `line`.

## Job JSON

Anything with `"line": n` (rpg subs) or `"lines": [a, b]` (news scenes) gets its start/end
and spoken text from `timing.json`. Media paths are relative to the job folder.

**rpg.json**: `channel`, `level`, `character` (`preset`: `"girl"` | `"guy"`, `name`, and any colour
from `character.js` e.g. `"shirt"`), `quests` [{text, xp}], `subs` [{line, expression: talk|smile|wink,
key (word to underline), questIndex (quest checked when this line ends)}], `code` (file shown in the code panel).

**diagram.json / editorial.json / aurora.json / variety.json / flat.json / sketch.json** (`lib/story.js`): `headline` {text, highlight}, `handle`, `channel`, `logo` (an `avatar` file is cropped to the head), `accent`, `select` (editorial), `scenes` [{lines, kind: hook|photo|layers|quote|stamp|price|bars|specs|choice|follow|point|chat, label, media, layers, quote {source,text,highlight}, stamp, price {value,label}, bars [{label,value,shown}], delta, specs, choice, point {mark,text}, title, messages}], `accent2` (new looks), `music: "pad"` (aurora) or `bpm`, `subs` [{line, key}].

**news.json**: `handle`, `initial`, `company` ({logo} or {glyph}), `credit`, `source`, `date`,
`music: "beat"`, `scenes` [{lines, media (jpg/png/mp4), headline, highlight, stats [{label, value, sub, count:false}]}].

Common: `voice`, `fps` (30), `tail` (seconds after the voice), `out`.
Sound: voice + synthesised blips/chimes (rpg) or sting/whoosh/pops + beat (news), mixed to −14 LUFS.
