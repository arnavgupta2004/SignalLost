// Writes video/voiceover_timing.csv from the narration in timeline.json.
import { readFile, writeFile } from 'node:fs/promises';

const timeline = JSON.parse(await readFile('video/timeline.json', 'utf8'));
const quote = (s) => `"${String(s).replace(/"/g, '""')}"`;
const clock = (s) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(1).padStart(4, '0')}`;
const rows = ['scene_id,start_time,end_time,narration,visual_cue'];
for (const v of timeline.voiceover)
  rows.push([v.scene, clock(v.start), clock(v.end), quote(v.text), quote(v.cue)].join(','));
await writeFile('video/voiceover_timing.csv', `${rows.join('\n')}\n`);
const words = timeline.voiceover.reduce((n, v) => n + v.text.split(/\s+/).length, 0);
console.log(`voiceover_timing.csv: ${timeline.voiceover.length} lines, ${words} words`);
