import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ColorPicker, ColorPickerDisclosure } from "./ColorPicker";

describe("ColorPicker", () => {
  it("renders the three selection modes, current color, theme colors, and optional opacity", () => {
    render(<ColorPicker value="#af42eb" onChange={vi.fn()} savedColors={["#000000", "#ffffff"]} opacity={0.66} onOpacityChange={vi.fn()} onAddSavedColor={vi.fn()} />);

    expect(screen.getByRole("tab", { name: "グリッド" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "スペクトラム" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "スライダー" })).toBeTruthy();
    expect(screen.getByText("#AF42EB")).toBeTruthy();
    expect(screen.getByRole("slider", { name: "不透明度" }).getAttribute("value")).toBe("0.66");
    expect(screen.getByRole("button", { name: "推奨テーマ #000000" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "現在の色を保存" })).toBeTruthy();
  });

  it("supports named recommended theme choices", () => {
    const onChange = vi.fn();
    render(<ColorPicker value="#17345f" onChange={onChange} savedColors={[{ label: "スカイ", color: "#17345f" }, { label: "ローズ", color: "#6b4050" }]} />);

    const sky = screen.getByRole("button", { name: "推奨テーマ スカイ #17345F" });
    expect(sky.getAttribute("title")).toBe("スカイ (#17345F)");
    expect(sky.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "推奨テーマ ローズ #6B4050" }));
    expect(onChange).toHaveBeenCalledWith("#6b4050");
  });

  it("selects a grid swatch and moves grid focus with arrow keys", () => {
    const onChange = vi.fn();
    render(<ColorPicker value="#000000" onChange={onChange} />);
    const cells = screen.getAllByRole("gridcell");
    cells[0].focus();
    fireEvent.keyDown(cells[0], { key: "ArrowRight" });
    expect(document.activeElement).toBe(cells[1]);
    expect(onChange).toHaveBeenCalledWith(expect.stringMatching(/^#/));
    fireEvent.click(screen.getByRole("gridcell", { name: "#FFFFFF" }));
    expect(onChange).toHaveBeenLastCalledWith("#ffffff");
  });

  it("does not mark an unrelated grid color for a custom current color", () => {
    render(<ColorPicker value="#17345f" onChange={vi.fn()} />);

    const selectedCells = screen.getAllByRole("gridcell").filter((cell) => cell.getAttribute("aria-selected") === "true");
    expect(selectedCells).toHaveLength(0);
  });

  it("changes color from the spectrum with pointer and keyboard input", () => {
    const onChange = vi.fn();
    render(<ColorPicker value="#ff0000" onChange={onChange} defaultMode="spectrum" />);
    const spectrum = screen.getByRole("slider", { name: "彩度と明度" });
    fireEvent.pointerDown(spectrum, { clientX: 0, clientY: 0 });
    expect(onChange).toHaveBeenCalledWith("#ffffff");
    fireEvent.keyDown(spectrum, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith(expect.stringMatching(/^#/));
  });

  it("updates RGB and hex sliders and emits opacity changes", () => {
    const onChange = vi.fn();
    const onOpacityChange = vi.fn();
    render(<ColorPicker value="#112233" onChange={onChange} defaultMode="sliders" opacity={1} onOpacityChange={onOpacityChange} />);
    fireEvent.change(screen.getByRole("slider", { name: /Red/ }), { target: { value: "255" } });
    expect(onChange).toHaveBeenCalledWith("#ff2233");
    fireEvent.change(screen.getByRole("textbox", { name: "Hex Color" }), { target: { value: "#00ff00" } });
    expect(onChange).toHaveBeenLastCalledWith("#00ff00");
    fireEvent.change(screen.getByRole("slider", { name: "不透明度" }), { target: { value: "0.25" } });
    expect(onOpacityChange).toHaveBeenCalledWith(0.25);
  });

  it("keeps dense forms compact until the color field is opened", () => {
    render(<ColorPickerDisclosure value="#17345f" label="プロジェクトの色" onChange={vi.fn()} />);

    expect(screen.getAllByText("#17345F").length).toBeGreaterThan(0);
    const details = screen.getByText("変更").closest("details") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    fireEvent.click(screen.getByText("変更"));
    expect(details.open).toBe(true);
    expect(screen.getByRole("tab", { name: "グリッド" })).toBeTruthy();
  });
});
