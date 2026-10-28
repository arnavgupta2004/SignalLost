"""Synthesises the film's audio stems from timeline.json and build/edl.json.

Outputs (48 kHz, 24-bit PCM WAV):
  video/build/audio/music.wav   original ambient score, following the timeline's music cues
  video/build/audio/sfx.wav     sound effects at resolved event times
  video/build/audio/bed.wav     music + sfx, the default mix with no narration
  video/voiceover.wav           silent placeholder of the exact film length, for your recording

Everything is generated here with seeded randomness, so every run is bit-identical and nothing
is downloaded.
"""

import json
import os
import struct
import wave

import numpy as np

SR = 48_000
timeline = json.load(open("video/timeline.json"))
edl = json.load(open("video/build/edl.json"))
DUR = float(timeline["duration"])
N = int(DUR * SR)
t_all = np.arange(N) / SR


def write_wav(path, data):
    """Write float audio in [-1, 1] as 24-bit PCM; data is (n,) mono or (n, 2) stereo."""
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    data = np.atleast_2d(data.T).T if data.ndim == 1 else data
    pcm = np.clip(np.round(data * 8_388_607), -8_388_608, 8_388_607).astype("<i4")
    raw = pcm.reshape(-1).view(np.uint8).reshape(-1, 4)[:, :3].tobytes()
    with wave.open(path, "wb") as w:
        w.setnchannels(data.shape[1])
        w.setsampwidth(3)
        w.setframerate(SR)
        w.writeframes(raw)


def midi(note):
    return 440.0 * 2 ** ((note - 69) / 12)


def smooth(x, a, b):
    """0 → 1 raised-cosine ramp between a and b."""
    k = np.clip((x - a) / (b - a), 0, 1)
    return 0.5 - 0.5 * np.cos(np.pi * k)


def band(sig, lo, hi):
    spec = np.fft.rfft(sig)
    f = np.fft.rfftfreq(len(sig), 1 / SR)
    gain = np.clip((f - lo * 0.7) / (lo * 0.3 + 1e-9), 0, 1) * np.clip((hi * 1.3 - f) / (hi * 0.3), 0, 1)
    return np.fft.irfft(spec * gain, len(sig))


def reverb(sig, seconds=2.8, decay=0.85, seed=7, damp=5000):
    rng = np.random.default_rng(seed)
    n = int(seconds * SR)
    tt = np.arange(n) / SR
    out = []
    for ch in range(2):
        ir = rng.standard_normal(n) * np.exp(-tt / decay)
        ir = band(ir, 120, damp)
        ir /= np.sqrt(np.sum(ir**2))
        size = 1 << int(np.ceil(np.log2(len(sig) + n)))
        y = np.fft.irfft(np.fft.rfft(sig, size) * np.fft.rfft(ir, size), size)[: len(sig)]
        out.append(y)
    return np.stack(out, axis=1)


# ---------------------------------------------------------------- music
rng = np.random.default_rng(2026)


def pad_voice(freq, start, end, gain, fade=2.5):
    i0, i1 = int(max(0, start - fade) * SR), int(min(DUR, end + fade) * SR)
    tt = t_all[i0:i1]
    env = smooth(tt, start - fade, start + fade) * (1 - smooth(tt, end - fade, end + fade))
    tone = np.zeros_like(tt)
    for cents in (-6, 0, 6):
        f = freq * 2 ** (cents / 1200)
        for h in range(1, 7):
            tone += np.sin(2 * np.pi * f * h * tt + rng.uniform(0, 2 * np.pi)) / h**1.7
    tone *= 1 + 0.12 * np.sin(2 * np.pi * 0.11 * tt + rng.uniform(0, 6.28))
    out = np.zeros(N)
    out[i0:i1] = tone * env * gain / 3
    return out


chords = [
    [38, 50, 57, 65, 72, 76],  # Dm9
    [34, 46, 53, 57, 62, 69],  # B♭maj7
    [41, 53, 60, 67, 69, 72],  # Fadd9
    [36, 48, 55, 62, 67, 74],  # Csus2
]
# Section loudness of the pad bed, following the music cue sheet.
section_gain = np.ones(N) * 0.0
for start, end, g in [(0, 7, 0.0), (7, 29, 0.55), (29, 49, 0.5), (49, 64, 0.6), (64, 75, 0.5), (75, 86, 0.32), (86, 90, 0.0)]:
    section_gain += ((t_all >= start) & (t_all < end)) * g
section_gain = np.convolve(section_gain, np.ones(SR) / SR, mode="same")  # 1 s glide between sections

pads = np.zeros(N)
for i, start in enumerate(np.arange(7, 86, 8.0)):
    chord = chords[i % 4]
    for j, note in enumerate(chord):
        # The validation section keeps only bass and one inner voice.
        weight = 1.0 if j < 4 else 0.55
        pads += pad_voice(midi(note), start, min(start + 8, 86), 0.16 * weight)
music = pads * section_gain

# Intro drone: low D, fifth and air, swelling under the cold open.
drone_env = smooth(t_all, 0, 2.5) * (1 - smooth(t_all, 7.5, 10))
drone = sum(np.sin(2 * np.pi * midi(n) * t_all + rng.uniform(0, 6)) / k for k, n in [(1, 26), (2, 38), (3, 45)])
air = band(rng.standard_normal(N), 300, 2500) * 0.025
music += (0.16 * drone + air * 1.6) * drone_env

# Working pulse (29–64 s): muted plucks at 96 BPM on chord tones; brighter during extraction.
beat = 60 / 96
pluck = np.zeros(N)
for k, t0 in enumerate(np.arange(29, 64, beat)):
    chord = chords[int((t0 - 7) // 8) % 4]
    note = chord[2 + (k % 3)] + (12 if t0 >= 49 and k % 4 == 3 else 0)
    n = int(0.45 * SR)
    i0 = int(t0 * SR)
    tt = np.arange(min(n, N - i0)) / SR
    bright = 1.0 if t0 < 49 else 1.0 + 0.8 * (t0 - 49) / 15
    tone = np.sin(2 * np.pi * midi(note) * tt) + 0.25 * bright * np.sin(4 * np.pi * midi(note) * tt)
    level = 0.05 * (1 if t0 < 49 else 1.25) * (0.75 if k % 2 else 1)
    pluck[i0 : i0 + len(tt)] += tone * np.exp(-tt / 0.14) * level
pulse_env = smooth(t_all, 28.5, 30) * (1 - smooth(t_all, 62.4, 64.2))
music += pluck * pulse_env

# Resolve (86–90 s): D major add9, fading to silence by 89.8 s.
resolve = np.zeros(N)
for note in [38, 50, 57, 62, 66, 69, 76]:
    resolve += pad_voice(midi(note), 86.2, 88.5, 0.13, fade=1.2)
music += resolve * (1 - smooth(t_all, 88.6, 89.8))

wet = reverb(music, seconds=3.2, decay=1.1, seed=11)
music_st = np.stack([music, music], axis=1) * 0.55 + wet * 0.75
music_st *= (1 - smooth(t_all, 89.0, 89.9))[:, None]
# Level by loudness, not peak: the main pad section sits at −27 dBFS RMS, a bed that stays
# under a voice recorded around −16 LUFS; the closing chord is then the loudest moment.
main = music_st[7 * SR : 29 * SR]
music_st *= 10 ** (-27 / 20) / np.sqrt(np.mean(main**2))

# ---------------------------------------------------------------- sound effects
fx = np.zeros(N)


def place(sig, at, gain):
    i0 = int(at * SR)
    if i0 >= N:
        return
    n = min(len(sig), N - i0)
    fx[i0 : i0 + n] += sig[:n] * gain


def ts(seconds):
    return np.arange(int(seconds * SR)) / SR


def impact():
    t = ts(2.2)
    f = 35 + 45 * np.exp(-t / 0.25)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.7)
    hit = band(rng.standard_normal(len(t)), 60, 900) * np.exp(-t / 0.08) * 0.5
    return body + hit


def ping():
    t = ts(1.4)
    return (np.sin(2 * np.pi * 1318.5 * t) + 0.35 * np.sin(2 * np.pi * 1975.5 * t)) * np.exp(-t / 0.32) * np.minimum(1, t / 0.004) * 0.6


def shimmer():
    t = ts(2.4)
    s = sum(np.sin(2 * np.pi * f * t + rng.uniform(0, 6)) for f in (2349, 2794, 3520, 4186, 5274))
    return s / 5 * smooth(t, 0, 0.35) * np.exp(-np.maximum(0, t - 0.35) / 0.7) * 0.7


def whoosh():
    t = ts(0.9)
    noise = rng.standard_normal(len(t))
    low, high = band(noise, 150, 1200), band(noise, 1200, 7000)
    k = smooth(t, 0, 0.6)
    env = smooth(t, 0, 0.42) * (1 - smooth(t, 0.42, 0.9))
    return (low * (1 - k) + high * k * 0.6) * env * 0.9


def tick():
    t = ts(0.06)
    click = band(rng.standard_normal(len(t)), 2000, 9000) * np.exp(-t / 0.004)
    return (click * 0.6 + np.sin(2 * np.pi * 2900 * t) * np.exp(-t / 0.012) * 0.4) * 0.8


def confirm():
    out = np.zeros(int(1.2 * SR))
    for k, f in enumerate((659.25, 987.77)):
        t = ts(1.0)
        tone = (np.sin(2 * np.pi * f * t) + 0.2 * np.sin(4 * np.pi * f * t)) * np.exp(-t / 0.28) * np.minimum(1, t / 0.005)
        i0 = int(k * 0.085 * SR)
        out[i0 : i0 + len(t)] += tone * 0.5
    return out


def boost():
    t = ts(1.6)
    f = 280 + 700 * smooth(t, 0, 0.5)
    rise = np.sin(2 * np.pi * np.cumsum(f) / SR) * smooth(t, 0, 0.08) * np.exp(-np.maximum(0, t - 0.5) / 0.35)
    return rise * 0.55 + np.concatenate([np.zeros(int(0.35 * SR)), shimmer()])[: len(t)] * 0.6


def tractor():
    t = ts(2.0)
    hum = (np.sin(2 * np.pi * 110 * t) + 0.5 * np.sin(2 * np.pi * 220.7 * t)) * (1 + 0.3 * np.sin(2 * np.pi * 7 * t))
    return hum * smooth(t, 0, 0.5) * (1 - smooth(t, 1.0, 2.0)) * 0.45


def data():
    out = np.zeros(int(0.4 * SR))
    for k, f in enumerate((1568, 2093, 2637)):
        t = ts(0.05)
        i0 = int(k * 0.06 * SR)
        out[i0 : i0 + len(t)] += np.sin(2 * np.pi * f * t) * np.exp(-t / 0.015) * 0.5
    return out


def resolve_hit():
    t = ts(3.5)
    bell = sum(np.sin(2 * np.pi * midi(n) * t) * np.exp(-t / 1.1) for n in (74, 78, 81)) / 3
    hit = np.zeros(len(t))
    body = impact()
    hit[: len(body)] = body
    return hit * 0.5 + bell * 0.6


synth = {"impact": impact, "ping": ping, "shimmer": shimmer, "whoosh": whoosh, "tick": tick, "confirm": confirm,
         "boost": boost, "tractor": tractor, "data": data, "resolve": resolve_hit}
for cue in edl["sfx"]:
    place(synth[cue["type"]](), cue["time"], cue["gain"])

fx_st = np.stack([fx, fx], axis=1) * 0.8 + reverb(fx, seconds=1.8, decay=0.45, seed=5, damp=7000) * 0.35
fx_st *= 10 ** (-12 / 20) / np.max(np.abs(fx_st))  # peaks at −12 dBFS

bed = music_st + fx_st
bed *= min(1.0, 10 ** (-6 / 20) / np.max(np.abs(bed)))

write_wav("video/build/audio/music.wav", music_st)
write_wav("video/build/audio/sfx.wav", fx_st)
write_wav("video/build/audio/bed.wav", bed)
write_wav("video/voiceover.wav", np.zeros(N))
print(f"Wrote stems: {DUR:.1f} s at {SR} Hz, {len(edl['sfx'])} effects")
