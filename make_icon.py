#!/usr/bin/env python3
"""Launcher icons: crop the generated artwork to its rounded tile and
export every mipmap density."""
import os

from PIL import Image, ImageDraw, ImageChops

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "gen", "icon_a.png")
SIZES = {
    "mipmap-mdpi": 48, "mipmap-hdpi": 72, "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144, "mipmap-xxxhdpi": 192,
}


def load_tile():
    im = Image.open(SRC).convert("RGB")
    # trim the white margin the generator leaves around the rounded tile
    bg = Image.new("RGB", im.size, (255, 255, 255))
    diff = ImageChops.difference(im, bg).convert("L")
    box = diff.point(lambda p: 255 if p > 18 else 0).getbbox()
    if box:
        im = im.crop(box)
    s = min(im.size)
    im = im.crop(((im.width - s) // 2, (im.height - s) // 2,
                  (im.width + s) // 2, (im.height + s) // 2))
    return im


TILE = load_tile()


def render(size):
    S = size * 4
    im = TILE.resize((S, S), Image.LANCZOS).convert("RGBA")
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, S - 1, S - 1),
                                           radius=int(S * 0.22), fill=255)
    im.putalpha(mask)
    return im.resize((size, size), Image.LANCZOS)


NOTIFY_SIZES = {
    "drawable-mdpi": 24, "drawable-hdpi": 36, "drawable-xhdpi": 48,
    "drawable-xxhdpi": 72, "drawable-xxxhdpi": 96,
}


def notify_icon(px):
    """Status-bar icon: flat white knight silhouette on transparency."""
    import cairosvg
    import io
    S = px * 4
    png = cairosvg.svg2png(url=os.path.join(HERE, "assets", "pieces", "maestro", "wN.svg"),
                           output_width=S, output_height=S,
                           background_color="rgba(0,0,0,0)")
    src = Image.open(io.BytesIO(png)).convert("RGBA")
    white = Image.new("RGBA", (S, S), (255, 255, 255, 255))
    white.putalpha(src.split()[3])
    return white.resize((px, px), Image.LANCZOS)


def main():
    base = os.path.join(HERE, "res")
    for folder, px in SIZES.items():
        out = os.path.join(base, folder)
        os.makedirs(out, exist_ok=True)
        render(px).save(os.path.join(out, "ic_launcher.png"), "PNG", optimize=True)
        print(f"{folder:22s} {px:>3}px")
    for folder, px in NOTIFY_SIZES.items():
        out = os.path.join(base, folder)
        os.makedirs(out, exist_ok=True)
        notify_icon(px).save(os.path.join(out, "ic_notify.png"), "PNG", optimize=True)
        print(f"{folder:22s} {px:>3}px  ic_notify")
    render(512).save(os.path.join(HERE, "icon-512.png"), "PNG", optimize=True)
    print("preview 512px")


if __name__ == "__main__":
    main()
