import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ProjectRecord } from "../../types/project";
import type { TaskRecord } from "../../types/task";
import { toLocalDateKey } from "../../utils/taskQueries";
import { TaskDrawer } from "./TaskDrawer";

const today = toLocalDateKey(new Date());
const task: TaskRecord = {
  version: 1,
  id: "task-1",
  title: "数学の復習",
  status: "open",
  bucket: "inbox",
  projectId: "project-1",
  parentTaskId: null,
  note: "公式を確認する",
  dueDate: today,
  reminderAt: null,
  repeatRule: null,
  repeatSeriesId: null,
  estimatedPomodoros: 2,
  order: 0,
  createdAt: 1,
  updatedAt: 1,
  completedAt: null
};

const project: ProjectRecord = {
  version: 1,
  id: "project-1",
  name: "勉強",
  color: "#3f6fab",
  order: 0,
  archivedAt: null,
  createdAt: 1,
  updatedAt: 1
};

function renderDrawer(overrides: Partial<React.ComponentProps<typeof TaskDrawer>> = {}) {
  const props: React.ComponentProps<typeof TaskDrawer> = {
    open: true,
    tasks: [task],
    projects: [project],
    sessions: [],
    loading: false,
    storageAvailable: true,
    canUndo: false,
    timerStatus: "idle",
    activeTaskId: null,
    workMinutes: 25,
    notificationPermission: "unsupported",
    onClose: vi.fn(),
    onAddTask: vi.fn().mockResolvedValue(true),
    onUpdateTask: vi.fn().mockResolvedValue(true),
    onToggleTask: vi.fn().mockResolvedValue(true),
    onArchiveTask: vi.fn().mockResolvedValue(true),
    onMoveTask: vi.fn().mockResolvedValue(true),
    onAddProject: vi.fn().mockResolvedValue(true),
    onArchiveProject: vi.fn().mockResolvedValue(true),
    onUndo: vi.fn().mockResolvedValue(true),
    onStartTask: vi.fn(),
    onRequestNotification: vi.fn().mockResolvedValue(false),
    onImportBackup: vi.fn().mockResolvedValue(true),
    ...overrides
  };
  render(<TaskDrawer {...props} />);
  return props;
}

describe("TaskDrawer", () => {
  it("adds a task to today's list with a single title", async () => {
    const props = renderDrawer();
    fireEvent.change(screen.getByLabelText("新しいタスク"), { target: { value: "英単語を覚える" } });
    fireEvent.click(screen.getByRole("button", { name: "追加" }));
    await waitFor(() => expect(props.onAddTask).toHaveBeenCalledWith(expect.objectContaining({ title: "英単語を覚える", dueDate: today })));
  });

  it("completes a task and edits its details through named controls", async () => {
    const props = renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: "数学の復習を完了" }));
    expect(props.onToggleTask).toHaveBeenCalledWith(task.id);

    fireEvent.click(screen.getByRole("button", { name: /数学の復習/ , expanded: false }));
    fireEvent.change(screen.getByLabelText("タスク名"), { target: { value: "数学Iの復習" } });
    fireEvent.change(screen.getByLabelText("見積もり"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("繰り返し"), { target: { value: "daily" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(props.onUpdateTask).toHaveBeenCalledWith(task.id, expect.objectContaining({ title: "数学Iの復習", estimatedPomodoros: 3, repeatRule: { type: "daily", interval: 1 } })));
  });

  it("starts the timer for a task only while the timer is idle", () => {
    const props = renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: "数学の復習のタイマーを開始" }));
    expect(props.onStartTask).toHaveBeenCalledWith(task.id);
  });

  it("filters the current list by task title or note", () => {
    renderDrawer({
      tasks: [task, { ...task, id: "task-2", title: "国語の予習", note: "教科書を読む", order: 1 }]
    });
    fireEvent.change(screen.getByLabelText("タスクを検索"), { target: { value: "公式" } });
    expect(screen.getByText("数学の復習")).toBeTruthy();
    expect(screen.queryByText("国語の予習")).toBeNull();

    fireEvent.change(screen.getByLabelText("タスクを検索"), { target: { value: "見つからない" } });
    expect(screen.getByText("一致するタスクはありません")).toBeTruthy();
  });

  it("opens the local productivity report", () => {
    renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: "レポート" }));
    expect(screen.getByRole("heading", { name: "集中レポート" })).toBeTruthy();
    expect(screen.getByText("この期間の集中記録はまだありません。")).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "タスク一覧" })).toBeNull();
  });

  it("opens backup and restore with a count preview of current data", () => {
    renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: "データ" }));
    expect(screen.getByRole("heading", { name: "バックアップと復元" })).toBeTruthy();
    expect(screen.getByText("タスク 1件・プロジェクト 1件・履歴 0件")).toBeTruthy();
  });

  it("adds a subtask from the task details", async () => {
    const props = renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: /数学の復習/, expanded: false }));
    const details = within(screen.getByRole("form", { name: "数学の復習の詳細" }));
    fireEvent.change(details.getByLabelText("サブタスク名"), { target: { value: "例題を3問解く" } });
    fireEvent.click(details.getByRole("button", { name: "追加" }));
    await waitFor(() => expect(props.onAddTask).toHaveBeenCalledWith(expect.objectContaining({ title: "例題を3問解く", parentTaskId: task.id, projectId: task.projectId })));
  });

  it("saves a custom repeat interval", async () => {
    const props = renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: /数学の復習/, expanded: false }));
    fireEvent.change(screen.getByLabelText("繰り返し"), { target: { value: "custom" } });
    fireEvent.change(screen.getByLabelText("繰り返し間隔"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("繰り返し単位"), { target: { value: "weekly" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(props.onUpdateTask).toHaveBeenCalledWith(task.id, expect.objectContaining({ repeatRule: expect.objectContaining({ type: "weekly", interval: 2 }) })));
  });

  it("exposes a storage failure without hiding the existing timer application", () => {
    renderDrawer({ storageAvailable: false, tasks: [] });
    expect(screen.getByRole("status").textContent).toContain("タスク保存を利用できません");
    expect((screen.getByLabelText("新しいタスク") as HTMLInputElement).disabled).toBe(true);
  });
});
