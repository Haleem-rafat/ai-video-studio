# AI Video Studio

Makes YouTube Shorts and long videos on this Mac, with no API costs.

```
topic ──► Bonsai 27B (script.json) ──► macOS voice (audio/*.wav) ──► HyperFrames (index.html ──► video.mp4)
```

## Layout

| Path | What it holds |
|---|---|
| `bin/start-llm.sh` | Starts Bonsai 27B as a local server on :8080 |
| `config/channels.json` | Each channel's audience, tone, voice and colours |
| `prompts/script.md` | The script-writing prompt (edit freely) |
| `src/llm.ts` | Talks to the local Bonsai server |
| `src/script-writer.ts` | Topic to checked `script.json` |
| `src/voice.ts` | Narration per scene (macOS `say`, swap for Kokoro/ElevenLabs later) |
| `src/composition.ts` | Script and audio to a HyperFrames `index.html` |
| `src/make-video.ts` | The command that runs all four steps |
| `output/<date>-<channel>-<format>-<topic>/` | Everything one video produced |

The model and its runtime live outside the project in `~/ai/bonsai`
(set `BONSAI_DIR` to move them).

## One-time setup

```bash
brew install cmake ffmpeg
cd ~/ai/bonsai
git clone --depth 1 https://github.com/PrismML-Eng/llama.cpp
cd llama.cpp && cmake -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build -j 8 --target llama-server
hf download prism-ml/Ternary-Bonsai-2-27B-gguf Ternary-Bonsai-2-27B-PTQ1_0.gguf --local-dir ~/ai/bonsai

cd /Users/mac/Documents/prsonal/ai-video-studio && npm install
```

## Make a video

Terminal 1 (leave running):

```bash
npm run llm
```

Terminal 2:

```bash
npm run video -- --channel dev-pixel --format short --topic "Why senior developers get paid twice as much"
npm run video -- --channel money-mechanics --format long --topic "How compound interest really works"
```

Each run writes `script.json`, `audio/`, `index.html`, `youtube.txt` (title, description, tags) and `video.mp4`
into its own `output/` folder.

Rerun only voice and render after editing `script.json` by hand:

```bash
npm run video -- --from output/<folder>
```

Preview in the browser instead of rendering: add `--no-render`, then `cd output/<folder> && npx hyperframes preview`.
