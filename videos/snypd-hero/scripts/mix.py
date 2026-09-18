"""
The v2 soundtrack as ONE file (docs/26, second cut): one continuous voice take cut at its own pauses and placed on the music's
bar lines; the bed at one steady level under it, one slow swell where nobody speaks, one join (four bars out, under a scene cut);
a static master gain to -14 LUFS with a limiter. No per-line levelling, no ducking in and out.
.venv/bin/python scripts/mix.py  →  assets/audio/mix.wav + assets/audio/mix.json
"""
import json, subprocess, numpy as np, librosa, soundfile as sf
SR = 48000
PERIOD, START = 0.54542, 0.1084          # the bed's fitted grid: 110.0 bpm, beat 1 at 0.108 s (music time)
BAR = 4 * PERIOD
mbar = lambda n: START + (n - 1) * BAR   # music bar n → music seconds
SKIP = 1                                  # the film starts at music bar 2
fbar = lambda n, beat=1: START + (n - 1) * BAR + (beat - 1) * PERIOD   # film bar n, beat b → film seconds
CUT_FROM, CUT_TO = 17 + SKIP - 1, 21 + SKIP - 1   # music bars 17..20 come out: the join is at film bar 16, the cut to the gate

def load(p):
    y, _ = librosa.load(p, sr=SR, mono=False); return y if y.ndim == 2 else np.stack([y, y])

# ── the bed ──
m = load("assets/audio/takes/bedv2-2.mp3")
a0, a1, b0 = int(mbar(1 + SKIP) * SR) - int(0.010 * SR), int(mbar(CUT_FROM + 1) * SR) - int(0.012 * SR), int(mbar(CUT_TO + 1) * SR) - int(0.012 * SR)
n = int(0.015 * SR); A, B = m[:, a0:a1 + n].copy(), m[:, b0:]
A[:, -n:] = A[:, -n:] * np.cos(np.linspace(0, np.pi / 2, n)) + B[:, :n] * np.sin(np.linspace(0, np.pi / 2, n))
bed = np.concatenate([A, B[:, n:]], axis=1); k = int(0.35 * SR); bed[:, :k] *= np.linspace(0, 1, k) ** 1.5
offset = mbar(1 + SKIP) - 0.010 - START      # film time 0.108 = the first downbeat the film hears

# ── the voice: one take, cut at its own pauses ──
v = load("assets/audio/takes/take2-marin-1.wav")
SEG = [("L1", 0.00, 2.83, 0.45), ("L2", 3.397, 6.468, 3.65), ("L3a", 7.230, 8.175, 6.95), ("L3b", 8.553, 11.002, 9.00), ("L4", 11.731, 16.945, 12.10),
       ("L5", 17.776, 19.743, 17.70), ("L6", 20.471, 25.526, 26.50), ("L7", 26.059, 29.979, 33.05), ("L8", 30.659, 33.165, 37.50), ("L9", 33.728, 36.25, 41.85)]
LEN = 44.8
voice = np.zeros((2, int(LEN * SR))); placed = []; segs = []
for name, s, e, at in SEG:
    seg = v[:, max(0, int((s - 0.05) * SR)):int((e + 0.12) * SR)].copy(); f = int(0.03 * SR)
    seg[:, :f] *= np.linspace(0, 1, f); seg[:, -f:] *= np.linspace(1, 0, f)
    segs.append((name, at, seg))
rms = {n: 20 * np.log10(np.sqrt((x ** 2).mean()) + 1e-9) for n, _, x in segs}; med = float(np.median(list(rms.values())))
for name, at, seg in segs:                       # one take, so the lines already match; a line is nudged toward the take's median by at most 4 dB
    seg = seg * 10 ** (float(np.clip(med - rms[name], -4, 4)) / 20)
    i = int((at - 0.05) * SR); voice[:, i:i + seg.shape[1]] += seg[:, :voice.shape[1] - i]
placed = [{"id": n, "start": round(at, 2), "end": round(at + (e - s0), 2)} for n, s0, e, at in SEG]

# ── levels: static. voice as recorded (+ one gain); the bed one level under it, one swell through the looks (no voice there) ──
def lufs(x):
    sf.write("/tmp/_l.wav", x.T, SR); out = subprocess.run(["ffmpeg", "-hide_banner", "-i", "/tmp/_l.wav", "-af", "ebur128", "-f", "null", "-"], capture_output=True, text=True).stderr
    return float(out.split("I:")[-1].split("LUFS")[0])
vg = 10 ** ((-16.0 - lufs(v)) / 20)                       # the take's own loudness → -16
groove = bed[:, int(20 * SR):int(30 * SR)]; bg = 10 ** ((-25.0 - lufs(groove)) / 20)   # the full groove sits 11 LU under the voice
env = np.ones(int(LEN * SR)); t = np.arange(len(env)) / SR
swell = 10 ** (4.5 / 20); up0, up1, dn0, dn1 = 19.9, 20.9, 25.3, 26.4
env = np.where((t >= up0) & (t < up1), 1 + (swell - 1) * (t - up0) / (up1 - up0), env); env = np.where((t >= up1) & (t < dn0), swell, env)
env = np.where((t >= dn0) & (t < dn1), swell + (1 - swell) * (t - dn0) / (dn1 - dn0), env)
intro = 10 ** (8.0 / 20)   # the first three bars are the take's light groove, 13 dB under its full one: lifted so the voice never stands alone, and the lift at bar 4 still lifts
env = np.where(t < 6.40, intro, env); env = np.where((t >= 6.40) & (t < 6.65), intro + (1 - intro) * (t - 6.40) / 0.25, env)
bedf = np.zeros_like(voice); L = min(bed.shape[1], bedf.shape[1]); bedf[:, :L] = bed[:, :L]
mix = voice * vg + bedf * bg * env
g = 10 ** ((-14.0 - lufs(mix)) / 20); mix *= g
sf.write("assets/audio/mix-pre.wav", mix.T, SR); sf.write("/tmp/_bedonly.wav", (bedf * bg * env * g).T, SR); sf.write("/tmp/_voiceonly.wav", (voice * vg * g).T, SR)
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", "assets/audio/mix-pre.wav", "-af", "alimiter=limit=0.89:attack=3:release=60:level=false", "assets/audio/mix.wav"], check=True)
json.dump({"bpm": 60 / PERIOD, "bar": BAR, "beat": PERIOD, "bars": {str(i): round(fbar(i), 3) for i in range(1, 22)}, "music_ends": round(bed.shape[1] / SR, 2),
           "join_at": round(fbar(16), 2), "voice": placed, "length": LEN}, open("assets/audio/mix.json", "w"), indent=1)
print("voice gain %.2f dB, bed gain %.2f dB, master %.2f dB" % (20 * np.log10(vg), 20 * np.log10(bg), 20 * np.log10(g)))
print("bed ends at film", round(bed.shape[1] / SR, 2), "| final = film bar 20 at", round(fbar(20), 2)); print(json.dumps(placed))
