// Resolves timeline.json against the captured clips into build/edl.json: concrete clip in-points
// and speeds, plus every sound-effect event. Edits name a recorded event (a click, a stage
// success, the boost) and the film time it must land on, so a fresh capture re-aligns itself.
import { readFile, writeFile } from 'node:fs/promises';

const timeline = JSON.parse(await readFile('video/timeline.json', 'utf8'));
const clips = Object.fromEntries(
  JSON.parse(await readFile('video/build/footage/clips.json', 'utf8')).map((c) => [c.name, c]),
);
const mission = JSON.parse(await readFile('video/build/footage/mission.json', 'utf8'));

function markTime(clip, { mark, n }) {
  const found = clips[clip].marks.filter((m) => m.kind === mark)[n];
  if (!found) throw new Error(`${clip}: no ${mark} #${n}`);
  return found.time;
}

const edits = [];
for (const edit of timeline.edits) {
  const clip = clips[edit.clip];
  if (!clip) throw new Error(`Missing clip ${edit.clip}`);
  const length = edit.end - edit.start;
  let input = edit.in ?? 0,
    speed = edit.speed ?? 1;
  if (edit.align) input = markTime(edit.clip, edit.align) - (edit.align.at - edit.start) * speed;
  if (edit.continue) {
    const previous = edits.at(-1);
    input = previous.in + (previous.end - previous.start) * previous.speed;
    if (edit.until)
      speed = (markTime(edit.clip, edit.until) - input) / (edit.until.at - edit.start);
  }
  const out = input + length * speed;
  if (input < 0 || out > clip.duration + 1e-6)
    throw new Error(
      `${edit.clip}: needs ${input.toFixed(2)}–${out.toFixed(2)} s of ${clip.duration} s`,
    );
  edits.push({ ...edit, in: Number(input.toFixed(4)), speed: Number(speed.toFixed(4)) });
}

// Sound effects for real interactions that are on screen.
const sfx = [...timeline.sfx];
for (const edit of edits) {
  for (const mark of clips[edit.clip].marks) {
    const cue = timeline.markSfx[mark.kind];
    const at = edit.start + (mark.time - edit.in) / edit.speed;
    if (cue && at >= edit.start && at < edit.end)
      sfx.push({ time: Number(at.toFixed(3)), ...cue, from: edit.clip });
  }
}
for (const time of timeline.lifeSigns) sfx.push({ time, type: 'ping', gain: 0.32 });
sfx.sort((a, b) => a.time - b.time);

await writeFile(
  'video/build/edl.json',
  JSON.stringify(
    {
      edits,
      sfx,
      mission,
      rects: Object.fromEntries(Object.values(clips).map((c) => [c.name, c.rects])),
    },
    null,
    2,
  ),
);
for (const e of edits)
  console.log(
    `${e.start.toFixed(1).padStart(5)}–${e.end.toFixed(1).padEnd(5)} ${e.clip.padEnd(13)} in ${e.in.toFixed(2)} ×${e.speed}`,
  );
console.log(`${sfx.length} sound events`);
