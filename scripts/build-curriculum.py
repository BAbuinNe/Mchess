import json
import re
from pathlib import Path

root = Path(__file__).resolve().parents[1]
text = (root / "tz-training-extract.txt").read_text(encoding="utf-8")
pattern = re.compile(r"Задача (\d{2})\. ([^\n]+)\nЗадание\. ([^\n]+)\nКритерий решения\. ([^\n]+)")
steps = []
for match in pattern.finditer(text):
    number = int(match.group(1))
    course = ["basics", "calculation", "openings", "endgame", "application"][(number - 1) // 10]
    steps.append({"number": number, "course": course, "title": match.group(2), "task": match.group(3), "criterion": match.group(4)})
assert len(steps) == 50 and [step["number"] for step in steps] == list(range(1, 51))
(root / "apps" / "web" / "src" / "curriculum.json").write_text(json.dumps(steps, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("Extracted 50 theoretical steps across five courses")

