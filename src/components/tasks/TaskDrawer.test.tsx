import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FocusSessionRecord } from "../../types/focusSession";
import type { ProjectRecord } from "../../types/project";
import type { TaskRecord } from "../../types/task";
import { addLocalDays, toLocalDateKey } from "../../utils/taskQueries";
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

const session: FocusSessionRecord = {
  version: 1,
  id: "session-1",
  taskId: task.id,
  taskTitleSnapshot: task.title,
  projectIdSnapshot: project.id,
  projectNameSnapshot: project.name,
  program: "pomodoro",
  mode: "work",
  result: "completed",
  startedAt: 1,
  endedAt: new Date(`${today}T09:00:00`).getTime(),
  plannedDurationMs: 25 * 60_000,
  focusedDurationMs: 25 * 60_000
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
  it("shows a daily focus summary before the task list", () => {
    renderDrawer({ sessions: [session] });
    expect(screen.getByRole("region", { name: "今日の集中サマリー" }).textContent).toContain("今日の集中ハブ");
    expect(screen.getByRole("region", { name: "現在の一覧" }).textContent).toContain("今日動かすタスクを、この画面だけで追加して集中できます。");
    expect(screen.getByRole("heading", { name: "今日の流れ" })).toBeTruthy();
    expect(screen.getByText("25分")).toBeTruthy();
    expect(screen.getByRole("button", { name: "開始" })).toBeTruthy();
  });

  it("updates the current-list summary and quick-add context when switching to a project", () => {
    renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: /勉強 1/ }));
    expect(screen.getByRole("region", { name: "現在の一覧" }).textContent).toContain("勉強");
    expect(screen.getByRole("region", { name: "現在の一覧" }).textContent).toContain("集中する順で確認できます。");
    expect(screen.getByText("勉強へすぐ追加")).toBeTruthy();
    expect(screen.getByLabelText("新しいタスク").getAttribute("placeholder")).toBe("勉強で次に進めることを追加");
  });

  it("shows a resume banner and opens the suggested next task after returning to the list", async () => {
    const nextTask: TaskRecord = {
      ...task,
      id: "task-2",
      title: "英語の宿題",
      dueDate: addLocalDays(today, 1),
      order: 1,
      updatedAt: 2
    };
    renderDrawer({
      tasks: [task, nextTask],
      resumeContext: {
        label: "セッション完了後のつづき",
        title: "英語の宿題を次の候補として開いています",
        detail: "明日の予定を先に整えてから休憩へ移れます。",
        taskId: nextTask.id,
        actionLabel: "候補を開く"
      }
    });
    expect(screen.getByRole("region", { name: "一覧へ戻ったあとの案内" }).textContent).toContain("英語の宿題");
    expect(screen.getByRole("region", { name: "一覧へ戻ったあとの案内" }).textContent).toContain("セッション完了後のつづき");
    await waitFor(() => expect(screen.getByRole("form", { name: "英語の宿題の詳細" })).toBeTruthy());
    expect(screen.getByText("次の候補")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(screen.queryByRole("region", { name: "一覧へ戻ったあとの案内" })).toBeNull();
  });

  it("surfaces the active focus context at the top of the drawer", async () => {
    renderDrawer({ timerStatus: "running", activeTaskId: task.id });
    expect(screen.getByRole("region", { name: "一覧へ戻ったあとの案内" }).textContent).toContain("いまの集中");
    expect(screen.getByRole("region", { name: "一覧へ戻ったあとの案内" }).textContent).toContain("数学の復習に集中中です");
    fireEvent.click(screen.getByRole("button", { name: "進行中を開く" }));
    await waitFor(() => expect(screen.getByRole("form", { name: "数学の復習の詳細" })).toBeTruthy());
    expect(screen.getByRole("button", { name: "数学の復習の詳細からタイマーへ戻る" })).toBeTruthy();
  });

  it("groups today tasks by project and exposes focus meters for each section", () => {
    const workProject: ProjectRecord = {
      ...project,
      id: "project-2",
      name: "仕事",
      color: "#347b70",
      order: 1,
      createdAt: 2,
      updatedAt: 2
    };
    renderDrawer({
      projects: [project, workProject],
      tasks: [
        task,
        { ...task, id: "task-2", title: "買い物メモ", projectId: null, estimatedPomodoros: 1, order: 1, updatedAt: 2 },
        { ...task, id: "task-3", title: "資料整理", projectId: workProject.id, estimatedPomodoros: 3, order: 2, updatedAt: 3 }
      ]
    });
    expect(screen.getByRole("heading", { name: "勉強" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "仕事" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "プロジェクトなし" })).toBeTruthy();
    expect(screen.getByLabelText("勉強の集中目安 0 / 2")).toBeTruthy();
    expect(screen.getByLabelText("仕事の集中目安 0 / 3")).toBeTruthy();
    expect(screen.getByLabelText("プロジェクトなしの集中目安 0 / 1")).toBeTruthy();
  });

  it("surfaces overdue work first in the focus queue", () => {
    const overdueTask: TaskRecord = {
      ...task,
      id: "task-2",
      title: "英語の宿題",
      dueDate: addLocalDays(today, -1),
      order: 1,
      updatedAt: 2
    };

    renderDrawer({
      tasks: [task, overdueTask]
    });

    expect(screen.getByText("先に片づける")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "英語の宿題の順番と詳細を開く" }));
    expect(screen.getByRole("form", { name: "英語の宿題の詳細" })).toBeTruthy();
  });

  it("adds a task to today's list with a single title", async () => {
    const props = renderDrawer();
    fireEvent.change(screen.getByLabelText("新しいタスク"), { target: { value: "英単語を覚える" } });
    fireEvent.click(screen.getByRole("button", { name: "追加" }));
    await waitFor(() => expect(props.onAddTask).toHaveBeenCalledWith(expect.objectContaining({ title: "英単語を覚える", dueDate: today })));
  });

  it("uses the quick due-date presets for fast mobile entry", async () => {
    const props = renderDrawer();
    fireEvent.change(screen.getByLabelText("新しいタスク"), { target: { value: "理科の暗記" } });
    const tomorrowButton = screen.getByRole("button", { name: "明日" });
    fireEvent.click(tomorrowButton);
    expect(tomorrowButton.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "追加" }));
    await waitFor(() => expect(props.onAddTask).toHaveBeenCalledWith(expect.objectContaining({ title: "理科の暗記", dueDate: addLocalDays(today, 1) })));
  });

  it("opens the focus candidate details from the hero card", () => {
    renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: "数学の復習の詳細を開く" }));
    expect(screen.getByRole("form", { name: "数学の復習の詳細" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "タスクの概要" }).textContent).toContain("集中 0 / 2");
    expect(screen.getByText("0 / 1件が完了")).toBeTruthy();
  });

  it("returns focus to the task row after closing the details panel", async () => {
    renderDrawer();
    const rowButton = screen.getByRole("button", { name: /数学の復習/ , expanded: false });
    fireEvent.click(rowButton);
    fireEvent.click(screen.getByRole("button", { name: "詳細を閉じる" }));
    await waitFor(() => expect(document.activeElement).toBe(rowButton));
  });

  it("surfaces the next reminder in the focus hub and task row", () => {
    const reminderAt = new Date(`${addLocalDays(today, 1)}T09:30:00`).getTime();
    renderDrawer({
      tasks: [{ ...task, reminderAt }]
    });
    expect(screen.getByLabelText("次のリマインダー").textContent).toContain("数学の復習");
    expect(screen.getByLabelText("次のリマインダー").textContent).toContain("明日");
    expect(screen.getByLabelText("次のリマインダー").textContent).toContain("09:30");
    expect(screen.getAllByText(/通知/).length).toBeGreaterThan(0);
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

  it("starts the timer directly from the task details", () => {
    const props = renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: /数学の復習/, expanded: false }));
    fireEvent.click(screen.getByRole("button", { name: "数学の復習を詳細から開始" }));
    expect(props.onStartTask).toHaveBeenCalledWith(task.id);
  });

  it("returns to the running timer instead of showing a disabled start for the active task", () => {
    const props = renderDrawer({ timerStatus: "running", activeTaskId: task.id });
    fireEvent.click(screen.getAllByRole("button", { name: "タイマーへ戻る" })[0]);
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onStartTask).not.toHaveBeenCalled();
  });

  it("returns to the running timer from the task details", () => {
    const props = renderDrawer({ timerStatus: "running", activeTaskId: task.id });
    fireEvent.click(screen.getByRole("button", { name: /数学の復習/, expanded: false }));
    fireEvent.click(screen.getByRole("button", { name: "数学の復習の詳細からタイマーへ戻る" }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onStartTask).not.toHaveBeenCalled();
  });

  it("filters the current list by task title or note", () => {
    renderDrawer({
      tasks: [task, { ...task, id: "task-2", title: "国語の予習", note: "教科書を読む", order: 1 }]
    });
    fireEvent.change(screen.getByLabelText("タスクを検索"), { target: { value: "公式" } });
    const list = screen.getAllByLabelText("タスク一覧").at(-1);
    expect(list).toBeTruthy();
    expect(within(list as HTMLElement).getByText("数学の復習")).toBeTruthy();
    expect(within(list as HTMLElement).queryByText("国語の予習")).toBeNull();

    fireEvent.change(screen.getByLabelText("タスクを検索"), { target: { value: "見つからない" } });
    expect(screen.getByText("一致するタスクはありません")).toBeTruthy();
  });

  it("narrows the visible list with quick filters for overdue, reminders, and focus-ready work", () => {
    const overdueTask: TaskRecord = {
      ...task,
      id: "task-2",
      title: "英語の宿題",
      dueDate: addLocalDays(today, -1),
      estimatedPomodoros: 0,
      order: 1,
      updatedAt: 2
    };
    const reminderTask: TaskRecord = {
      ...task,
      id: "task-3",
      title: "理科の暗記",
      dueDate: today,
      reminderAt: new Date(`${today}T21:30:00`).getTime(),
      estimatedPomodoros: 0,
      order: 2,
      updatedAt: 3
    };
    const plainTask: TaskRecord = {
      ...task,
      id: "task-4",
      title: "机を片づける",
      dueDate: today,
      estimatedPomodoros: 0,
      order: 3,
      updatedAt: 4
    };

    renderDrawer({
      tasks: [task, overdueTask, reminderTask, plainTask]
    });

    const list = screen.getAllByLabelText("タスク一覧").at(-1) as HTMLElement;
    fireEvent.click(screen.getByRole("button", { name: "期限切れ 1" }));
    expect(within(list).getByText("英語の宿題")).toBeTruthy();
    expect(within(list).queryByText("数学の復習")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "通知 1" }));
    expect(within(list).getByText("理科の暗記")).toBeTruthy();
    expect(within(list).queryByText("英語の宿題")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "集中目安 1" }));
    expect(within(list).getByText("数学の復習")).toBeTruthy();
    expect(within(list).queryByText("理科の暗記")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "すべて 4" }));
    expect(within(list).getByText("机を片づける")).toBeTruthy();
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

  it("lets the user move the due date from the details shortcuts", async () => {
    const props = renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: /数学の復習/, expanded: false }));
    const details = within(screen.getByRole("form", { name: "数学の復習の詳細" }));
    fireEvent.click(details.getByRole("button", { name: "明日に移す" }));
    expect((details.getByLabelText("期限") as HTMLInputElement).value).toBe(addLocalDays(today, 1));
    fireEvent.click(details.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(props.onUpdateTask).toHaveBeenCalledWith(task.id, expect.objectContaining({ dueDate: addLocalDays(today, 1) })));
  });

  it("exposes a storage failure without hiding the existing timer application", () => {
    renderDrawer({ storageAvailable: false, tasks: [] });
    expect(screen.getByRole("status").textContent).toContain("タスク保存を利用できません");
    expect((screen.getByLabelText("新しいタスク") as HTMLInputElement).disabled).toBe(true);
  });
});
