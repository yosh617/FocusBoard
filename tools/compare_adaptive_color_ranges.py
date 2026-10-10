"""Render side-by-side OKLCH gamut options for an adaptive accent.

Requires Pillow: python -m pip install pillow
Run: python tools/compare_adaptive_color_ranges.py
"""

from __future__ import annotations

import argparse
import math
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


PREVIEW_LIGHTNESS = 0.74
MAX_DISPLAY_CHROMA = 0.24
OPTIONS = [
    ("無制限", None, 0.00, 1.00, "色相・明るさ・鮮やかさを制限しない"),
    ("ゆるめ", 0.18, 0.60, 0.86, "色味をしっかり残す"),
    ("標準", 0.14, 0.64, 0.84, "落ち着きと色味のバランス"),
    ("控えめ", 0.10, 0.70, 0.86, "パステル寄り"),
]


def oklch_to_linear_srgb(lightness: float, chroma: float, hue_degrees: float) -> tuple[float, float, float]:
    angle = math.radians(hue_degrees)
    a = chroma * math.cos(angle)
    b = chroma * math.sin(angle)

    l_root = lightness + 0.3963377774 * a + 0.2158037573 * b
    m_root = lightness - 0.1055613458 * a - 0.0638541728 * b
    s_root = lightness - 0.0894841775 * a - 1.2914855480 * b
    l, m, s = l_root**3, m_root**3, s_root**3
    return (
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
    )


def in_srgb_gamut(rgb: tuple[float, float, float]) -> bool:
    return all(0.0 <= channel <= 1.0 for channel in rgb)


@lru_cache(maxsize=4096)
def max_in_gamut_chroma(hue: int, lightness_step: int) -> float:
    lightness = lightness_step / 100
    low, high = 0.0, MAX_DISPLAY_CHROMA
    for _ in range(18):
        middle = (low + high) / 2
        if in_srgb_gamut(oklch_to_linear_srgb(lightness, middle, hue)):
            low = middle
        else:
            high = middle
    return low


def linear_to_srgb(channel: float) -> float:
    if channel <= 0.0031308:
        return 12.92 * channel
    return 1.055 * channel ** (1 / 2.4) - 0.055


def oklch_to_rgb(lightness: float, chroma: float, hue: int) -> tuple[int, int, int]:
    linear_rgb = oklch_to_linear_srgb(lightness, chroma, hue)
    return tuple(round(max(0.0, min(1.0, linear_to_srgb(channel))) * 255) for channel in linear_rgb)


def load_font(size: int) -> ImageFont.ImageFont:
    for name in (r"C:\Windows\Fonts\meiryo.ttc", r"C:\Windows\Fonts\YuGothR.ttc", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    return ImageFont.load_default()


def draw_wheel(image: Image.Image, center: tuple[int, int], radius: int, chroma_limit: float | None) -> None:
    cx, cy = center
    lightness_step = round(PREVIEW_LIGHTNESS * 100)
    for y in range(cy - radius, cy + radius + 1):
        for x in range(cx - radius, cx + radius + 1):
            dx, dy = x - cx, cy - y
            distance = math.hypot(dx, dy)
            if distance > radius:
                continue
            hue = int(round(math.degrees(math.atan2(dy, dx)))) % 360
            chroma = MAX_DISPLAY_CHROMA * distance / radius
            if chroma_limit is not None and chroma > chroma_limit:
                continue
            if chroma > max_in_gamut_chroma(hue, lightness_step):
                continue
            image.putpixel((x, y), oklch_to_rgb(PREVIEW_LIGHTNESS, chroma, hue))

    draw = ImageDraw.Draw(image)
    edge = "#354052"
    if chroma_limit is None:
        # The full sRGB gamut has a hue-dependent edge, so use the gamut contour per hue.
        points = []
        for hue in range(360):
            angle = math.radians(hue)
            edge_radius = radius * min(1.0, max_in_gamut_chroma(hue, lightness_step) / MAX_DISPLAY_CHROMA)
            points.append((cx + math.cos(angle) * edge_radius, cy - math.sin(angle) * edge_radius))
        draw.line(points + [points[0]], fill=edge, width=2)
    else:
        limit_radius = radius * chroma_limit / MAX_DISPLAY_CHROMA
        draw.ellipse((cx - limit_radius, cy - limit_radius, cx + limit_radius, cy + limit_radius), outline=edge, width=2)
    draw.ellipse((cx - 2, cy - 2, cx + 2, cy + 2), fill="#ffffff", outline=edge)


def build_chart(output: Path) -> None:
    width, height = 1240, 1060
    image = Image.new("RGB", (width, height), "#f7f8fa")
    draw = ImageDraw.Draw(image)
    title_font, heading_font = load_font(31), load_font(25)
    body_font, note_font = load_font(19), load_font(16)
    draw.text((48, 28), "自動調整カラーの制限案を比較", fill="#202733", font=title_font)
    draw.text((50, 73), "各円は OKLCH の色相 H × 鮮やかさ C。色相は全案で使い、円の内側だけを候補にします。", fill="#566171", font=body_font)
    draw.text((50, 105), f"円の色は明るさ L = {PREVIEW_LIGHTNESS:.2f} の断面。角度 = H、中心からの距離 = C（外周 C = {MAX_DISPLAY_CHROMA:.2f}）。", fill="#566171", font=note_font)

    centers = [(320, 360), (920, 360), (320, 800), (920, 800)]
    radius = 158
    for (name, c_limit, l_min, l_max, note), (cx, cy) in zip(OPTIONS, centers):
        draw_wheel(image, (cx, cy), radius, c_limit)
        draw = ImageDraw.Draw(image)
        top = cy - radius
        draw.text((cx - 190, top - 68), name, fill="#202733", font=heading_font)
        if c_limit is None:
            draw.text((cx - 190, top - 33), "C 上限: なし", fill="#303946", font=body_font)
            draw.text((cx - 190, cy + radius + 12), "L: 0.00〜1.00", fill="#303946", font=body_font)
        else:
            draw.text((cx - 190, top - 33), f"C ≤ {c_limit:.2f}   /   L: {l_min:.2f}〜{l_max:.2f}", fill="#303946", font=body_font)
            draw.text((cx - 190, cy + radius + 12), note, fill="#566171", font=note_font)

    draw.text((48, 1012), "迷ったら「標準」から。まだ派手なら控えめ、色味が弱ければゆるめへ。", fill="#303946", font=body_font)
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path(__file__).with_name("adaptive-color-range-comparison.png"))
    args = parser.parse_args()
    build_chart(args.output)
    print(f"Saved comparison chart to {args.output.resolve()}")


if __name__ == "__main__":
    main()
