"""Render the proposed OKLCH color range for FocusBoard's adaptive accent.

Requires Pillow: python -m pip install pillow
Run: python tools/plot_adaptive_color_range.py
"""

from __future__ import annotations

import argparse
import math
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


LIGHTNESS_MIN = 0.72
LIGHTNESS_MAX = 0.86
LIGHTNESS_PREVIEW = 0.79
CHROMA_MAX = 0.10


def oklch_to_linear_srgb(lightness: float, chroma: float, hue_degrees: float) -> tuple[float, float, float]:
    """Convert OKLCH to linear sRGB without clipping."""
    angle = math.radians(hue_degrees)
    a = chroma * math.cos(angle)
    b = chroma * math.sin(angle)

    l_root = lightness + 0.3963377774 * a + 0.2158037573 * b
    m_root = lightness - 0.1055613458 * a - 0.0638541728 * b
    s_root = lightness - 0.0894841775 * a - 1.2914855480 * b
    l = l_root**3
    m = m_root**3
    s = s_root**3

    return (
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
    )


def in_srgb_gamut(rgb: tuple[float, float, float]) -> bool:
    return all(0.0 <= channel <= 1.0 for channel in rgb)


@lru_cache(maxsize=360)
def max_in_gamut_chroma(hue: int) -> float:
    """Find the maximum chroma that remains in sRGB for this hue/lightness."""
    low, high = 0.0, CHROMA_MAX
    for _ in range(18):
        middle = (low + high) / 2
        if in_srgb_gamut(oklch_to_linear_srgb(LIGHTNESS_PREVIEW, middle, hue)):
            low = middle
        else:
            high = middle
    return low


def linear_to_srgb(channel: float) -> float:
    if channel <= 0.0031308:
        return 12.92 * channel
    return 1.055 * channel ** (1 / 2.4) - 0.055


def oklch_to_rgb(lightness: float, chroma: float, hue: int) -> tuple[int, int, int]:
    rgb = oklch_to_linear_srgb(lightness, chroma, hue)
    return tuple(round(max(0.0, min(1.0, linear_to_srgb(channel))) * 255) for channel in rgb)


def load_font(size: int) -> ImageFont.ImageFont:
    for font_name in (
        r"C:\Windows\Fonts\meiryo.ttc",
        r"C:\Windows\Fonts\YuGothR.ttc",
        "segoeui.ttf",
        "arial.ttf",
        "DejaVuSans.ttf",
    ):
        try:
            return ImageFont.truetype(font_name, size)
        except OSError:
            pass
    return ImageFont.load_default()


def build_chart(output: Path) -> None:
    width, height = 980, 670
    image = Image.new("RGB", (width, height), "#f7f8fa")
    draw = ImageDraw.Draw(image)
    title_font = load_font(30)
    body_font = load_font(19)
    small_font = load_font(16)

    draw.text((48, 30), "自動調整で許可する色の範囲（OKLCH）", fill="#202733", font=title_font)
    draw.text((50, 76), "円の内側だけを候補にする。外側は色の鮮やかさ C が上限を超える領域。", fill="#566171", font=body_font)

    center_x, center_y, radius = 340, 365, 235
    for y in range(center_y - radius, center_y + radius + 1):
        for x in range(center_x - radius, center_x + radius + 1):
            dx = x - center_x
            dy = center_y - y
            distance = math.hypot(dx, dy)
            if distance > radius:
                continue
            hue = int(round(math.degrees(math.atan2(dy, dx)))) % 360
            chroma = min(CHROMA_MAX * distance / radius, max_in_gamut_chroma(hue))
            image.putpixel((x, y), oklch_to_rgb(LIGHTNESS_PREVIEW, chroma, hue))

    draw = ImageDraw.Draw(image)
    draw.ellipse((center_x - radius, center_y - radius, center_x + radius, center_y + radius), outline="#384452", width=2)
    draw.ellipse((center_x - radius / 2, center_y - radius / 2, center_x + radius / 2, center_y + radius / 2), outline="#ffffff", width=2)
    draw.ellipse((center_x - 3, center_y - 3, center_x + 3, center_y + 3), fill="#ffffff", outline="#384452")
    draw.text((center_x + 10, center_y + 7), "C = 0", fill="#303946", font=small_font)
    draw.text((center_x + radius - 38, center_y + 10), "C = 0.10", fill="#303946", font=small_font)
    draw.text((center_x - 15, center_y - radius - 42), "青", fill="#303946", font=small_font)
    draw.text((center_x + radius + 4, center_y - 12), "赤", fill="#303946", font=small_font)
    draw.text((center_x - 15, center_y + radius + 8), "紫", fill="#303946", font=small_font)
    draw.text((center_x - radius - 30, center_y - 12), "緑", fill="#303946", font=small_font)

    panel_x = 660
    draw.text((panel_x, 160), "固定する条件", fill="#202733", font=load_font(23))
    draw.text((panel_x, 205), f"明るさ L: {LIGHTNESS_MIN:.2f}〜{LIGHTNESS_MAX:.2f}", fill="#303946", font=body_font)
    draw.text((panel_x, 239), f"鮮やかさ C: 0〜{CHROMA_MAX:.2f}", fill="#303946", font=body_font)
    draw.text((panel_x, 273), f"この円の色: L = {LIGHTNESS_PREVIEW:.2f}", fill="#303946", font=body_font)

    draw.text((panel_x, 340), "明るさの許可帯", fill="#202733", font=load_font(23))
    bar_left, bar_top, bar_width, bar_height = panel_x, 390, 250, 32
    for x in range(bar_width):
        lightness = LIGHTNESS_MIN + (LIGHTNESS_MAX - LIGHTNESS_MIN) * x / max(1, bar_width - 1)
        color = oklch_to_rgb(lightness, 0.06, 220)
        draw.line((bar_left + x, bar_top, bar_left + x, bar_top + bar_height), fill=color)
    draw.rectangle((bar_left, bar_top, bar_left + bar_width, bar_top + bar_height), outline="#384452", width=1)
    draw.text((bar_left, bar_top + 42), f"L = {LIGHTNESS_MIN:.2f}", fill="#566171", font=small_font)
    draw.text((bar_left + bar_width - 68, bar_top + 42), f"L = {LIGHTNESS_MAX:.2f}", fill="#566171", font=small_font)

    draw.text((panel_x, 500), "背景の色相はそのまま使い、", fill="#303946", font=body_font)
    draw.text((panel_x, 530), "C と L だけを上限・範囲内に収める。", fill="#303946", font=body_font)
    draw.text((panel_x, 580), "真っ赤・真っ青を禁止せず、", fill="#566171", font=small_font)
    draw.text((panel_x, 606), "くすんだ赤・青として残せる。", fill="#566171", font=small_font)

    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path(__file__).with_name("adaptive-color-range.png"))
    args = parser.parse_args()
    build_chart(args.output)
    print(f"Saved color range chart to {args.output.resolve()}")


if __name__ == "__main__":
    main()
