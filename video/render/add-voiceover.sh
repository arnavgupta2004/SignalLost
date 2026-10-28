#!/usr/bin/env bash
# Adds your recorded narration to the finished film.
#   video/render/add-voiceover.sh path/to/your-voiceover.wav
# Your file should start at 0:00 and follow video/voiceover_timing.csv. The music and effects
# duck under your voice automatically; the result is loudness-normalised for YouTube (−14 LUFS).
set -euo pipefail
cd "$(dirname "$0")/../.."
vo="${1:?Usage: video/render/add-voiceover.sh your-voiceover.wav}"
ffmpeg -y -loglevel error \
  -i video/build/picture.mp4 -i video/build/audio/bed.wav -i "$vo" \
  -filter_complex "\
    [2:a]aresample=48000,aformat=channel_layouts=stereo,apad,asplit=2[vo][key];\
    [1:a][key]sidechaincompress=threshold=0.02:ratio=5:attack=25:release=450:makeup=1[ducked];\
    [ducked][vo]amix=inputs=2:normalize=0:duration=first,loudnorm=I=-14:TP=-1.5:LRA=11[mix]" \
  -map 0:v -map "[mix]" -c:v copy -c:a aac -b:a 256k -shortest -movflags +faststart \
  video/out/SignalLost-demo-with-voiceover.mp4
echo "Wrote video/out/SignalLost-demo-with-voiceover.mp4"
