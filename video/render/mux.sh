#!/usr/bin/env bash
# Packages the rendered picture with separate audio tracks. No narration is mixed in.
#   track 1 (default): music + sound effects — the bed your voice-over sits on
#   track 2: music stem · track 3: sound-effects stem · track 4: silent voice-over placeholder
set -euo pipefail
cd "$(dirname "$0")/../.."
mkdir -p video/out/stems
ffmpeg -y -loglevel error \
  -i video/build/picture.mp4 \
  -i video/build/audio/bed.wav -i video/build/audio/music.wav -i video/build/audio/sfx.wav -i video/voiceover.wav \
  -map 0:v -map 1:a -map 2:a -map 3:a -map 4:a \
  -c:v copy -c:a aac -b:a 256k -ar 48000 \
  -metadata title="SignalLost — technical demo" \
  -metadata:s:a:0 title="Music + SFX (no narration)" -metadata:s:a:0 language=eng \
  -metadata:s:a:1 title="Music stem" -metadata:s:a:2 title="Sound-effects stem" \
  -metadata:s:a:3 title="Voice-over placeholder (silent)" \
  -disposition:a:0 default -disposition:a:1 0 -disposition:a:2 0 -disposition:a:3 0 \
  -shortest -movflags +faststart \
  video/out/SignalLost-demo.mp4
cp video/build/audio/music.wav video/build/audio/sfx.wav video/build/audio/bed.wav video/out/stems/
echo "Wrote video/out/SignalLost-demo.mp4 and video/out/stems/"
