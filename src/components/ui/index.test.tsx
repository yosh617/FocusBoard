import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppCalendar } from "./AppCalendar";
import { AppDateField } from "./AppDateField";
import { AppDateTimeField } from "./AppDateTimeField";
import { AppSelect } from "./AppSelect";

describe("AppSelect", () => {
  const options = [{ value: "one", label: "一つ" }, { value: "two", label: "二つ" }];

  it("opens as a listbox, selects with the keyboard, and restores focus", () => {
    const onChange = vi.fn();
    render(<AppSelect id="example" label="例" value="one" options={options} onChange={onChange} />);
    const trigger = screen.getByRole("button", { name: "例" });

    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(screen.getByRole("listbox", { name: "例" })).toBeTruthy();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(trigger, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith("two");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes when a pointer lands outside the control", () => {
    render(<AppSelect id="example" label="例" value="one" options={options} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "例" }));
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("keeps options out of the Tab order and closes when focus leaves", () => {
    render(<><AppSelect id="example" label="例" value="one" options={options} onChange={vi.fn()} /><button type="button">次へ</button></>);
    const trigger = screen.getByRole("button", { name: "例" });
    fireEvent.click(trigger);
    const optionsInList = screen.getAllByRole("option");
    expect(optionsInList.every((option) => option.tabIndex === -1)).toBe(true);
    expect(trigger.getAttribute("aria-activedescendant")).toBe(optionsInList[0].id);
    act(() => screen.getByRole("button", { name: "次へ" }).focus());
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});

describe("AppCalendar", () => {
  it("offers shortcuts and selects a date from the month grid", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<AppCalendar title="期限" value="2026-08-12" today="2026-08-12" onSelect={onSelect} onClose={onClose} />);

    expect(screen.getByRole("dialog", { name: "期限" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "2026年8月13日" }));
    expect(onSelect).toHaveBeenCalledWith("2026-08-13");
    expect(onClose).toHaveBeenCalled();
  });

  it("moves between months", () => {
    render(<AppCalendar title="期限" value="2026-08-12" today="2026-08-12" onSelect={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "次の月" }));
    expect(screen.getByText("2026年9月")).toBeTruthy();
  });

  it("moves grid focus with arrow keys, including across month boundaries", () => {
    render(<AppCalendar title="期限" value="2026-08-31" today="2026-08-12" onSelect={vi.fn()} onClose={vi.fn()} />);
    const selectedDay = screen.getByRole("button", { name: "2026年8月31日" });
    selectedDay.focus();
    fireEvent.keyDown(selectedDay, { key: "ArrowRight" });
    expect(screen.getByText("2026年9月")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "2026年9月1日" }));
  });

  it("focuses the close action, traps Tab, and restores the opener", () => {
    const opener = document.createElement("button");
    opener.type = "button";
    opener.textContent = "期限を開く";
    document.body.append(opener);
    opener.focus();
    const onClose = vi.fn();
    const { unmount } = render(<AppCalendar title="期限" value="2026-08-12" today="2026-08-12" onSelect={vi.fn()} onClose={onClose} />);
    const closeButton = screen.getByRole("button", { name: "期限を閉じる" });
    expect(document.activeElement).toBe(closeButton);

    fireEvent.keyDown(closeButton, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "2026年8月31日" }));
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Tab" });
    expect(document.activeElement).toBe(closeButton);
    fireEvent.keyDown(closeButton, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});

describe("AppDateField", () => {
  it("opens the shared calendar and closes after a selection", () => {
    const onChange = vi.fn();
    render(<AppDateField id="due" label="期限" value="2026-08-12" today="2026-08-12" onChange={onChange} />);
    const trigger = screen.getByRole("button", { name: "期限" });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "明日" }));
    expect(onChange).toHaveBeenCalledWith("2026-08-13");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});

describe("AppDateTimeField", () => {
  it("uses a calendar trigger and app-styled time inputs instead of datetime-local", () => {
    const onChange = vi.fn();
    render(<AppDateTimeField id="reminder" label="通知" value="2026-08-12T09:30" today="2026-08-12" onChange={onChange} />);
    expect(document.querySelector("input[type=datetime-local]")).toBeNull();
    const hourInput = screen.getByLabelText("通知の時");
    fireEvent.change(hourInput, { target: { value: "1" } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(hourInput, { target: { value: "12" } });
    expect(onChange).toHaveBeenCalledWith("2026-08-12T12:30");
    fireEvent.blur(hourInput);
    expect(onChange).toHaveBeenLastCalledWith("2026-08-12T12:30");
    fireEvent.click(screen.getByRole("button", { name: "通知" }));
    fireEvent.click(screen.getByRole("button", { name: "なし" }));
    expect(onChange).toHaveBeenLastCalledWith("");
  });

  it("does not present an impossible date as a valid selection", () => {
    render(<AppDateTimeField id="reminder" label="通知" value="2026-02-31T09:30" today="2026-02-12" onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "通知" }).textContent).toContain("日付を選択");
  });
});
