#!/usr/bin/env bash
# Starts Ternary Bonsai 27B as a local OpenAI-compatible server on :8080.
# Needs PrismML's llama.cpp fork; stock llama.cpp cannot load ternary weights.
set -euo pipefail

BONSAI_DIR="${BONSAI_DIR:-$HOME/ai/bonsai}"
MODEL="${BONSAI_MODEL:-$BONSAI_DIR/Ternary-Bonsai-2-27B-PTQ1_0.gguf}"
SERVER="$BONSAI_DIR/llama.cpp/build/bin/llama-server"

[[ -x "$SERVER" ]] || { echo "llama-server not built: $SERVER" >&2; exit 1; }
[[ -f "$MODEL" ]] || { echo "Model not downloaded: $MODEL" >&2; exit 1; }

# 16K context keeps the KV cache small enough for a 16 GB Mac next to Chrome.
exec "$SERVER" -m "$MODEL" \
  -ngl 99 -fa on -c 16384 \
  --jinja --host 127.0.0.1 --port "${LLM_PORT:-8080}"
