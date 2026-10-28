#!/usr/bin/env bash
# Technical QA for the finished film. Writes video/build/qa/report.txt plus scene contact sheets
# and stem waveforms for visual inspection.
set -euo pipefail
cd "$(dirname "$0")/../.."
film=video/out/SignalLost-demo.mp4
qa=video/build/qa
mkdir -p "$qa"
report="$qa/report.txt"
{
  echo "== Container and streams"
  ffprobe -v error -show_entries format=duration,size,bit_rate:stream=index,codec_name,profile,width,height,r_frame_rate,avg_frame_rate,pix_fmt,color_space,nb_frames,channels,sample_rate:stream_tags=title \
    -of default=noprint_wrappers=1 "$film"
  echo
  echo "== Black frames (≥ 0.1 s below 3% luma; the final fade to black is expected)"
  ffmpeg -v info -i "$film" -map 0:v -vf blackdetect=d=0.1:pix_th=0.03 -f null - 2>&1 | grep -o 'black_start.*' || echo "none"
  echo
  echo "== Frozen picture (≥ 1.5 s with no change)"
  ffmpeg -v info -i "$film" -map 0:v -vf freezedetect=n=0.0008:d=1.5 -f null - 2>&1 | grep -o 'freeze_[a-z]*: [0-9.]*' || echo "none"
  echo
  for stem in bed music sfx; do
    echo "== Loudness: $stem"
    ffmpeg -v info -i "video/build/audio/$stem.wav" -af ebur128=peak=true -f null - 2>&1 | sed -n '/Summary/,$p' | grep -E 'I:|LRA:|Peak:'
  done
  echo
  echo "== Voice-over placeholder"
  ffprobe -v error -show_entries format=duration:stream=sample_rate,channels,bits_per_raw_sample -of default=noprint_wrappers=1 video/voiceover.wav
  ffmpeg -v info -i video/voiceover.wav -af volumedetect -f null - 2>&1 | grep -E 'max_volume' || true
} > "$report"

# One contact sheet per scene: six evenly spaced frames.
node -e '
  const t = require("./video/timeline.json");
  for (const s of t.scenes) console.log(s.id, s.start, s.end);
' | while read -r id start end; do
  len=$(echo "$end - $start" | bc -l)
  ffmpeg -nostdin -v error -y -ss "$start" -t "$len" -i "$film" \
    -vf "fps=6/$len,scale=640:-1,tile=3x2:padding=6:color=0x333333" -frames:v 1 "$qa/scene_$id.jpg"
done
for stem in music sfx bed; do
  ffmpeg -v error -y -i "video/build/audio/$stem.wav" -filter_complex "showwavespic=s=1800x240:split_channels=0:colors=0xc6fa6b" -frames:v 1 "$qa/wave_$stem.png"
done
cat "$report"
