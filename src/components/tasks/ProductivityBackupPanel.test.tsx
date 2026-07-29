import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TaskRecord } from "../../types/task";
import { createProductivityBackup, stringifyProductivityBackup } from "../../utils/productivityBackup";
import { ProductivityBackupPanel } from "./ProductivityBackupPanel";

const currentTask: TaskRecord = { version: 1, id: "task-1", title: "端末の数学", status: "open", bucket: "inbox", projectId: null, parentTaskId: null, note: "", dueDate: null, reminderAt: null, repeatRule: null, repeatSeriesId: null, estimatedPomodoros: 1, order: 0, createdAt: 1, updatedAt: 10, completedAt: null };
const addedTask: TaskRecord = { ...currentTask, id: "task-2", title: "英語", updatedAt: 5 };

describe("ProductivityBackupPanel", () => {
  it("previews safe merge counts and sends the selected strategy", async () => {
    const onImport = vi.fn().mockResolvedValue(true);
    render(<ProductivityBackupPanel tasks={[currentTask]} projects={[]} sessions={[]} storageAvailable onImport={onImport} />);
    const backup = createProductivityBackup([{ ...currentTask, title: "古い数学", updatedAt: 5 }, addedTask], [], []);
    const file = new File([stringifyProductivityBackup(backup)], "backup.json", { type: "application/json" });
    Object.defineProperty(file, "text", { value: () => Promise.resolve(stringifyProductivityBackup(backup)) });
    fireEvent.change(screen.getByLabelText("JSONを選択"), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByRole("region", { name: "復元前の確認" })).toBeTruthy());
    expect(screen.getByLabelText("変更予定件数").textContent).toContain("1追加");
    expect(screen.getByLabelText("変更予定件数").textContent).toContain("1端末を維持");
    fireEvent.click(screen.getByRole("radio", { name: /追加のみ/ }));
    fireEvent.click(screen.getByRole("button", { name: "新しいデータを追加" }));
    await waitFor(() => expect(onImport).toHaveBeenCalledWith(expect.objectContaining({ version: 1 }), "add-only", "current"));
  });

  it("requires explicit confirmation before complete replacement", async () => {
    render(<ProductivityBackupPanel tasks={[currentTask]} projects={[]} sessions={[]} storageAvailable onImport={vi.fn().mockResolvedValue(true)} />);
    const backup = createProductivityBackup([], [], []);
    const file = new File([stringifyProductivityBackup(backup)], "empty.json", { type: "application/json" });
    Object.defineProperty(file, "text", { value: () => Promise.resolve(stringifyProductivityBackup(backup)) });
    fireEvent.change(screen.getByLabelText("JSONを選択"), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByRole("radio", { name: /完全置換/ })).toBeTruthy());
    fireEvent.click(screen.getByRole("radio", { name: /完全置換/ }));
    const replace = screen.getByRole("button", { name: "完全置換を実行" }) as HTMLButtonElement;
    expect(replace.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: /削除されることを確認/ }));
    expect(replace.disabled).toBe(false);
  });

  it("shows same-time conflicts and lets the user choose the file", async () => {
    const onImport = vi.fn().mockResolvedValue(true);
    render(<ProductivityBackupPanel tasks={[currentTask]} projects={[]} sessions={[]} storageAvailable onImport={onImport} />);
    const backup = createProductivityBackup([{ ...currentTask, title: "ファイルの数学" }], [], []);
    const file = new File([stringifyProductivityBackup(backup)], "conflict.json", { type: "application/json" });
    Object.defineProperty(file, "text", { value: () => Promise.resolve(stringifyProductivityBackup(backup)) });
    fireEvent.change(screen.getByLabelText("JSONを選択"), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByText("競合時の扱い")).toBeTruthy());
    expect(screen.getByText("端末: 端末の数学")).toBeTruthy();
    expect(screen.getByText("ファイル: ファイルの数学")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "ファイルを採用" }));
    fireEvent.click(screen.getByRole("button", { name: "スマートマージを実行" }));
    await waitFor(() => expect(onImport).toHaveBeenCalledWith(expect.anything(), "smart-merge", "incoming"));
  });

  it("blocks a merge that would create a cyclic parent relationship", async () => {
    const currentParent = { ...currentTask, parentTaskId: "task-2" };
    const currentChild = { ...addedTask, parentTaskId: null, updatedAt: 1 };
    const incomingParent = { ...currentTask, parentTaskId: null, updatedAt: 5 };
    const incomingChild = { ...addedTask, parentTaskId: currentTask.id, updatedAt: 5 };
    render(<ProductivityBackupPanel tasks={[currentParent, currentChild]} projects={[]} sessions={[]} storageAvailable onImport={vi.fn()} />);
    const backup = createProductivityBackup([incomingParent, incomingChild], [], []);
    const file = new File([stringifyProductivityBackup(backup)], "cycle.json", { type: "application/json" });
    Object.defineProperty(file, "text", { value: () => Promise.resolve(stringifyProductivityBackup(backup)) });

    fireEvent.change(screen.getByLabelText("JSONを選択"), { target: { files: [file] } });

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("実行できません"));
    expect((screen.getByRole("button", { name: "スマートマージを実行" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
