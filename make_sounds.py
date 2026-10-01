#!/usr/bin/env python3
"""
Synthesise the alternative sound themes for the Chess app.

The 'default' theme is the user-supplied pack (sound_01..12, already in
assets/sounds/default/). Every other theme is generated here from scratch so
the app ships a full set of distinct, royalty-free sound themes.

Output: assets/sounds/<theme>/<event>.mp3
"""
import os
import subprocess
import sys
import wave

import numpy as np

SR = 44100
HERE = os.path.dirname(os.path.abspath(__file__))
OUT_ROOT = os.path.join(HERE, "assets", "sounds")
FFMPEG = "/tmp/sfx/ffmpeg"

EVENTS = ["move", "moveOpp", "capture", "castle", "check", "promote",
          "illegal", "notify", "gameStart", "gameEnd", "checkmate", "tenSecond"]

# event -> list of (freq multiplier, start seconds, duration seconds, gain)
SCORE = {
    "move":      [(1.00, 0.00, 0.11, 1.00)],
    "moveOpp":   [(0.84, 0.00, 0.11, 0.92)],
    "capture":   [(0.66, 0.00, 0.17, 1.15)],
    "castle":    [(0.90, 0.00, 0.10, 0.95), (0.90, 0.075, 0.12, 0.85)],
    "check":     [(1.20, 0.00, 0.12, 1.00), (1.80, 0.070, 0.16, 0.95)],
    "promote":   [(1.00, 0.00, 0.10, 0.85), (1.26, 0.065, 0.10, 0.90),
                  (1.50, 0.130, 0.20, 1.00)],
    "illegal":   [(0.52, 0.00, 0.17, 1.00), (0.55, 0.00, 0.17, 0.90)],
    "notify":    [(1.50, 0.00, 0.12, 0.90), (2.00, 0.080, 0.18, 0.90)],
    "gameStart": [(1.00, 0.00, 0.12, 0.85), (1.26, 0.080, 0.12, 0.90),
                  (1.89, 0.160, 0.26, 1.00)],
    "gameEnd":   [(1.50, 0.00, 0.13, 0.95), (1.26, 0.090, 0.13, 0.90),
                  (1.00, 0.180, 0.30, 1.00)],
    "checkmate": [(1.50, 0.00, 0.14, 1.00), (1.26, 0.100, 0.14, 0.95),
                  (1.12, 0.200, 0.14, 0.95), (0.75, 0.300, 0.42, 1.10)],
    "tenSecond": [(2.00, 0.00, 0.09, 0.85), (2.00, 0.130, 0.12, 0.85)],
}

# theme -> (base frequency, timbre name)
THEMES = {
    "standard":   (440, "click"),
    "wood":       (240, "wood"),
    "metal":      (620, "metal"),
    "marble":     (900, "marble"),
    "bubble":     (520, "bubble"),
    "futuristic": (480, "future"),
    "arcade":     (440, "arcade"),
    "robot":      (300, "robot"),
}


def env_exp(n, decay):
    return np.exp(-decay * np.linspace(0, 1, n))


def attack(x, ms=3):
    a = int(SR * ms / 1000)
    if a < len(x):
        x[:a] *= np.linspace(0, 1, a)
    return x


def voice(timbre, freq, dur):
    n = max(8, int(SR * dur))
    t = np.arange(n) / SR
    rng = np.random.default_rng(int(freq) % 9973 + n)

    if timbre == "click":
        y = np.sin(2 * np.pi * freq * t) * env_exp(n, 26)
        y += 0.35 * rng.normal(0, 1, n) * env_exp(n, 150)

    elif timbre == "wood":
        y = np.sin(2 * np.pi * freq * t) * env_exp(n, 30)
        y += 0.6 * np.sin(2 * np.pi * freq * 2.76 * t) * env_exp(n, 55)
        y += 0.5 * rng.normal(0, 1, n) * env_exp(n, 200)
        y = np.tanh(y * 1.6)

    elif timbre == "metal":
        y = np.zeros(n)
        for p, g in [(1.0, 1.0), (2.41, .6), (3.83, .4), (5.17, .3), (7.11, .2)]:
            y += g * np.sin(2 * np.pi * freq * p * t) * env_exp(n, 9 * (1 + p * .12))
        y += 0.2 * rng.normal(0, 1, n) * env_exp(n, 120)

    elif timbre == "marble":
        y = np.sin(2 * np.pi * freq * t) * env_exp(n, 60)
        y += 0.7 * np.sin(2 * np.pi * freq * 1.98 * t) * env_exp(n, 85)
        y += 0.45 * rng.normal(0, 1, n) * env_exp(n, 320)

    elif timbre == "bubble":
        sweep = freq * (1 + 0.85 * np.linspace(0, 1, n) ** 2)
        ph = 2 * np.pi * np.cumsum(sweep) / SR
        y = np.sin(ph) * env_exp(n, 22)

    elif timbre == "future":
        sweep = freq * (1 + 0.5 * np.linspace(0, 1, n))
        ph = 2 * np.pi * np.cumsum(sweep) / SR
        y = np.sin(ph) * env_exp(n, 14)
        y += 0.45 * np.sin(ph * 2.002) * env_exp(n, 20)
        y += 0.18 * rng.normal(0, 1, n) * env_exp(n, 40)

    elif timbre == "arcade":
        sq = np.sign(np.sin(2 * np.pi * freq * t))
        step = max(1, SR // 8000)
        sq = np.repeat(sq[::step], step)[:n]           # crunchy bit-rate
        y = sq * env_exp(n, 18) * 0.7

    elif timbre == "robot":
        sq = np.sign(np.sin(2 * np.pi * freq * t))
        ring = np.sin(2 * np.pi * (freq * 0.17) * t)
        y = sq * ring * env_exp(n, 16) * 0.8
        y += 0.25 * rng.normal(0, 1, n) * env_exp(n, 90)

    else:
        y = np.sin(2 * np.pi * freq * t) * env_exp(n, 25)

    return attack(y.astype(np.float64))


def render(theme, event):
    base, timbre = THEMES[theme]
    notes = SCORE[event]
    total = max(s + d for (_, s, d, _) in notes) + 0.06
    buf = np.zeros(int(SR * total))
    for mult, start, dur, gain in notes:
        v = voice(timbre, base * mult, dur) * gain
        i = int(SR * start)
        buf[i:i + len(v)] += v
    peak = np.abs(buf).max()
    if peak > 0:
        buf = buf / peak * 0.82
    # gentle fade-out so nothing clicks at the tail
    f = int(SR * 0.02)
    buf[-f:] *= np.linspace(1, 0, f)
    return buf


def write_mp3(path, samples):
    tmp = path.replace(".mp3", ".wav")
    pcm = (np.clip(samples, -1, 1) * 32767).astype("<i2")
    with wave.open(tmp, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    subprocess.run([FFMPEG, "-hide_banner", "-loglevel", "error", "-y",
                    "-i", tmp, "-ac", "1", "-ar", "44100", "-b:a", "80k", path],
                   check=True)
    os.remove(tmp)


def main():
    if not os.path.exists(FFMPEG):
        sys.exit("ffmpeg not found at " + FFMPEG)
    grand = 0
    for theme in THEMES:
        d = os.path.join(OUT_ROOT, theme)
        os.makedirs(d, exist_ok=True)
        size = 0
        for ev in EVENTS:
            p = os.path.join(d, ev + ".mp3")
            write_mp3(p, render(theme, ev))
            size += os.path.getsize(p)
        grand += size
        print(f"  {theme:<11} {len(EVENTS):>2} clips  {size/1024:6.1f} KB")
    print(f"  {'TOTAL':<11} {len(THEMES)*len(EVENTS):>2} clips  {grand/1024:6.1f} KB")


if __name__ == "__main__":
    main()
