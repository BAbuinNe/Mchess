"""Turn draft transcriptions into a review queue; never auto-approve clips."""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "media-review" / "new-clips.jsonl"
TARGET = ROOT / "media-review" / "catalog.json"

# These are search candidates from imperfect speech recognition, not verified labels.
POSITIVE = {8, 13, 14, 16, 18, 20, 21, 23, 33}
NEGATIVE = {3, 4, 17, 31, 38, 39, 41, 44, 52}
PLAYTEST_EVENTS = {17: "negative_move", 20: "positive_move", 23: "positive_move", 39: "negative_move"}


def clip_number(filename: str) -> int:
    match = re.search(r"\((\d+)\)\.mp4$", filename)
    return int(match.group(1)) if match else 1


clips = []
for line in SOURCE.read_text(encoding="utf-8").splitlines():
    item = json.loads(line)
    number = clip_number(item["file"])
    candidate = "positive" if number in POSITIVE else "negative" if number in NEGATIVE else "unclear"
    clips.append({
        "id": f"meme-{number:02d}",
        "source_file": item["file"],
        "duration_seconds": item["seconds"],
        "transcript_draft": item["transcript_draft"],
        "candidate_tone": candidate,
        "event": PLAYTEST_EVENTS.get(number),
        "review_status": "provisional_playtest" if number in PLAYTEST_EVENTS else "pending_manual_audio_visual_review",
        "speaker_verified": False,
        "rights_verified": False,
        "background_removal_approved": number in PLAYTEST_EVENTS,
        "public_release_approved": False,
    })

clips.sort(key=lambda clip: int(clip["id"].split("-")[-1]))
TARGET.write_text(json.dumps({"version": 1, "clips": clips}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Wrote {len(clips)} clips to {TARGET}")
