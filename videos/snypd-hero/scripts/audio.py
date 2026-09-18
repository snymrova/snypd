"""
The film's sound, through OpenRouter (BRIEF.md › Notes). The key comes from OPENROUTER_API_KEY and is written nowhere.

  python3 scripts/audio.py music [n]            n takes of the bed          → assets/audio/takes/bed-N.<ext>
  python3 scripts/audio.py audition v1,v2,v3    one line in several voices  → assets/audio/takes/audition-<voice>.wav
  python3 scripts/audio.py speak <voice> [ids]  the script's lines          → assets/audio/takes/vo-<id>.wav

`say` is what the model is sent; `show` is what the screen and the transcript say. "snypd" is said with "sny" as in "sky" — it sounds like "sniped" (Sunny, 18 Sep 2026; not "snipped").
"""
import base64, json, os, re, struct, subprocess, sys, urllib.request

KEY = os.environ.get("OPENROUTER_API_KEY") or sys.exit("OPENROUTER_API_KEY is not set")
URL = "https://openrouter.ai/api/v1/chat/completions"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "audio", "takes")
os.makedirs(OUT, exist_ok=True)

MUSIC_MODEL = "google/lyria-3-pro-preview"
MUSIC_PROMPT = (
    "Uplifting, driving electronic track for a fast, feel-good product film. 128 bpm, 4/4, major key. "
    "Four bars of filtered drums and claps building with a riser, then a half-beat of silence, then a full drop at bar five: "
    "punchy four-on-the-floor kick, a bright plucked synth hook, warm sidechained bass, crisp hi-hats. "
    "A three-bar breakdown at bar thirteen with no drums, only bass and a rising pad, a big impact at bar sixteen, "
    "back to the full groove for two bars, and a clean final hit at bar twenty with a short ring-out. "
    "Confident, bright, euphoric, modern. Instrumental only, no vocals, nothing melodic in the range of a speaking voice. "
    "About forty seconds long.")

VOICE_MODEL = "openai/gpt-audio"
DIRECTION = (
    "You are the voice of a fast, feel-good product film for a developer tool. Bright, smiling, quick, a little breathless, "
    "like the good part of a trailer. Short lines, hard stops, land the last word of each one. Never a documentary, never sleepy, "
    "never sing-song. The user gives you one line. Read it aloud word for word: nothing before it, nothing after it, no reply to it.")

LINES = [  # id, say (sent to the model), show (on screen and in the transcript)
    ("01", "No dashboard. No login. No forms.", None),
    ("02", "Just your agent.", None),
    ("03", "One sentence. A real page.", None),
    ("04", "Charts. Flows. Numbers with sources.", None),
    ("05", "Change the whole look. One sentence.", None),
    ("06", "Everything a CMS has. As files.", None),
    ("07", "Zero JavaScript. Twenty-three milliseconds. Measured in CI, or not claimed.", None),
    ("08", "And a gate that says no.", None),
    ("09", "Your repo. Your markdown. Published.", None),
    ("10", "Sniped. Give your agent a front door.", "snypd. Give your agent a front door."),
]

def stream(body):
    req = urllib.request.Request(URL, data=json.dumps(body).encode(), headers={
        "Authorization": f"Bearer {KEY}", "Content-Type": "application/json",
        "HTTP-Referer": "https://snypd.rocks", "X-Title": "snypd hero film"})
    audio, said, cost = b"", "", 0.0
    with urllib.request.urlopen(req, timeout=900) as r:
        for raw in r:
            line = raw.decode()
            if not line.startswith("data: ") or line.strip() == "data: [DONE]": continue
            d = json.loads(line[6:])
            if "error" in d: sys.exit(f"OpenRouter: {d['error']}")
            a = ((d.get("choices") or [{}])[0].get("delta") or {}).get("audio") or {}
            audio += base64.b64decode(a.get("data", "")); said += a.get("transcript", "")
            cost = (d.get("usage") or {}).get("cost", cost)
    return audio, said, cost

def wav(pcm, rate=24000):
    return (b"RIFF" + struct.pack("<I", 36 + len(pcm)) + b"WAVEfmt " + struct.pack("<IHHIIHH", 16, 1, 1, rate, rate * 2, 2, 16)
            + b"data" + struct.pack("<I", len(pcm)) + pcm)

def seconds(p):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p]).strip())

def words(s): return re.sub(r"[^a-z0-9 ]", "", s.lower().replace("-", " ")).split()

def speak(voice, text, path):
    pcm, said, cost = stream({"model": VOICE_MODEL, "stream": True, "modalities": ["text", "audio"],
        "audio": {"voice": voice, "format": "pcm16"},
        "messages": [{"role": "system", "content": DIRECTION},
                     {"role": "user", "content": f"Read this line aloud, exactly as written, and say nothing else:\n\n{text}"}]})
    open(path, "wb").write(wav(pcm))
    ok = words(said) == words(text)
    print(f"{os.path.relpath(path, ROOT)}  {seconds(path):.2f} s  ${cost:.4f}  {'ok' if ok else 'MISMATCH: ' + said!r}", flush=True)
    return ok

# v2 (Sunny, 18 Sep 2026: "too fast … sound is up down … script was loose"): one argument in full sentences, read in ONE
# take so the level, the pitch and the energy are continuous; the film is then timed to the take, on the music's bar lines.
SCRIPT2 = [
    ("Every CMS was built for a person at a dashboard.", None),
    ("But you have an agent now. So we threw the dashboard away.", None),
    ("This is sniped. One sentence in. A finished page out.", "This is snypd. One sentence in. A finished page out."),
    ("Charts, diagrams, sourced numbers. Static HTML, zero JavaScript.", None),
    ("Want a new look? Just say so.", None),
    ("A blog, case studies, a whole studio site. All of it, files in your repo.", None),
    ("And it checks the agent's work. A number with no source? Refused.", None),
    ("Your repo. Your markdown. Your site.", None),
    ("Sniped. Give your agent a front door.", "snypd. Give your agent a front door."),
]
DIRECTION2 = (
    "You are the voice of an upbeat product film for a developer tool. Warm, confident, smiling, clear. A steady, energetic pace: "
    "quick but never rushed, every word easy to catch. Keep the same energy, pitch and loudness from the first line to the last. "
    "The user gives you a short script, one line per paragraph. Read it aloud word for word, in order, as one continuous performance, "
    "with a clear pause of about one second between paragraphs. Say nothing before it, nothing after it, and do not reply to it.")

MUSIC_PROMPT2 = (
    "Feel-good, confident indie-electronic track for a product film with a narrator. 110 bpm, 4/4, major key. "
    "It starts straight away with a light groove for four bars: muted plucks, a soft kick, handclaps. At bar five it lifts into the full groove: "
    "warm round bass, bright plucked synth chords, tight drums, claps on two and four. The groove is steady and continuous from there, "
    "with no breakdown, no drop-outs and no silence, adding one small layer every four bars so it keeps rising. "
    "It ends on one big final hit with a short ring-out at about forty-five seconds. "
    "Optimistic, modern, clean and warm. Nothing harsh, no long risers, no vocals, and keep the midrange uncluttered so a speaking voice sits on top.")

cmd = sys.argv[1] if len(sys.argv) > 1 else sys.exit(__doc__)
if cmd == "music":
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 1
    start = 1 + len([f for f in os.listdir(OUT) if f.startswith("bed-")])
    for i in range(start, start + n):
        data, _, cost = stream({"model": MUSIC_MODEL, "stream": True, "modalities": ["audio"],
                                "messages": [{"role": "user", "content": MUSIC_PROMPT}]})
        ext = "mp3" if data[:3] == b"ID3" or data[:2] in (b"\xff\xfb", b"\xff\xf3") else "wav" if data[:4] == b"RIFF" else "bin"
        p = os.path.join(OUT, f"bed-{i}.{ext}"); open(p, "wb").write(data)
        print(f"{os.path.relpath(p, ROOT)}  {seconds(p):.1f} s  ${cost:.3f}", flush=True)
elif cmd == "music2":
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 1
    start = 1 + len([f for f in os.listdir(OUT) if f.startswith("bedv2-") and "cut" not in f])
    for i in range(start, start + n):
        data, _, cost = stream({"model": MUSIC_MODEL, "stream": True, "modalities": ["audio"], "messages": [{"role": "user", "content": MUSIC_PROMPT2}]})
        ext = "mp3" if data[:3] == b"ID3" or data[:2] in (b"\xff\xfb", b"\xff\xf3") else "wav" if data[:4] == b"RIFF" else "bin"
        p = os.path.join(OUT, f"bedv2-{i}.{ext}"); open(p, "wb").write(data)
        print(f"{os.path.relpath(p, ROOT)}  {seconds(p):.1f} s  ${cost:.3f}", flush=True)
elif cmd == "audition":
    for v in sys.argv[2].split(","):
        speak(v, LINES[0][1] + " " + LINES[-1][1], os.path.join(OUT, f"audition-{v}.wav"))  # the first line and the last: the pace, and the name
elif cmd == "take":   # python3 scripts/audio.py take <voice> [n]  → assets/audio/takes/take2-<voice>-N.wav
    voice, n = sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 1
    text = "\n\n".join(say for say, _ in SCRIPT2)
    for i in range(1, n + 1):
        path = os.path.join(OUT, f"take2-{voice}-{i}.wav")
        pcm, said, cost = stream({"model": VOICE_MODEL, "stream": True, "modalities": ["text", "audio"], "audio": {"voice": voice, "format": "pcm16"},
            "messages": [{"role": "system", "content": DIRECTION2}, {"role": "user", "content": "Read this script aloud, exactly as written, and say nothing else:\n\n" + text}]})
        open(path, "wb").write(wav(pcm)); ok = words(said) == words(text)
        print(f"{os.path.relpath(path, ROOT)}  {seconds(path):.2f} s  ${cost:.4f}  {'ok' if ok else 'MISMATCH: ' + said!r}", flush=True)
elif cmd == "speak":
    voice, only = sys.argv[2], set(sys.argv[3:])
    for i, say, _ in LINES:
        if only and i not in only: continue
        for attempt in range(3):
            if speak(voice, say, os.path.join(OUT, f"vo-{i}.wav")): break
else:
    sys.exit(__doc__)
