import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProductivityBackup } from "../utils/productivityBackup";
import type { FocusSessionRecord } from "../types/focusSession";
import type { ProjectRecord } from "../types/project";
import type { TaskRecord } from "../types/task";
import { createProductivityBackup } from "../utils/productivityBackup";
import { addLocalDays, toLocalDateKey } from "../utils/taskQueries";
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

  it("creates today's occurrence while the previous repeating task remains overdue", async () => {
    const today = toLocalDateKey(new Date());
    vi.mocked(loadProductivityData).mockResolvedValue({
      tasks: [{ ...savedTask, dueDate: addLocalDays(today, -1), repeatRule: { type: "daily", interval: 1 } }],
      projects: [],
      sessions: [],
      invalidRecordCount: 0,
      repairedRecordCount: 0
    });
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.tasks).toHaveLength(2));
    expect(result.current.tasks).toHaveLength(2);
    expect(result.current.tasks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: savedTask.id, status: "open", dueDate: addLocalDays(today, -1) }),
      expect.objectContaining({ status: "open", dueDate: today, repeatSeriesId: savedTask.id })
    ]));
  });

  it("creates a recurring subtask occurrence under its original parent without cloning it under the parent's occurrence", async () => {
    const today = toLocalDateKey(new Date());
    const parent = { ...savedTask, dueDate: addLocalDays(today, -1), repeatRule: { type: "daily", interval: 1 } as const };
    const child = { ...savedTask, id: "subtask-recurring", title: "反復する子", parentTaskId: parent.id, dueDate: addLocalDays(today, -1), repeatRule: { type: "daily", interval: 1 } as const, order: 1 };
    vi.mocked(loadProductivityData).mockResolvedValue({ tasks: [parent, child], projects: [], sessions: [], invalidRecordCount: 0, repairedRecordCount: 0 });
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.tasks).toHaveLength(4));

    const parentOccurrence = result.current.tasks.find((item) => item.repeatSeriesId === parent.id);
    const childOccurrence = result.current.tasks.find((item) => item.repeatSeriesId === child.id);
    expect(parentOccurrence).toMatchObject({ parentTaskId: null, dueDate: today });
    expect(childOccurrence).toMatchObject({ parentTaskId: parent.id, dueDate: today });
    expect(result.current.tasks.filter((item) => item.parentTaskId === parentOccurrence?.id)).toEqual([]);
  });

  it("clears an older undo after a successful task edit", async () => {
    vi.mocked(loadProductivityData).mockResolvedValue({ tasks: [savedTask], projects: [], sessions: [], invalidRecordCount: 0, repairedRecordCount: 0 });
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.tasks).toHaveLength(1));
    await act(async () => { await result.current.toggleTask(savedTask.id); });
    expect(result.current.canUndo).toBe(true);
    await act(async () => { await result.current.updateTask(savedTask.id, { title: "更新した数学" }); });
    expect(result.current.canUndo).toBe(false);
  });

  it("moves existing focus records with the task when its project changes", async () => {
    const firstProject: ProjectRecord = { version: 1, id: "project-1", name: "勉強", color: "#3f6fab", order: 0, archivedAt: null, createdAt: 1, updatedAt: 1 };
    const secondProject: ProjectRecord = { version: 1, id: "project-2", name: "仕事", color: "#347b70", order: 1, archivedAt: null, createdAt: 2, updatedAt: 2 };
    const task = { ...savedTask, projectId: firstProject.id };
    const session = (id: string, taskId: string | null = task.id): FocusSessionRecord => ({
      version: 2,
      id,
      taskId,
      taskTitleSnapshot: task.title,
      projectIdSnapshot: firstProject.id,
      projectNameSnapshot: firstProject.name,
      program: "pomodoro",
      mode: "work",
      result: "completed",
      startedAt: 10,
      endedAt: 20,
      plannedDurationMs: 10,
      focusedDurationMs: 8,
      pauseIntervals: []
    });
    const taskSession = session("session-1");
    const secondTaskSession = session("session-2");
    const unrelatedSession = session("session-unlinked", null);
    vi.mocked(loadProductivityData).mockResolvedValue({
      tasks: [task],
      projects: [firstProject, secondProject],
      sessions: [taskSession, secondTaskSession, unrelatedSession],
      invalidRecordCount: 0,
      repairedRecordCount: 0
    });
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.tasks).toHaveLength(1));

    await act(async () => { expect(await result.current.updateTask(task.id, { projectId: secondProject.id })).toBe(true); });

    expect(result.current.tasks[0].projectId).toBe(secondProject.id);
    expect(result.current.sessions[0]).toMatchObject({ taskId: task.id, focusedDurationMs: 8, projectIdSnapshot: secondProject.id, projectNameSnapshot: secondProject.name });
    expect(result.current.sessions[1]).toMatchObject({ taskId: task.id, focusedDurationMs: 8, projectIdSnapshot: secondProject.id, projectNameSnapshot: secondProject.name });
    expect(result.current.sessions[2]).toEqual(unrelatedSession);
    expect(saveProductivityRecords).toHaveBeenCalledWith({
      tasks: [expect.objectContaining({ id: task.id, projectId: secondProject.id })],
      sessions: [
        expect.objectContaining({ id: taskSession.id, projectIdSnapshot: secondProject.id, projectNameSnapshot: secondProject.name, focusedDurationMs: 8 }),
        expect.objectContaining({ id: secondTaskSession.id, projectIdSnapshot: secondProject.id, projectNameSnapshot: secondProject.name, focusedDurationMs: 8 })
      ]
    });

    await act(async () => { expect(await result.current.updateTask(task.id, { projectId: null })).toBe(true); });
    expect(result.current.sessions.slice(0, 2)).toEqual(expect.arrayContaining([
      expect.objectContaining({ projectIdSnapshot: null, projectNameSnapshot: null, focusedDurationMs: 8 }),
      expect.objectContaining({ projectIdSnapshot: null, projectNameSnapshot: null, focusedDurationMs: 8 })
    ]));
  });

  it("moves project focus history to unassigned when the project is archived", async () => {
    const project: ProjectRecord = { version: 1, id: "project-1", name: "勉強", color: "#3f6fab", order: 0, archivedAt: null, createdAt: 1, updatedAt: 1 };
    const task = { ...savedTask, projectId: project.id };
    const session: FocusSessionRecord = {
      version: 2, id: "session-1", taskId: task.id, taskTitleSnapshot: task.title,
      projectIdSnapshot: project.id, projectNameSnapshot: project.name, program: "pomodoro",
      mode: "work", result: "completed", startedAt: 10, endedAt: 20,
      plannedDurationMs: 10, focusedDurationMs: 8, pauseIntervals: []
    };
    vi.mocked(loadProductivityData).mockResolvedValue({ tasks: [task], projects: [project], sessions: [session], invalidRecordCount: 0, repairedRecordCount: 0 });
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.tasks).toHaveLength(1));

    await act(async () => { expect(await result.current.archiveProject(project.id)).toBe(true); });

    expect(result.current.tasks[0].projectId).toBeNull();
    expect(result.current.sessions[0]).toMatchObject({ taskId: task.id, focusedDurationMs: 8, projectIdSnapshot: null, projectNameSnapshot: null });
    expect(saveProductivityRecords).toHaveBeenCalledWith(expect.objectContaining({
      sessions: [expect.objectContaining({ id: session.id, projectIdSnapshot: null, projectNameSnapshot: null, focusedDurationMs: 8 })]
    }));
  });

  it("normalizes a task added to an archived project into Inbox", async () => {
    const archivedProject = { version: 1 as const, id: "project-1", name: "終了", color: "#3f6fab", order: 0, archivedAt: 2, createdAt: 1, updatedAt: 2 };
    vi.mocked(loadProductivityData).mockResolvedValue({ tasks: [], projects: [archivedProject], sessions: [], invalidRecordCount: 0, repairedRecordCount: 0 });
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.projects).toHaveLength(1));
    await act(async () => { await result.current.addTask({ title: "Inboxへ移す", projectId: archivedProject.id }); });
    expect(result.current.tasks[0]).toMatchObject({ projectId: null, bucket: "inbox" });
  });

  it("does not create another occurrence immediately when a repeating task is completed", async () => {
    const today = toLocalDateKey(new Date());
    vi.mocked(loadProductivityData).mockResolvedValue({
      tasks: [{ ...savedTask, dueDate: today, repeatRule: { type: "daily", interval: 1 } }],
      projects: [], sessions: [], invalidRecordCount: 0, repairedRecordCount: 0
    });
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.tasks).toHaveLength(1));
    await act(async () => { await result.current.toggleTask(savedTask.id); });
    expect(result.current.tasks).toHaveLength(1);
    expect(result.current.tasks[0].status).toBe("completed");
  });

  it("deletes only one repeating occurrence and remembers its skipped date", async () => {
    const today = toLocalDateKey(new Date());
    const root = { ...savedTask, dueDate: addLocalDays(today, -1), repeatRule: { type: "daily", interval: 1 } as const };
    const occurrence = { ...root, id: "task-2", dueDate: today, repeatSeriesId: root.id };
    vi.mocked(loadProductivityData).mockResolvedValue({ tasks: [root, occurrence], projects: [], sessions: [], invalidRecordCount: 0, repairedRecordCount: 0 });
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.tasks).toHaveLength(2));
    await act(async () => { expect(await result.current.deleteTask(occurrence.id)).toBe(true); });
    expect(result.current.tasks).toHaveLength(1);
    expect(result.current.tasks[0].repeatSkipDates).toEqual([today]);
  });

  it("keeps a repeating series alive when its canonical root is deleted", async () => {
    const today = toLocalDateKey(new Date());
    const root = { ...savedTask, dueDate: today, repeatRule: { type: "daily", interval: 1 } as const };
    vi.mocked(loadProductivityData).mockResolvedValue({ tasks: [root], projects: [], sessions: [], invalidRecordCount: 0, repairedRecordCount: 0 });
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.tasks).toHaveLength(1));
    await act(async () => { expect(await result.current.deleteTask(root.id)).toBe(true); });
    expect(result.current.tasks).toHaveLength(1);
    expect(result.current.tasks[0]).toMatchObject({ id: root.id, dueDate: addLocalDays(today, 1), repeatRule: root.repeatRule });
    expect(deleteProductivityRecords).toHaveBeenCalledWith({ taskIds: [] });
  });

  it("stops a repeating series while keeping its existing tasks", async () => {
    const today = toLocalDateKey(new Date());
    const root = { ...savedTask, dueDate: addLocalDays(today, -1), repeatRule: { type: "daily", interval: 1 } as const };
    const occurrence = { ...root, id: "task-2", dueDate: today, repeatSeriesId: root.id };
    vi.mocked(loadProductivityData).mockResolvedValue({ tasks: [root, occurrence], projects: [], sessions: [], invalidRecordCount: 0, repairedRecordCount: 0 });
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.tasks).toHaveLength(2));
    await act(async () => { expect(await result.current.deleteRecurringSeries(root.id)).toBe(true); });
    expect(result.current.tasks.every((task) => task.repeatRule === null && task.repeatSeriesId === null)).toBe(true);
  });

  it("completes open descendants with a parent, preserves completed descendants, and reopens only the parent", async () => {
    const child = { ...savedTask, id: "subtask-1", title: "例題", parentTaskId: savedTask.id, order: 1 };
    const completedChild = { ...savedTask, id: "subtask-done", title: "済み", parentTaskId: child.id, status: "completed" as const, completedAt: 5, order: 2 };
    const grandchild = { ...savedTask, id: "subtask-2", parentTaskId: child.id, order: 3 };
    const archivedChild = { ...savedTask, id: "subtask-archived", parentTaskId: savedTask.id, status: "archived" as const, completedAt: null, order: 4 };
    vi.mocked(loadProductivityData).mockResolvedValue({ tasks: [savedTask, child, completedChild, grandchild, archivedChild], projects: [], sessions: [], invalidRecordCount: 0, repairedRecordCount: 0 });
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.tasks).toHaveLength(5));
    await act(async () => { await result.current.toggleTask(savedTask.id); });
    expect(result.current.tasks.map((task) => task.status)).toEqual(["completed", "completed", "completed", "completed", "archived"]);
    expect(result.current.tasks.find((task) => task.id === completedChild.id)).toMatchObject({ completedAt: 5, updatedAt: 1 });
    expect(result.current.tasks.find((task) => task.id === archivedChild.id)).toEqual(archivedChild);
    expect(saveProductivityRecords).toHaveBeenLastCalledWith({ tasks: [
      expect.objectContaining({ id: savedTask.id, status: "completed" }),
      expect.objectContaining({ id: child.id, status: "completed" }),
      expect.objectContaining({ id: grandchild.id, status: "completed" })
    ] });
    await act(async () => { await result.current.toggleTask(savedTask.id); });
    expect(result.current.tasks.map((task) => task.status)).toEqual(["open", "completed", "completed", "completed", "archived"]);
    await act(async () => { await result.current.undo(); });
    expect(result.current.tasks.map((task) => task.status)).toEqual(["completed", "completed", "completed", "completed", "archived"]);
  });

  it("keeps parent and descendants unchanged when cascade persistence fails, preserving the prior undo", async () => {
    const child = { ...savedTask, id: "subtask-1", parentTaskId: savedTask.id, order: 1 };
    const priorTask = { ...savedTask, id: "task-prior", title: "先に完了", order: 2 };
    vi.mocked(loadProductivityData).mockResolvedValue({ tasks: [savedTask, child, priorTask], projects: [], sessions: [], invalidRecordCount: 0, repairedRecordCount: 0 });
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.tasks).toHaveLength(3));
    await act(async () => { expect(await result.current.toggleTask(priorTask.id)).toBe(true); });
    expect(result.current.canUndo).toBe(true);

    vi.mocked(saveProductivityRecords).mockRejectedValueOnce(new Error("write failed"));
    await act(async () => { expect(await result.current.toggleTask(savedTask.id)).toBe(false); });
    expect(result.current.tasks.find((task) => task.id === savedTask.id)?.status).toBe("open");
    expect(result.current.tasks.find((task) => task.id === child.id)?.status).toBe("open");
    expect(result.current.tasks.find((task) => task.id === priorTask.id)?.status).toBe("completed");
    expect(result.current.canUndo).toBe(true);

    await act(async () => { expect(await result.current.undo()).toBe(true); });
    expect(result.current.tasks.find((task) => task.id === priorTask.id)?.status).toBe("open");
    expect(result.current.tasks.find((task) => task.id === savedTask.id)?.status).toBe("open");
    expect(result.current.tasks.find((task) => task.id === child.id)?.status).toBe("open");
  });

  it("rejects overlapping completion toggles while descendant records are being saved", async () => {
    const child = { ...savedTask, id: "subtask-1", parentTaskId: savedTask.id, order: 1 };
    vi.mocked(loadProductivityData).mockResolvedValue({ tasks: [savedTask, child], projects: [], sessions: [], invalidRecordCount: 0, repairedRecordCount: 0 });
    let releaseSave!: () => void;
    vi.mocked(saveProductivityRecords).mockImplementationOnce(() => new Promise<void>((resolve) => { releaseSave = resolve; }));
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.tasks).toHaveLength(2));
    let firstToggle!: Promise<boolean>;
    await act(async () => {
      firstToggle = result.current.toggleTask(savedTask.id);
      await Promise.resolve();
      expect(await result.current.toggleTask(child.id)).toBe(false);
      releaseSave();
      expect(await firstToggle).toBe(true);
    });
    expect(result.current.tasks.every((task) => task.status === "completed")).toBe(true);
  });

  it("finishes an in-flight child edit before allowing ancestor completion", async () => {
    const child = { ...savedTask, id: "subtask-1", parentTaskId: savedTask.id, order: 1 };
    vi.mocked(loadProductivityData).mockResolvedValue({ tasks: [savedTask, child], projects: [], sessions: [], invalidRecordCount: 0, repairedRecordCount: 0 });
    let releaseEdit!: () => void;
    vi.mocked(saveTaskRecord).mockImplementationOnce(() => new Promise<void>((resolve) => { releaseEdit = resolve; }));
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.tasks).toHaveLength(2));

    let childEdit!: Promise<boolean>;
    await act(async () => {
      childEdit = result.current.updateTask(child.id, { note: "編集を保持" });
      await Promise.resolve();
      expect(await result.current.toggleTask(savedTask.id)).toBe(false);
      releaseEdit();
      expect(await childEdit).toBe(true);
    });
    expect(result.current.tasks.find((task) => task.id === child.id)).toMatchObject({ status: "open", note: "編集を保持" });

    await act(async () => { expect(await result.current.toggleTask(savedTask.id)).toBe(true); });
    expect(result.current.tasks.find((task) => task.id === savedTask.id)?.status).toBe("completed");
    expect(result.current.tasks.find((task) => task.id === child.id)).toMatchObject({ status: "completed", note: "編集を保持" });
  });

  it("uses the latest saved parent fields when completion follows an edit in the same turn", async () => {
    const child = { ...savedTask, id: "subtask-1", parentTaskId: savedTask.id, order: 1 };
    vi.mocked(loadProductivityData).mockResolvedValue({ tasks: [savedTask, child], projects: [], sessions: [], invalidRecordCount: 0, repairedRecordCount: 0 });
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.tasks).toHaveLength(2));

    await act(async () => {
      expect(await result.current.updateTask(savedTask.id, { title: "保存済みの親" })).toBe(true);
      expect(await result.current.toggleTask(savedTask.id)).toBe(true);
    });
    expect(result.current.tasks.find((task) => task.id === savedTask.id)).toMatchObject({ title: "保存済みの親", status: "completed" });
    expect(result.current.tasks.find((task) => task.id === child.id)?.status).toBe("completed");
    expect(saveProductivityRecords).toHaveBeenLastCalledWith({ tasks: [
      expect.objectContaining({ id: savedTask.id, title: "保存済みの親", status: "completed" }),
      expect.objectContaining({ id: child.id, status: "completed" })
    ] });
  });

  it("updates refs immediately after a cascade before the next task edit", async () => {
    const child = { ...savedTask, id: "subtask-1", parentTaskId: savedTask.id, order: 1 };
    vi.mocked(loadProductivityData).mockResolvedValue({ tasks: [savedTask, child], projects: [], sessions: [], invalidRecordCount: 0, repairedRecordCount: 0 });
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.tasks).toHaveLength(2));

    await act(async () => {
      expect(await result.current.toggleTask(savedTask.id)).toBe(true);
      expect(await result.current.updateTask(child.id, { note: "完了後の補足" })).toBe(true);
    });
    expect(result.current.tasks.find((task) => task.id === child.id)).toMatchObject({ status: "completed", note: "完了後の補足" });
  });

  it("locks a recurring series root while deleting one occurrence", async () => {
    const today = toLocalDateKey(new Date());
    const root = { ...savedTask, dueDate: addLocalDays(today, -1), repeatRule: { type: "daily", interval: 1 } as const };
    const occurrence = { ...root, id: "task-occurrence", dueDate: today, repeatSeriesId: root.id };
    vi.mocked(loadProductivityData).mockResolvedValue({ tasks: [root, occurrence], projects: [], sessions: [], invalidRecordCount: 0, repairedRecordCount: 0 });
    let releaseRootSave!: () => void;
    vi.mocked(saveProductivityRecords).mockImplementationOnce(() => new Promise<void>((resolve) => { releaseRootSave = resolve; }));
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.tasks).toHaveLength(2));

    let deletion!: Promise<boolean>;
    await act(async () => {
      deletion = result.current.deleteTask(occurrence.id);
      await Promise.resolve();
      expect(await result.current.toggleTask(root.id)).toBe(false);
      releaseRootSave();
      expect(await deletion).toBe(true);
    });
    expect(deleteProductivityRecords).toHaveBeenCalledWith({ taskIds: [occurrence.id] });
  });

  it("locks every series task while stopping recurrence", async () => {
    const today = toLocalDateKey(new Date());
    const root = { ...savedTask, dueDate: addLocalDays(today, -1), repeatRule: { type: "daily", interval: 1 } as const };
    const occurrence = { ...root, id: "task-occurrence", dueDate: today, repeatSeriesId: root.id };
    vi.mocked(loadProductivityData).mockResolvedValue({ tasks: [root, occurrence], projects: [], sessions: [], invalidRecordCount: 0, repairedRecordCount: 0 });
    let releaseSeriesSave!: () => void;
    vi.mocked(saveProductivityRecords).mockImplementationOnce(() => new Promise<void>((resolve) => { releaseSeriesSave = resolve; }));
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.tasks).toHaveLength(2));

    let stop!: Promise<boolean>;
    await act(async () => {
      stop = result.current.deleteRecurringSeries(root.id);
      await Promise.resolve();
      expect(await result.current.toggleTask(occurrence.id)).toBe(false);
      releaseSeriesSave();
      expect(await stop).toBe(true);
    });
    expect(result.current.tasks.every((task) => task.repeatRule === null && task.repeatSeriesId === null)).toBe(true);
  });

  it("rejects child edits and structural mutations while an ancestor cascade owns the tree", async () => {
    const child = { ...savedTask, id: "subtask-1", parentTaskId: savedTask.id, order: 1 };
    const archivedChild = { ...savedTask, id: "subtask-archived", parentTaskId: savedTask.id, status: "archived" as const, completedAt: null, order: 2 };
    vi.mocked(loadProductivityData).mockResolvedValue({ tasks: [savedTask, child, archivedChild], projects: [], sessions: [], invalidRecordCount: 0, repairedRecordCount: 0 });
    let releaseCascade!: () => void;
    vi.mocked(saveProductivityRecords).mockImplementationOnce(() => new Promise<void>((resolve) => { releaseCascade = resolve; }));
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.tasks).toHaveLength(3));

    let cascade!: Promise<boolean>;
    await act(async () => {
      cascade = result.current.toggleTask(savedTask.id);
      await Promise.resolve();
      expect(await result.current.updateTask(child.id, { note: "編集を保留" })).toBe(false);
      expect(await result.current.archiveTask(child.id)).toBe(false);
      expect(await result.current.deleteTask(child.id)).toBe(false);
      expect(await result.current.restoreTask(archivedChild.id)).toBe(false);
      expect(await result.current.toggleTask(archivedChild.id)).toBe(false);
      releaseCascade();
      expect(await cascade).toBe(true);
    });

    expect(result.current.tasks.find((task) => task.id === child.id)).toMatchObject({ status: "completed", note: "" });
    expect(result.current.tasks.find((task) => task.id === archivedChild.id)).toEqual(archivedChild);
    await act(async () => { expect(await result.current.toggleTask(archivedChild.id)).toBe(false); });
    expect(saveTaskRecord).not.toHaveBeenCalled();
    expect(deleteProductivityRecords).not.toHaveBeenCalled();
  });

  it("blocks ancestor completion while a prior child undo is saving", async () => {
    const child = { ...savedTask, id: "subtask-1", parentTaskId: savedTask.id, order: 1 };
    vi.mocked(loadProductivityData).mockResolvedValue({ tasks: [savedTask, child], projects: [], sessions: [], invalidRecordCount: 0, repairedRecordCount: 0 });
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.tasks).toHaveLength(2));
    await act(async () => { expect(await result.current.toggleTask(child.id)).toBe(true); });
    expect(result.current.canUndo).toBe(true);

    let releaseUndo!: () => void;
    vi.mocked(saveProductivityRecords).mockImplementationOnce(() => new Promise<void>((resolve) => { releaseUndo = resolve; }));
    let undo!: Promise<boolean>;
    await act(async () => {
      undo = result.current.undo();
      await Promise.resolve();
      expect(await result.current.toggleTask(savedTask.id)).toBe(false);
      releaseUndo();
      expect(await undo).toBe(true);
    });
    expect(result.current.tasks.find((task) => task.id === savedTask.id)?.status).toBe("open");
    expect(result.current.tasks.find((task) => task.id === child.id)?.status).toBe("open");
    expect(result.current.canUndo).toBe(false);
  });

  it("preserves an available undo when it is requested during an ancestor cascade", async () => {
    const child = { ...savedTask, id: "subtask-1", parentTaskId: savedTask.id, order: 1 };
    const priorTask = { ...savedTask, id: "task-prior", title: "直前の操作", order: 2 };
    vi.mocked(loadProductivityData).mockResolvedValue({ tasks: [savedTask, child, priorTask], projects: [], sessions: [], invalidRecordCount: 0, repairedRecordCount: 0 });
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.tasks).toHaveLength(3));
    await act(async () => { expect(await result.current.toggleTask(priorTask.id)).toBe(true); });
    expect(result.current.canUndo).toBe(true);

    let releaseCascade!: () => void;
    vi.mocked(saveProductivityRecords).mockImplementationOnce(() => new Promise<void>((resolve) => { releaseCascade = resolve; }));
    let cascade!: Promise<boolean>;
    await act(async () => {
      cascade = result.current.toggleTask(savedTask.id);
      await Promise.resolve();
      expect(await result.current.undo()).toBe(false);
      expect(result.current.canUndo).toBe(true);
      releaseCascade();
      expect(await cascade).toBe(true);
    });
    expect(result.current.tasks.find((task) => task.id === savedTask.id)?.status).toBe("completed");
    expect(result.current.tasks.find((task) => task.id === child.id)?.status).toBe("completed");
    expect(result.current.canUndo).toBe(true);
    await act(async () => { expect(await result.current.undo()).toBe(true); });
    expect(result.current.tasks.find((task) => task.id === savedTask.id)?.status).toBe("open");
    expect(result.current.tasks.find((task) => task.id === child.id)?.status).toBe("open");
    expect(result.current.tasks.find((task) => task.id === priorTask.id)?.status).toBe("completed");
  });

  it("does not try to toggle tasks when local storage is unavailable", async () => {
    vi.mocked(loadProductivityData).mockRejectedValue(new Error("unavailable"));
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.storageAvailable).toBe(false));
    await act(async () => { expect(await result.current.toggleTask(savedTask.id)).toBe(false); });
    expect(saveProductivityRecords).not.toHaveBeenCalled();
  });

  it("archives and restores descendants at any depth", async () => {
    const child = { ...savedTask, id: "subtask-1", parentTaskId: savedTask.id, order: 1 };
    const grandchild = { ...savedTask, id: "subtask-2", parentTaskId: child.id, order: 2 };
    vi.mocked(loadProductivityData).mockResolvedValue({ tasks: [savedTask, child, grandchild], projects: [], sessions: [], invalidRecordCount: 0, repairedRecordCount: 0 });
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.tasks).toHaveLength(3));
    await act(async () => { expect(await result.current.archiveTask(savedTask.id)).toBe(true); });
    expect(result.current.tasks.every((task) => task.status === "archived")).toBe(true);
    await act(async () => { expect(await result.current.restoreTask(savedTask.id)).toBe(true); });
    expect(result.current.tasks.every((task) => task.status === "open")).toBe(true);
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
