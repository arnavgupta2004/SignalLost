#!/usr/bin/env bash
# Rebuilds the SignalLost film from scratch: capture → resolve → audio → render → mux → QA.
#   video/build.sh            full rebuild, including a fresh capture of the real app
#   video/build.sh --reuse    keep existing footage in video/build/footage
# Requires Node 22+, npm dependencies, Python 3 with NumPy, and FFmpeg with libx264.
# Set CHROMIUM_PATH if Playwright's bundled browser is not installed.
set -euo pipefail
cd "$(dirname "$0")/.."
port=4317
if [[ "${1:-}" != "--reuse" ]]; then
  npm run build >/dev/null
  server_pid=""
  if ! curl -sf "http://127.0.0.1:$port/api/health" >/dev/null; then
    PORT=$port APP_URL="http://127.0.0.1:$port" npx tsx server/index.ts >/dev/null 2>&1 &
    server_pid=$!
    trap '[[ -n "$server_pid" ]] && kill "$server_pid"' EXIT
    for _ in $(seq 30); do curl -sf "http://127.0.0.1:$port/api/health" >/dev/null && break; sleep 0.5; done
  fi
  # The capture drives a live UI in real time; retry once if a step times out.
  CAPTURE_URL="http://127.0.0.1:$port" node video/capture/capture.mjs ||
    CAPTURE_URL="http://127.0.0.1:$port" node video/capture/capture.mjs
fi
node video/render/resolve.mjs
node video/render/voiceover-csv.mjs
python3 video/render/audio.py
node video/render/render.mjs
video/render/mux.sh
video/render/qa.sh
