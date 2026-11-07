import json
import os
import subprocess
import sys
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw
import whisper

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
INPUT = Path(r"C:\Users\altte\Downloads\Telegram Desktop")
OUT = ROOT / "media-review"
OUT.mkdir(exist_ok=True)
FILES = sorted(INPUT.glob("video_2026-11-06_17-33-41*.mp4"))
model_path = Path(r"C:\Users\altte\Documents\Codex\2026-11-04\cvj\work\whisper-models\base.pt")
model = whisper.load_model(str(model_path), device="cpu")
existing = {}
result_path = OUT / "new-clips.jsonl"
if result_path.exists():
    for line in result_path.read_text(encoding="utf-8").splitlines():
        try:
            entry = json.loads(line)
            existing[entry["file"]] = entry
        except ValueError:
            pass

thumbs = []
for index, path in enumerate(FILES, 1):
    if path.name in existing:
        entry = existing[path.name]
    else:
        probe = subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height", "-of", "json", str(path)])
        info = json.loads(probe)
        duration = float(info["format"]["duration"])
        transcription = model.transcribe(str(path), language="ru", fp16=False, beam_size=2, condition_on_previous_text=False, verbose=False)
        text = transcription["text"].strip()
        entry = {"file": path.name, "seconds": round(duration, 2), "transcript_draft": text}
        with result_path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(entry, ensure_ascii=False) + "\n")
        print(f"{index}/{len(FILES)} {path.name}: {text[:90]}", flush=True)
    frame = subprocess.run(["ffmpeg", "-v", "error", "-ss", str(max(.1, entry["seconds"]/2)), "-i", str(path), "-frames:v", "1", "-vf", "scale=180:120:force_original_aspect_ratio=decrease", "-f", "image2pipe", "-vcodec", "png", "-"], capture_output=True)
    if frame.returncode == 0 and frame.stdout:
        thumb = Image.open(BytesIO(frame.stdout)).convert("RGB")
        thumbs.append((path.name, thumb))

cols = 5
cell_w, cell_h = 210, 150
sheet = Image.new("RGB", (cols*cell_w, ((len(thumbs)+cols-1)//cols)*cell_h), "#252525")
draw = ImageDraw.Draw(sheet)
for i, (name, thumb) in enumerate(thumbs):
    x, y = (i % cols)*cell_w, (i // cols)*cell_h
    sheet.paste(thumb, (x+10, y+5))
    draw.text((x+8, y+128), name.replace("video_2026-11-06_17-33-41", "clip"), fill="white")
sheet.save(OUT / "contact-sheet.jpg", quality=85)
print(f"Completed {len(thumbs)} clips", flush=True)
