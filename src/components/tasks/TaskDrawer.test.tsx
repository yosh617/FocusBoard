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
    onAddTask: vi.fn().mockResolvedValue("task-created"),
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
  it("puts the list heading, capture input, and task list before any supplementary cards", () => {
    renderDrawer({ sessions: [session] });
    expect(screen.getByRole("heading", { name: "今日" })).toBeTruthy();
    expect(screen.getByLabelText("新しいタスク")).toBeTruthy();
    expect(screen.getAllByLabelText("タスク一覧").length).toBeGreaterThan(1);
    expect(screen.queryByText("今日の集中ハブ")).toBeNull();
    expect(screen.queryByText("今日の流れ")).toBeNull();
    expect(screen.queryByRole("region", { name: "現在の一覧" })).toBeNull();
  });

  it("shows a focus-ready label and a visible start action in the task row", () => {
    renderDrawer();
    expect(screen.getByRole("button", { name: /数学の復習/, expanded: false }).textContent).toContain("次に集中");
    expect(screen.getByRole("button", { name: "数学の復習のタイマーを開始" }).textContent).toContain("開始");
  });

  it("keeps task capture concise when switching to a project", () => {
    renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: /勉強 1/ }));
    expect(screen.getByRole("heading", { name: "勉強" })).toBeTruthy();
    expect(screen.getByLabelText("新しいタスク").getAttribute("placeholder")).toBe("タスクを追加…");
  });

  it("adds projects with an accessible fixed color palette", async () => {
    const props = renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: "新規" }));

    expect(document.querySelector(".project-add input[type='color']")).toBeNull();
    const palette = screen.getByRole("group", { name: "プロジェクトの色を選択" });
    expect(within(palette).getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual([
      "ブルー",
      "インディゴ",
      "パープル",
      "レッド",
      "オレンジ",
      "イエロー",
      "ライム",
      "グリーン",
      "ティール",
      "シアン"
    ]);
    expect(within(palette).getAllByRole("button").map((button) => (button.querySelector("span") as HTMLElement).style.backgroundColor)).toEqual([
      "rgb(10, 132, 255)",
      "rgb(79, 70, 229)",
      "rgb(124, 58, 237)",
      "rgb(255, 69, 58)",
      "rgb(255, 149, 0)",
      "rgb(245, 183, 0)",
      "rgb(132, 204, 22)",
      "rgb(48, 199, 89)",
      "rgb(0, 191, 166)",
      "rgb(0, 174, 239)"
    ]);
    expect(within(palette).queryByRole("button", { name: /ピンク|マゼンタ/ })).toBeNull();

    const cyan = within(palette).getByRole("button", { name: "シアン" });
    expect(cyan.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(cyan);
    expect(cyan.getAttribute("aria-pressed")).toBe("true");

    fireEvent.change(screen.getByLabelText("新しいプロジェクト名"), { target: { value: "読書" } });
    fireEvent.click(screen.getByRole("button", { name: "プロジェクトを追加" }));
    await waitFor(() => expect(props.onAddProject).toHaveBeenCalledWith("読書", "#00AEEF"));

    fireEvent.click(screen.getByRole("button", { name: "新規" }));
    expect(within(screen.getByRole("group", { name: "プロジェクトの色を選択" })).getByRole("button", { name: "ブルー" }).getAttribute("aria-pressed")).toBe("true");
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
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(screen.queryByRole("region", { name: "一覧へ戻ったあとの案内" })).toBeNull();
  });

  it("surfaces the active focus context at the top of the drawer", async () => {
    renderDrawer({ timerStatus: "running", activeTaskId: task.id });
    expect(screen.getByRole("region", { name: "一覧へ戻ったあとの案内" }).textContent).toContain("いまの集中");
    expect(screen.getByRole("region", { name: "一覧へ戻ったあとの案内" }).textContent).toContain("数学の復習に集中中です");
    fireEvent.click(screen.getByRole("button", { name: /数学の復習/, expanded: false }));
    await waitFor(() => expect(screen.getByRole("form", { name: "数学の復習の詳細" })).toBeTruthy());
    expect(screen.getByRole("button", { name: "数学の復習の詳細からタイマーへ戻る" })).toBeTruthy();
  });


  it("switches between list selection and tasks on compact screens", () => {
    const originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === "(max-width: 820px)",
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn()
      }))
    });

    try {
      renderDrawer();
      const summary = screen.getByRole("button", { name: /表示先/ });
      expect(summary.getAttribute("aria-expanded")).toBe("false");
      expect(document.querySelector(".task-drawer__body")?.classList.contains("is-navigation-open")).toBe(false);
      expect(screen.queryByRole("button", { name: "明日 0" })).toBeNull();

      fireEvent.click(summary);
      expect(summary.getAttribute("aria-expanded")).toBe("true");
      expect(document.querySelector(".task-drawer__body")?.classList.contains("is-navigation-open")).toBe(true);
      fireEvent.click(screen.getByRole("button", { name: "明日 0" }));

      expect(summary.getAttribute("aria-expanded")).toBe("false");
      expect(document.querySelector(".task-drawer__body")?.classList.contains("is-navigation-open")).toBe(false);
      expect(screen.getByRole("heading", { name: "明日" })).toBeTruthy();
    } finally {
      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        value: originalMatchMedia
      });
    }
  });

  it("exposes a skip link for keyboard users and opens task details from the list", async () => {
    renderDrawer();
    expect(screen.getByRole("link", { name: "現在の一覧へ移動" }).getAttribute("href")).toBe("#task-workspace-main");
    fireEvent.click(screen.getByRole("button", { name: /数学の復習/, expanded: false }));
    await waitFor(() => expect(screen.getByRole("form", { name: "数学の復習の詳細" })).toBeTruthy());
  });

  it("reveals the active task from the banner after filter narrowing", async () => {
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView
    });

    try {
      renderDrawer({ timerStatus: "running", activeTaskId: task.id });
      fireEvent.click(screen.getByRole("button", { name: "Inbox 1" }));
      fireEvent.click(screen.getByRole("button", { name: "期限切れ 0" }));

      fireEvent.click(screen.getByRole("button", { name: "進行中を開く" }));

      await waitFor(() => expect(screen.getByRole("form", { name: "数学の復習の詳細" })).toBeTruthy());
      expect(screen.queryByRole("group", { name: "表示するタスクを絞り込む" })).toBeNull();
      expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: "start" }));
    } finally {
      Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
        configurable: true,
        value: originalScrollIntoView
      });
    }
  });

  it("filters overdue work from the compact filter controls", async () => {
    const reminderTask: TaskRecord = {
      ...task,
      id: "task-2",
      title: "理科の暗記",
      reminderAt: new Date(`${addLocalDays(today, 1)}T09:30:00`).getTime(),
      estimatedPomodoros: 0,
      order: 1,
      updatedAt: 2
    };
    const overdueTask: TaskRecord = {
      ...task,
      id: "task-3",
      title: "英語の宿題",
      dueDate: addLocalDays(today, -1),
      estimatedPomodoros: 0,
      order: 2,
      updatedAt: 3
    };

    renderDrawer({
      tasks: [task, reminderTask, overdueTask],
      timerStatus: "running",
      activeTaskId: task.id
    });

    fireEvent.click(screen.getByRole("button", { name: "Inbox 3" }));
    fireEvent.click(screen.getByRole("button", { name: "期限切れ 1" }));
    const list = screen.getAllByLabelText("タスク一覧").at(-1) as HTMLElement;
    await waitFor(() => expect(within(list).getByText("英語の宿題")).toBeTruthy());
    expect(within(list).queryByText("理科の暗記")).toBeNull();
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

  it("marks overdue work in the task list", () => {
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

    expect(screen.getByRole("button", { name: /英語の宿題/, expanded: false }).textContent).toContain("先に片づける");
    fireEvent.click(screen.getByRole("button", { name: /英語の宿題/, expanded: false }));
    expect(screen.getByRole("form", { name: "英語の宿題の詳細" })).toBeTruthy();
  });

  it("adds a task to today's list with a single title", async () => {
    const props = renderDrawer();
    fireEvent.change(screen.getByLabelText("新しいタスク"), { target: { value: "英単語を覚える" } });
    fireEvent.click(screen.getByRole("button", { name: "完了" }));
    await waitFor(() => expect(props.onAddTask).toHaveBeenCalledWith(expect.objectContaining({ title: "英単語を覚える", dueDate: today })));
  });

  it("omits quick capture from the completed view while keeping it in regular views", () => {
    const completedTask: TaskRecord = {
      ...task,
      id: "task-completed",
      title: "復習済み",
      status: "completed",
      completedAt: Date.now(),
      updatedAt: 2
    };
    renderDrawer({ tasks: [task, completedTask] });

    expect(document.querySelector(".task-quick-add")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "完了済み 1" }));

    expect(screen.getByRole("heading", { name: "完了済み" })).toBeTruthy();
    expect(document.querySelector(".task-quick-add")).toBeNull();
  });

  it("keeps the newly added task in the list and returns focus to quick capture", async () => {
    const createdTask: TaskRecord = {
      ...task,
      id: "task-created",
      title: "英単語を覚える",
      order: 1,
      updatedAt: 2
    };
    const onAddTask = vi.fn().mockResolvedValue(createdTask.id);
    const { rerender } = render(
      <TaskDrawer
        open
        tasks={[task]}
        projects={[project]}
        sessions={[]}
        loading={false}
        storageAvailable={true}
        canUndo={false}
        timerStatus="idle"
        activeTaskId={null}
        workMinutes={25}
        notificationPermission="unsupported"
        onClose={vi.fn()}
        onAddTask={onAddTask}
        onUpdateTask={vi.fn().mockResolvedValue(true)}
        onToggleTask={vi.fn().mockResolvedValue(true)}
        onArchiveTask={vi.fn().mockResolvedValue(true)}
        onMoveTask={vi.fn().mockResolvedValue(true)}
        onAddProject={vi.fn().mockResolvedValue(true)}
        onArchiveProject={vi.fn().mockResolvedValue(true)}
        onUndo={vi.fn().mockResolvedValue(true)}
        onStartTask={vi.fn()}
        onRequestNotification={vi.fn().mockResolvedValue(false)}
        onImportBackup={vi.fn().mockResolvedValue(true)}
      />
    );

    fireEvent.change(screen.getByLabelText("新しいタスク"), { target: { value: createdTask.title } });
    fireEvent.click(screen.getByRole("button", { name: "完了" }));
    await waitFor(() => expect(onAddTask).toHaveBeenCalledWith(expect.objectContaining({ title: createdTask.title })));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("新しいタスク")));

    rerender(
      <TaskDrawer
        open
        tasks={[task, createdTask]}
        projects={[project]}
        sessions={[]}
        loading={false}
        storageAvailable={true}
        canUndo={false}
        timerStatus="idle"
        activeTaskId={null}
        workMinutes={25}
        notificationPermission="unsupported"
        onClose={vi.fn()}
        onAddTask={onAddTask}
        onUpdateTask={vi.fn().mockResolvedValue(true)}
        onToggleTask={vi.fn().mockResolvedValue(true)}
        onArchiveTask={vi.fn().mockResolvedValue(true)}
        onMoveTask={vi.fn().mockResolvedValue(true)}
        onAddProject={vi.fn().mockResolvedValue(true)}
        onArchiveProject={vi.fn().mockResolvedValue(true)}
        onUndo={vi.fn().mockResolvedValue(true)}
        onStartTask={vi.fn()}
        onRequestNotification={vi.fn().mockResolvedValue(false)}
        onImportBackup={vi.fn().mockResolvedValue(true)}
      />
    );

    await waitFor(() => expect(screen.queryByRole("form", { name: `${createdTask.title}の詳細` })).toBeNull());
  });

  it("sets today on the first due-date tap and opens the calendar on the second", async () => {
    const props = renderDrawer();
    fireEvent.change(screen.getByLabelText("新しいタスク"), { target: { value: "理科の暗記" } });
    expect(screen.queryByRole("dialog", { name: "期限を設定" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "期限を今日に設定" }));
    expect(screen.queryByRole("dialog", { name: "期限を設定" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`期限 ${today}`) }));
    const calendar = screen.getByRole("dialog", { name: "期限を設定" });
    fireEvent.click(within(calendar).getByRole("button", { name: "明日" }));
    fireEvent.click(screen.getByRole("button", { name: "完了" }));
    await waitFor(() => expect(props.onAddTask).toHaveBeenCalledWith(expect.objectContaining({ title: "理科の暗記", dueDate: addLocalDays(today, 1) })));
  });

  it("adds a task with a focus estimate from the quick presets", async () => {
    const props = renderDrawer();
    fireEvent.change(screen.getByLabelText("新しいタスク"), { target: { value: "理科の暗記" } });
    const estimateButton = screen.getByRole("button", { name: "2回" });
    fireEvent.click(estimateButton);
    expect(estimateButton.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "完了" }));
    await waitFor(() => expect(props.onAddTask).toHaveBeenCalledWith(expect.objectContaining({ title: "理科の暗記", estimatedPomodoros: 2 })));
  });

  it("uses a horizontal slider for five or more planned pomodoros", async () => {
    const props = renderDrawer();
    fireEvent.change(screen.getByLabelText("新しいタスク"), { target: { value: "長めの課題" } });
    fireEvent.click(screen.getByRole("button", { name: "5回以上を設定" }));
    const slider = screen.getByRole("slider", { name: "予定数 5回" });
    fireEvent.change(slider, { target: { value: "8" } });
    expect((slider as HTMLInputElement).value).toBe("8");
    fireEvent.click(screen.getByRole("button", { name: "完了" }));
    await waitFor(() => expect(props.onAddTask).toHaveBeenCalledWith(expect.objectContaining({ estimatedPomodoros: 8 })));
  });

  it("adds the selected priority and project from the bottom toolbar", async () => {
    const props = renderDrawer();
    fireEvent.change(screen.getByLabelText("新しいタスク"), { target: { value: "重要な課題" } });
    fireEvent.click(screen.getByRole("button", { name: "優先度 なし" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "優先度を設定" })).getByRole("button", { name: "高" }));
    fireEvent.click(screen.getByRole("button", { name: "プロジェクトを設定" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "プロジェクトを設定" })).getByRole("button", { name: "勉強" }));
    fireEvent.click(screen.getByRole("button", { name: "完了" }));
    await waitFor(() => expect(props.onAddTask).toHaveBeenCalledWith(expect.objectContaining({ priority: "high", projectId: project.id })));
  });

  it("creates and saves tags from the bottom toolbar", async () => {
    const props = renderDrawer();
    fireEvent.change(screen.getByLabelText("新しいタスク"), { target: { value: "タグ付き課題" } });
    fireEvent.click(screen.getByRole("button", { name: "タグを設定" }));
    const tagDialog = screen.getByRole("dialog", { name: "タグを設定" });
    fireEvent.change(within(tagDialog).getByLabelText("新しいタグ名"), { target: { value: "試験" } });
    fireEvent.click(within(tagDialog).getByRole("button", { name: "タグを追加" }));
    expect(within(tagDialog).getByRole("button", { name: "#試験" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "完了" }));
    await waitFor(() => expect(props.onAddTask).toHaveBeenCalledWith(expect.objectContaining({ tags: ["試験"] })));
  });

  it("shows filters only in Inbox and puts overdue work last in Today", () => {
    const overdueTask = { ...task, id: "task-overdue", title: "期限切れタスク", dueDate: addLocalDays(today, -1), order: 2 };
    renderDrawer({ tasks: [overdueTask, task] });

    expect(screen.queryByRole("group", { name: "表示するタスクを絞り込む" })).toBeNull();
    const sectionHeadings = [...document.querySelectorAll(".task-list__section-header h4")].map((heading) => heading.textContent);
    expect(sectionHeadings.at(-1)).toBe("期限切れ");

    fireEvent.click(screen.getByRole("button", { name: "Inbox 2" }));
    expect(screen.getByRole("group", { name: "表示するタスクを絞り込む" })).toBeTruthy();
  });

  it("opens task details from the task list", () => {
    renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: /数学の復習/, expanded: false }));
    expect(screen.getByRole("form", { name: "数学の復習の詳細" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "タスクの設定" })).toBeTruthy();
  });

  it("returns focus to the task row after closing the details panel", async () => {
    renderDrawer();
    const rowButton = screen.getByRole("button", { name: /数学の復習/ , expanded: false });
    fireEvent.click(rowButton);
    fireEvent.click(screen.getByRole("button", { name: "詳細を閉じる" }));
    await waitFor(() => expect(document.activeElement).toBe(rowButton));
  });

  it("surfaces a reminder in the task row", () => {
    const reminderAt = new Date(`${addLocalDays(today, 1)}T09:30:00`).getTime();
    renderDrawer({
      tasks: [{ ...task, reminderAt }]
    });
    expect(screen.getAllByText(/通知/).length).toBeGreaterThan(0);
  });

  it("completes a task and edits its details through named controls", async () => {
    const props = renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: "数学の復習を完了" }));
    expect(props.onToggleTask).toHaveBeenCalledWith(task.id);

    fireEvent.click(screen.getByRole("button", { name: /数学の復習/ , expanded: false }));
    fireEvent.click(screen.getByRole("button", { name: "数学の復習を詳細から完了" }));
    await waitFor(() => expect(props.onToggleTask).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("form", { name: "数学の復習の詳細" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /数学の復習/ , expanded: false }));
    fireEvent.change(screen.getByLabelText("タスク名"), { target: { value: "数学Iの復習" } });
    fireEvent.change(screen.getByLabelText("見積もり"), { target: { value: "3" } });
    fireEvent.click(screen.getByText("通知と繰り返し"));
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

  it("completes the selected task and immediately starts the next focus candidate", async () => {
    const nextTask: TaskRecord = {
      ...task,
      id: "task-2",
      title: "英語の宿題",
      dueDate: addLocalDays(today, 1),
      estimatedPomodoros: 1,
      order: 1,
      updatedAt: 2
    };
    const props = renderDrawer({ tasks: [task, nextTask] });
    fireEvent.click(screen.getByRole("button", { name: /数学の復習/, expanded: false }));
    fireEvent.click(screen.getByRole("button", { name: "数学の復習を完了して英語の宿題を開始" }));
    await waitFor(() => expect(props.onToggleTask).toHaveBeenCalledWith(task.id));
    expect(props.onStartTask).toHaveBeenCalledWith(nextTask.id);
  });

  it("opens the next focus candidate details from the task editor", async () => {
    const nextTask: TaskRecord = {
      ...task,
      id: "task-2",
      title: "英語の宿題",
      dueDate: addLocalDays(today, 1),
      estimatedPomodoros: 1,
      order: 1,
      updatedAt: 2
    };

    renderDrawer({ tasks: [task, nextTask] });
    fireEvent.click(screen.getByRole("button", { name: /数学の復習/, expanded: false }));
    fireEvent.click(screen.getByRole("button", { name: "英語の宿題の候補を詳細で見る" }));

    await waitFor(() => expect(screen.getByRole("form", { name: "英語の宿題の詳細" })).toBeTruthy());
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

  it("shows every task in the current list when all is selected", () => {
    renderDrawer({
      tasks: [task, { ...task, id: "task-2", title: "国語の予習", note: "教科書を読む", order: 1 }]
    });
    const list = screen.getAllByLabelText("タスク一覧").at(-1);
    expect(list).toBeTruthy();
    expect(within(list as HTMLElement).getByText("数学の復習")).toBeTruthy();
    expect(within(list as HTMLElement).getByText("国語の予習")).toBeTruthy();
    expect(screen.queryByRole("searchbox")).toBeNull();
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

    fireEvent.click(screen.getByRole("button", { name: "Inbox 4" }));
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

  it("opens backup and restore from the header utility action with a count preview of current data", () => {
    renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: "データ管理" }));
    expect(screen.getByRole("heading", { name: "バックアップと復元" })).toBeTruthy();
    expect(screen.getByText("タスク 1")).toBeTruthy();
    expect(screen.getByText("プロジェクト 1")).toBeTruthy();
    expect(screen.getByText("履歴 0")).toBeTruthy();
  });

  it("adds a subtask from the task details", async () => {
    const props = renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: /数学の復習/, expanded: false }));
    fireEvent.click(screen.getByText("サブタスク"));
    const details = within(screen.getByRole("form", { name: "数学の復習の詳細" }));
    fireEvent.change(details.getByLabelText("サブタスク名"), { target: { value: "例題を3問解く" } });
    fireEvent.click(details.getByRole("button", { name: "追加" }));
    await waitFor(() => expect(props.onAddTask).toHaveBeenCalledWith(expect.objectContaining({ title: "例題を3問解く", parentTaskId: task.id, projectId: task.projectId })));
  });

  it("saves a custom repeat interval", async () => {
    const props = renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: /数学の復習/, expanded: false }));
    fireEvent.click(screen.getByText("通知と繰り返し"));
    fireEvent.change(screen.getByLabelText("繰り返し"), { target: { value: "custom" } });
    fireEvent.change(screen.getByLabelText("繰り返し間隔"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("繰り返し単位"), { target: { value: "weekly" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(props.onUpdateTask).toHaveBeenCalledWith(task.id, expect.objectContaining({ repeatRule: expect.objectContaining({ type: "weekly", interval: 2 }) })));
  });

  it("lets the user edit the due date from task details", async () => {
    const props = renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: /数学の復習/, expanded: false }));
    const details = within(screen.getByRole("form", { name: "数学の復習の詳細" }));
    fireEvent.change(details.getByLabelText("期限"), { target: { value: addLocalDays(today, 1) } });
    expect((details.getByLabelText("期限") as HTMLInputElement).value).toBe(addLocalDays(today, 1));
    fireEvent.click(details.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(props.onUpdateTask).toHaveBeenCalledWith(task.id, expect.objectContaining({ dueDate: addLocalDays(today, 1) })));
  });

  it("updates the reminder from task details", async () => {
    const props = renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: /数学の復習/, expanded: false }));
    const details = within(screen.getByRole("form", { name: "数学の復習の詳細" }));
    fireEvent.click(details.getByText("通知と繰り返し"));
    fireEvent.change(details.getByLabelText("リマインダー"), { target: { value: `${addLocalDays(today, 1)}T09:00` } });
    expect((details.getByLabelText("リマインダー") as HTMLInputElement).value).toBe(`${addLocalDays(today, 1)}T09:00`);
    fireEvent.click(details.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(props.onUpdateTask).toHaveBeenCalledWith(task.id, expect.objectContaining({ reminderAt: new Date(`${addLocalDays(today, 1)}T09:00:00`).getTime() })));
  });

  it("updates the estimated focus count from task details", async () => {
    const props = renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: /数学の復習/, expanded: false }));
    const details = within(screen.getByRole("form", { name: "数学の復習の詳細" }));
    fireEvent.change(details.getByLabelText("見積もり"), { target: { value: "4" } });
    expect((details.getByLabelText("見積もり") as HTMLInputElement).value).toBe("4");
    fireEvent.click(details.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(props.onUpdateTask).toHaveBeenCalledWith(task.id, expect.objectContaining({ estimatedPomodoros: 4 })));
  });

  it("syncs detail quick presets into the date, bucket, estimate, and saved patch", async () => {
    const props = renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: /数学の復習/, expanded: false }));
    const details = within(screen.getByRole("form", { name: "数学の復習の詳細" }));

    const inSevenDays = details.getByRole("button", { name: "7日後" });
    fireEvent.click(inSevenDays);
    expect(inSevenDays.getAttribute("aria-pressed")).toBe("true");
    expect((details.getByLabelText("期限") as HTMLInputElement).value).toBe(addLocalDays(today, 7));
    expect((details.getByLabelText("分類") as HTMLSelectElement).value).toBe("inbox");

    const fourPomodoros = details.getByRole("button", { name: "4" });
    fireEvent.click(fourPomodoros);
    expect(fourPomodoros.getAttribute("aria-pressed")).toBe("true");
    expect((details.getByLabelText("見積もり") as HTMLInputElement).value).toBe("4");

    fireEvent.click(details.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(props.onUpdateTask).toHaveBeenCalledWith(task.id, expect.objectContaining({ dueDate: addLocalDays(today, 7), bucket: "inbox", estimatedPomodoros: 4 })));
  });

  it("sets someday from the detail quick preset and clears the date before saving", async () => {
    const props = renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: /数学の復習/, expanded: false }));
    const details = within(screen.getByRole("form", { name: "数学の復習の詳細" }));
    const someday = details.getByRole("button", { name: "いつか" });
    fireEvent.click(someday);
    expect(someday.getAttribute("aria-pressed")).toBe("true");
    expect((details.getByLabelText("期限") as HTMLInputElement).value).toBe("");
    expect((details.getByLabelText("分類") as HTMLSelectElement).value).toBe("someday");
    fireEvent.click(details.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(props.onUpdateTask).toHaveBeenCalledWith(task.id, expect.objectContaining({ dueDate: null, bucket: "someday" })));
  });

  it("saves priority detail changes from the top save action", async () => {
    const props = renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: /数学の復習/, expanded: false }));
    const details = within(screen.getByRole("form", { name: "数学の復習の詳細" }));

    fireEvent.change(details.getByLabelText("期限"), { target: { value: addLocalDays(today, 1) } });
    fireEvent.change(details.getByLabelText("見積もり"), { target: { value: "4" } });
    fireEvent.click(details.getByRole("radio", { name: "高" }));
    fireEvent.click(details.getByText("通知と繰り返し"));
    fireEvent.change(details.getByLabelText("リマインダー"), { target: { value: `${addLocalDays(today, 1)}T09:00` } });
    fireEvent.click(details.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(props.onUpdateTask).toHaveBeenCalledWith(task.id, expect.objectContaining({
      dueDate: addLocalDays(today, 1),
      estimatedPomodoros: 4,
      priority: "high",
      reminderAt: new Date(`${addLocalDays(today, 1)}T09:00:00`).getTime()
    })));
  });

  it("edits tags from task details", async () => {
    const props = renderDrawer({ tasks: [{ ...task, tags: ["復習"] }] });
    fireEvent.click(screen.getByRole("button", { name: /数学の復習/, expanded: false }));
    const details = within(screen.getByRole("form", { name: "数学の復習の詳細" }));
    fireEvent.change(details.getByLabelText("新しいタグ名"), { target: { value: "重要" } });
    fireEvent.click(details.getByRole("button", { name: "タグを追加" }));
    fireEvent.click(details.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(props.onUpdateTask).toHaveBeenCalledWith(task.id, expect.objectContaining({ tags: ["復習", "重要"] })));
  });

  it("exposes a storage failure without hiding the existing timer application", () => {
    renderDrawer({ storageAvailable: false, tasks: [] });
    expect(screen.getByRole("status").textContent).toContain("タスク保存を利用できません");
    expect((screen.getByLabelText("新しいタスク") as HTMLInputElement).disabled).toBe(true);
  });
});
