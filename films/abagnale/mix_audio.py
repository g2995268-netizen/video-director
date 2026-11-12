#!/usr/bin/env python3
"""Mix the measured voice with a ducked bed and the timeline's foley.

Peaks are synthesized at the cue, so placement offset is zero.
Music is hard-cut at the two planned silences. No reverb tail.
"""

import json
import math
import subprocess
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent
TL = json.loads((ROOT / "timeline.json").read_text())
SR = 44100
DUR = float(TL["meta"]["dur"])
N = int(round(DUR * SR))


def beat(name):
    sid, key = name.split(".")
    for scene in TL["scenes"]:
        if scene["id"] == sid:
            return float(scene["beats"][key])
    raise KeyError(name)


def silence_mask(n):
    m = np.ones(n, np.float32)
    fade = int(0.02 * SR)
    for window in TL["silences"]:
        a = int(window["from"] * SR)
        b = int(window["to"] * SR)
        m[a:b] = 0
        if a >= fade:
            m[a - fade:a] *= np.linspace(1, 0, fade, dtype=np.float32)
        if b + fade < n:
            m[b:b + fade] *= np.linspace(0, 1, fade, dtype=np.float32)
    return m


def env_exp(n, tau):
    t = np.arange(n, dtype=np.float32) / SR
    return np.exp(-t / tau).astype(np.float32)


def noise(n, seed):
    rng = np.random.default_rng(seed)
    return rng.standard_normal(n).astype(np.float32)


def place(buf, sig, at, gain):
    a = int(round(at * SR))
    if a < 0:
        sig = sig[-a:]
        a = 0
    b = min(N, a + len(sig))
    if a >= N or b <= a:
        return
    buf[a:b] += sig[: b - a] * gain


def pen():
    n = int(0.09 * SR)
    burst = noise(n, 3) * env_exp(n, 0.03)
    # crude band emphasis: difference of two moving averages
    k = 8
    ker = np.ones(k, np.float32) / k
    smooth = np.convolve(burst, ker, mode="same")
    return (burst - smooth)


def whoosh():
    n = int(0.42 * SR)
    t = np.arange(n, dtype=np.float32) / SR
    amp = np.sin(np.pi * t / t[-1]) ** 2
    raw = noise(n, 9)
    return (raw * amp * env_exp(n, 0.2)).astype(np.float32)


def paper():
    n = int(0.14 * SR)
    return noise(n, 11) * env_exp(n, 0.04)


def thump(freq, dur, seed):
    n = int(dur * SR)
    t = np.arange(n, dtype=np.float32) / SR
    body = np.sin(2 * math.pi * freq * t) * env_exp(n, 0.09)
    click = noise(n, seed) * env_exp(n, 0.012)
    return (body + 0.35 * click).astype(np.float32)


def riser(dur):
    n = int(dur * SR)
    t = np.arange(n, dtype=np.float32) / SR
    freq = 70 * (2 ** (t / dur))
    phase = 2 * math.pi * np.cumsum(freq) / SR
    amp = (t / dur) ** 1.4
    return (np.sin(phase) * amp).astype(np.float32)


def bed(mask):
    t = np.arange(N, dtype=np.float32) / SR
    beat_s = 60 / 84
    phase = np.mod(t, beat_s) / beat_s
    pulse = np.sin(2 * math.pi * 55 * t) * np.exp(-phase * 16)
    chase = ((t >= 17.96) & (t < 38.98)).astype(np.float32)
    # 40 ms fade at the chase edges
    fade = int(0.04 * SR)
    start = int(17.96 * SR)
    chase[start:start + fade] *= np.linspace(0, 1, fade, dtype=np.float32)
    tone = np.zeros(N, np.float32)
    a = int(39.52 * SR)
    tt = np.arange(N - a, dtype=np.float32) / SR
    tone[a:] = np.sin(2 * math.pi * 110 * tt) * (1 - np.exp(-tt / 0.2)) * 0.45
    out = (0.55 * pulse * chase + tone) * mask
    return out.astype(np.float32)


def main():
    vo = np.zeros(N, np.float32)
    raw = subprocess.check_output([
        "ffmpeg", "-v", "error", "-i", str(ROOT / "audio" / "vo_1.08x.wav"),
        "-f", "f32le", "-ac", "1", "-ar", str(SR), "-",
    ])
    src = np.frombuffer(raw, np.float32)
    vo[: min(N, len(src))] = src[:N]

    sfx = np.zeros(N, np.float32)
    place(sfx, pen(), beat("s1.pen1"), 0.16)
    place(sfx, pen(), beat("s1.pen2"), 0.12)
    place(sfx, pen(), beat("s1.pen3"), 0.09)
    place(sfx, whoosh(), beat("s4.depart"), 0.12)
    place(sfx, paper(), beat("s5.hand"), 0.10)
    place(sfx, thump(90, 0.28, 21), beat("s7.caught") - 0.02, 0.22)
    rise = riser(beat("s7.silenceIn") - beat("s7.notSig"))
    place(sfx, rise, beat("s7.notSig"), 0.14)
    place(sfx, thump(62, 0.45, 27), beat("s7.payoffHit"), 0.32)
    place(sfx, paper(), beat("s8.sits") + 0.04, 0.10)

    mask = silence_mask(N)
    music = bed(mask) * 0.09
    sfx *= mask

    mix = vo + music + sfx
    peak = float(np.max(np.abs(mix)))
    if peak > 0.89:
        mix *= 0.89 / peak
    out = (ROOT / "draft" / "mix.wav")
    out.parent.mkdir(exist_ok=True)
    pcm = np.clip(mix, -1, 1)
    with wave.open(str(out), "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((pcm * 32767).astype(np.int16).tobytes())
    print("wrote", out, "peak", round(float(np.max(np.abs(pcm))), 3), "sec", N / SR)


if __name__ == "__main__":
    main()
