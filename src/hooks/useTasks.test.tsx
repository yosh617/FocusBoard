import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProductivityBackup } from "../utils/productivityBackup";
import type { TaskRecord } from "../types/task";
import { createProductivityBackup } from "../utils/productivityBackup";
import {
  deleteProductivityRecords,
  loadProductivityData,
  replaceProductivityData,
  saveFocusSessionRecord,
  saveProductivityRecords,
  saveProjectRecord,
  saveTaskRecord
} from "../utils/productivityStorage";
import { useTasks } from "./useTasks";

vi.mock("../utils/productivityStorage", () => ({
  loadProductivityData: vi.fn(),
  deleteProductivityRecords: vi.fn(),
  replaceProductivityData: vi.fn(),
  saveFocusSessionRecord: vi.fn(),
  saveProductivityRecords: vi.fn(),
  saveProjectRecord: vi.fn(),
  saveTaskRecord: vi.fn()
}));

const savedTask: TaskRecord = {
  version: 1,
  id: "task-1",
  title: "数学の復習",
  status: "open",
  bucket: "inbox",
  projectId: null,
  parentTaskId: null,
  note: "",
  dueDate: null,
  reminderAt: null,
  repeatRule: null,
  repeatSeriesId: null,
  estimatedPomodoros: 0,
  order: 0,
  createdAt: 1,
  updatedAt: 1,
  completedAt: null
};

describe("useTasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadProductivityData).mockResolvedValue({ tasks: [], projects: [], sessions: [], invalidRecordCount: 0, repairedRecordCount: 0 });
    vi.mocked(saveTaskRecord).mockResolvedValue(undefined);
    vi.mocked(saveFocusSessionRecord).mockResolvedValue(undefined);
    vi.mocked(saveProjectRecord).mockResolvedValue(undefined);
    vi.mocked(saveProductivityRecords).mockResolvedValue(undefined);
    vi.mocked(deleteProductivityRecords).mockResolvedValue(undefined);
    vi.mocked(replaceProductivityData).mockResolvedValue(undefined);
  });

  it("loads local data and adds a validated task", async () => {
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.loading).toBe(false));
    let addedTaskId: string | null = null;
    await act(async () => { addedTaskId = await result.current.addTask({ title: "  英単語  ", estimatedPomodoros: 120 }); });
    expect(result.current.tasks).toHaveLength(1);
    expect(result.current.tasks[0]).toMatchObject({ title: "英単語", estimatedPomodoros: 99, status: "open" });
    expect(addedTaskId).toBe(result.current.tasks[0].id);
    expect(saveTaskRecord).toHaveBeenCalledWith(result.current.tasks[0]);
  });

  it("completes and restores a task without losing its previous state", async () => {
    vi.mocked(loadProductivityData).mockResolvedValue({ tasks: [savedTask], projects: [], sessions: [], invalidRecordCount: 0, repairedRecordCount: 0 });
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.tasks).toHaveLength(1));
    await act(async () => { await result.current.toggleTask(savedTask.id); });
    expect(result.current.tasks[0].status).toBe("completed");
    expect(result.current.canUndo).toBe(true);
    await act(async () => { await result.current.undo(); });
    expect(result.current.tasks[0]).toEqual(savedTask);
    expect(result.current.canUndo).toBe(false);
  });

  it("deletes a task and its subtasks while keeping undo available", async () => {
    const child = { ...savedTask, id: "subtask-1", title: "例題", parentTaskId: savedTask.id, order: 1 };
    vi.mocked(loadProductivityData).mockResolvedValue({ tasks: [savedTask, child], projects: [], sessions: [], invalidRecordCount: 0, repairedRecordCount: 0 });
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.tasks).toHaveLength(2));

    await act(async () => { expect(await result.current.deleteTask(savedTask.id)).toBe(true); });
    expect(deleteProductivityRecords).toHaveBeenCalledWith({ taskIds: [savedTask.id, child.id] });
    expect(result.current.tasks).toEqual([]);
    await act(async () => { expect(await result.current.undo()).toBe(true); });
    expect(result.current.tasks).toEqual([savedTask, child]);
  });

  it("keeps the timer-capable app available when IndexedDB cannot load", async () => {
    vi.mocked(loadProductivityData).mockRejectedValue(new Error("unavailable"));
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.storageAvailable).toBe(false);
    await act(async () => { expect(await result.current.addTask({ title: "保存不可" })).toBeNull(); });
    expect(saveTaskRecord).not.toHaveBeenCalled();
  });

  it("reports invalid stored productivity records without failing startup", async () => {
    vi.mocked(loadProductivityData).mockResolvedValue({ tasks: [savedTask], projects: [], sessions: [], invalidRecordCount: 2, repairedRecordCount: 0 });
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.tasks).toHaveLength(1);
    expect(result.current.taskMessage).toBe("読み込めないタスクデータ2件を除外しました。");
  });

  it("reports repaired productivity relations without failing startup", async () => {
    vi.mocked(loadProductivityData).mockResolvedValue({ tasks: [savedTask], projects: [], sessions: [], invalidRecordCount: 0, repairedRecordCount: 2 });
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.taskMessage).toBe("参照切れや親子関係が崩れたタスク2件を修復しました。");
  });

  it("stores an idempotent timer session with task snapshots", async () => {
    vi.mocked(loadProductivityData).mockResolvedValue({
      tasks: [{ ...savedTask, projectId: "project-1" }],
      projects: [{ version: 1, id: "project-1", name: "勉強", color: "#3f6fab", order: 0, archivedAt: null, createdAt: 1, updatedAt: 1 }],
      sessions: [],
      invalidRecordCount: 0,
      repairedRecordCount: 0
    });
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.tasks).toHaveLength(1));
    act(() => result.current.recordTimerSession({
      id: "session-1",
      taskId: savedTask.id,
      program: "pomodoro",
      mode: "work",
      result: "completed",
      startedAt: 10,
      endedAt: 20,
      plannedDurationMs: 10,
      focusedDurationMs: 10,
      pauseIntervals: []
    }));
    await waitFor(() => expect(result.current.sessions).toHaveLength(1));
    expect(saveFocusSessionRecord).toHaveBeenCalledWith(expect.objectContaining({ taskTitleSnapshot: savedTask.title, projectNameSnapshot: "勉強" }));
    act(() => result.current.recordTimerSession({
      id: "session-1",
      taskId: savedTask.id,
      program: "pomodoro",
      mode: "work",
      result: "completed",
      startedAt: 10,
      endedAt: 20,
      plannedDurationMs: 10,
      focusedDurationMs: 10,
      pauseIntervals: []
    }));
    await waitFor(() => expect(saveFocusSessionRecord).toHaveBeenCalledTimes(2));
    expect(result.current.sessions).toHaveLength(1);
  });

  it("creates one next occurrence when a repeating task is completed", async () => {
    vi.mocked(loadProductivityData).mockResolvedValue({
      tasks: [{ ...savedTask, dueDate: "2026-07-18", repeatRule: { type: "daily", interval: 1 } }],
      projects: [],
      sessions: [],
      invalidRecordCount: 0,
      repairedRecordCount: 0
    });
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.tasks).toHaveLength(1));
    await act(async () => { await result.current.toggleTask(savedTask.id); });
    expect(result.current.tasks).toHaveLength(2);
    expect(result.current.tasks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: savedTask.id, status: "completed" }),
      expect.objectContaining({ status: "open", dueDate: "2026-07-19", repeatSeriesId: savedTask.id })
    ]));
  });

  it("does not complete a subtask when its parent is completed", async () => {
    const child = { ...savedTask, id: "subtask-1", title: "例題", parentTaskId: savedTask.id, order: 1 };
    vi.mocked(loadProductivityData).mockResolvedValue({ tasks: [savedTask, child], projects: [], sessions: [], invalidRecordCount: 0, repairedRecordCount: 0 });
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.tasks).toHaveLength(2));
    await act(async () => { await result.current.toggleTask(savedTask.id); });
    expect(result.current.tasks.find((task) => task.id === child.id)?.status).toBe("open");
  });

  it("restores a validated backup and overwrites records with the same id", async () => {
    vi.mocked(loadProductivityData).mockResolvedValue({ tasks: [savedTask], projects: [], sessions: [], invalidRecordCount: 0, repairedRecordCount: 0 });
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.tasks).toHaveLength(1));
    const backup = createProductivityBackup([{ ...savedTask, title: "復元した数学", updatedAt: 2 }], [], []);
    await act(async () => { expect(await result.current.importProductivityBackup(backup, "smart-merge")).toBe(true); });
    expect(saveProductivityRecords).toHaveBeenCalledWith({ tasks: backup.tasks, projects: [], sessions: [] });
    expect(result.current.tasks).toEqual([expect.objectContaining({ id: savedTask.id, title: "復元した数学" })]);
    expect(result.current.canUndo).toBe(true);
    await act(async () => { expect(await result.current.undo()).toBe(true); });
    expect(replaceProductivityData).toHaveBeenCalledWith({ tasks: [savedTask], projects: [], sessions: [] });
    expect(result.current.tasks).toEqual([savedTask]);
    expect(result.current.taskMessage).toBe("直前の操作を元に戻しました。");
  });

  it("does not overwrite newer local data during smart merge", async () => {
    vi.mocked(loadProductivityData).mockResolvedValue({ tasks: [{ ...savedTask, updatedAt: 10 }], projects: [], sessions: [], invalidRecordCount: 0, repairedRecordCount: 0 });
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.tasks).toHaveLength(1));
    const backup = createProductivityBackup([{ ...savedTask, title: "古い数学", updatedAt: 2 }], [], []);
    await act(async () => { expect(await result.current.importProductivityBackup(backup, "smart-merge")).toBe(true); });
    expect(result.current.tasks[0].title).toBe(savedTask.title);
    expect(saveProductivityRecords).toHaveBeenCalledWith({ tasks: [], projects: [], sessions: [] });
  });

  it("clears records missing from a complete replacement", async () => {
    vi.mocked(loadProductivityData).mockResolvedValue({ tasks: [savedTask], projects: [], sessions: [], invalidRecordCount: 0, repairedRecordCount: 0 });
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.tasks).toHaveLength(1));
    const backup = createProductivityBackup([], [], []);
    await act(async () => { expect(await result.current.importProductivityBackup(backup, "replace")).toBe(true); });
    expect(replaceProductivityData).toHaveBeenCalledWith({ tasks: [], projects: [], sessions: [] });
    expect(result.current.tasks).toEqual([]);
  });

  it("rejects backup data that would break parent or project relations after merge", async () => {
    vi.mocked(loadProductivityData).mockResolvedValue({ tasks: [savedTask], projects: [], sessions: [], invalidRecordCount: 0, repairedRecordCount: 0 });
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.tasks).toHaveLength(1));
    const invalidBackup: ProductivityBackup = {
      format: "focusboard-productivity-backup",
      version: 1,
      exportedAt: "2026-07-29T00:00:00.000Z",
      tasks: [{ ...savedTask, id: "task-2", title: "壊れた参照", projectId: "missing-project" }],
      projects: [],
      sessions: []
    };
    await act(async () => { expect(await result.current.importProductivityBackup(invalidBackup, "replace")).toBe(false); });
    expect(saveProductivityRecords).not.toHaveBeenCalled();
    expect(replaceProductivityData).not.toHaveBeenCalled();
    expect(result.current.taskMessage).toBe("マージ後の親子関係またはプロジェクト参照が不正なため、データを変更しませんでした。");
  });
});
