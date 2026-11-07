"""Generate web and Android launcher icons from the supplied MChess artwork."""

from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
source = Image.open(root / "resources/app-icon-source.png").convert("RGBA")
public = root / "apps/web/public"
res = root / "apps/web/android/app/src/main/res"

width, height = source.size
side = min(width, height)
left = (width - side) // 2
top = (height - side) // 2
source = source.crop((left, top, left + side, top + side))

def render(size):
    return source.resize((size, size), Image.Resampling.LANCZOS)

for size in (192, 512):
    render(size).save(public / f"icon-{size}.png")

for density, size in {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}.items():
    folder = res / f"mipmap-{density}"
    for name in ("ic_launcher.png", "ic_launcher_round.png", "ic_launcher_foreground.png"):
        render(size).save(folder / name)
