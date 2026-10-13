# AI Video Studio

Makes YouTube Shorts and long videos on this Mac.

```
topic ─► Bonsai 27B (script + fact-check) ─► ElevenLabs (voice) ─► FLUX (pictures) ─► HyperFrames (video.mp4)
```

## Open the studio

Double-click **`Open Studio.command`** in Finder, or run `npm start`. The studio opens at http://localhost:4300.

- **Start Bonsai** with the button at the top right (about 35 seconds to load).
- **New video:** pick a channel and format, get topic ideas, then click *Write script*.
- **Project screen:**
  - Edit each scene's narration, on-screen graphic and background picture.
  - Reorder scenes on the timeline by dragging.
  - Click *Update preview* to re-voice and redraw only what changed, then play it live.
  - *Quick render* makes a draft mp4; *Final render* makes the upload version.

Costs per Short: about 1,100 ElevenLabs characters and $0.08 of FLUX pictures. Bonsai and HyperFrames run on this Mac for free.

## Command line

```bash
npm run llm                                              # start Bonsai on :8080
npm run topics -- --channel money-mechanics --focus "money history"
npm run video -- --channel dev-pixel --format short --topic "Why switching jobs pays more"
npm run video -- --project <id>                          # rebuild after editing output/<id>/project.json
```

## Layout

| Path | What it holds |
|---|---|
| `app/` | The studio screen (React, built by Vite into `dist/`) |
| `src/server/` | The studio server: API, background jobs, live-preview runtime |
| `src/pipeline.ts` | The steps both the studio and the CLI run |
| `src/script/` | Bonsai: script, long-video outline and chapters, fact-check, topic ideas |
| `src/media/` | ElevenLabs voice (with word timings) and FLUX pictures |
| `src/render/` | HyperFrames composition: motion graphics, captions, mascots |
| `config/channels.json` | Each channel's audience, tone, voice, mascot, picture style and colours |
| `prompts/` | Every prompt Bonsai gets (edit freely) |
| `output/<id>/` | One video: `project.json`, `audio/`, `images/`, `index.html`, `video.mp4`, `youtube.txt` |

Keys live in `.env` (`ELEVENLABS_API_KEY`, `FAL_KEY`). The model and its llama.cpp build live in `~/ai/bonsai`
(set `BONSAI_DIR` to move them).

## One-time setup (already done on this Mac)

```bash
brew install cmake ffmpeg
cd ~/ai/bonsai && git clone --depth 1 https://github.com/PrismML-Eng/llama.cpp
cd llama.cpp && cmake -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build -j 8 --target llama-server
hf download prism-ml/Ternary-Bonsai-2-27B-gguf Ternary-Bonsai-2-27B-PTQ1_0.gguf --local-dir ~/ai/bonsai
cd /Users/mac/Documents/prsonal/ai-video-studio && npm install
```
