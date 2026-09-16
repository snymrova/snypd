"""Paint over Claude Code's account-usage line for the frames it is on screen (docs/15 §9 R4).
    python3 packages/bench/readme/mask.py <in.mp4> <out.mp4> <from-to> [<from-to>…]    e.g. 5.7-8.65
The line — "You've used N % of your weekly limit · resets …" — is about the recorder's subscription, not
the product or the model's work; it sits above the input box while a prompt is typed and moves as the box
grows. Within the given seconds, and only in the band above the input box, every row that carries the
line's amber is painted the terminal's own background; nothing else in a clip is touched. The raw take
is kept beside the masked one, and the README's pictures note says this was done."""
import subprocess, sys, numpy as np
src, dst, ranges = sys.argv[1], sys.argv[2], [tuple(map(float, r.split("-"))) for r in sys.argv[3:]]
W, H, FPS = 1440, 900, 30
BG = np.array([0x1d, 0x1a, 0x17], np.uint8)
Y0, Y1, X0 = 700, 790, 600           # the band above the input box; the line is right-aligned
dec = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-i", src, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
enc = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                        "-c:v", "libx264", "-crf", "20", "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart", dst], stdin=subprocess.PIPE)
n = painted = 0
while True:
    buf = dec.stdout.read(W * H * 3)
    if len(buf) < W * H * 3: break
    t = n / FPS
    if any(a <= t <= b for a, b in ranges):
        f = np.frombuffer(buf, np.uint8).reshape(H, W, 3).copy()
        band = f[Y0:Y1, X0:]
        amber = (band[:, :, 0] > 170) & (band[:, :, 1] > 120) & (band[:, :, 2] < 130)
        rows = np.where(amber.sum(axis=1) > 20)[0]
        if len(rows):
            lo, hi = rows.min() - 4, rows.max() + 5
            f[Y0 + lo:Y0 + hi, X0:W - 24] = BG
            painted += 1
        buf = f.tobytes()
    enc.stdin.write(buf); n += 1
enc.stdin.close(); enc.wait(); dec.wait()
print(f"{dst}  {n} frames, {painted} painted")
