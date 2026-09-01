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
    onUpdateSession: vi.fn().mockResolvedValue(true),
    onToggleTask: vi.fn().mockResolvedValue(true),
    onArchiveTask: vi.fn().mockResolvedValue(true),
    onDeleteTask: vi.fn().mockResolvedValue(true),
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

function chooseSelect(container: ReturnType<typeof within>, label: string, option: string) {
  fireEvent.click(container.getByLabelText(label));
  fireEvent.click(container.getByRole("option", { name: option }));
}

function openAdvancedSettings(container: ReturnType<typeof within>) {
  fireEvent.click(container.getByText("詳細設定"));
}

describe("TaskDrawer", () => {
  it("keeps settings below an independently scrolling task list", () => {
    renderDrawer({ sessions: [session] });
    expect(screen.getByRole("heading", { name: "今日" })).toBeTruthy();
    expect(screen.getByLabelText("新しいタスク")).toBeTruthy();
    const taskList = screen.getAllByLabelText("タスク一覧").at(-1) as HTMLElement;
    const settingsHeading = screen.getByRole("heading", { name: "設定" });
    const settings = screen.getByRole("region", { name: "設定" });
    const workspace = settings.closest(".task-workspace--list");
    const scrollArea = workspace?.querySelector(".task-workspace__scroll");
    expect(taskList).toBeTruthy();
    expect(settings.contains(settingsHeading)).toBe(true);
    expect(scrollArea?.contains(taskList)).toBe(true);
    expect(scrollArea?.nextElementSibling).toBe(settings);
    expect(screen.getByLabelText("新しいタスク").compareDocumentPosition(taskList) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText("今日の集中ハブ")).toBeNull();
    expect(screen.queryByText("今日の流れ")).toBeNull();
    expect(screen.queryByRole("region", { name: "現在の一覧" })).toBeNull();
  });

  it("shows estimated focus time instead of task counts in navigation", () => {
    renderDrawer();
    expect(screen.getByRole("button", { name: "今日 0h 50m" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "勉強 0h 50m" })).toBeTruthy();
  });

  it("shows a compact focus count and a play action in the task row", () => {
    renderDrawer();
    expect(screen.getByRole("button", { name: /数学の復習/, expanded: false }).textContent).toBe("数学の復習0/2");
    expect(screen.getByLabelText("集中回数 0/2")).toBeTruthy();
    expect(screen.getByRole("button", { name: "数学の復習のタイマーを開始" }).querySelector(".task-row__play-icon")).toBeTruthy();
  });

  it("keeps tasks completed today in a collapsible section and restores them from the checkbox", async () => {
    const completedTask: TaskRecord = {
      ...task,
      status: "completed",
      completedAt: Date.now(),
      updatedAt: Date.now()
    };
    const props = renderDrawer({ tasks: [completedTask] });

    expect(screen.getByText("1件のタスク")).toBeTruthy();
    const completedToggle = screen.getByRole("button", { name: "今日の完了済みタスク 1件" });
    expect(completedToggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("button", { name: "数学の復習を未完了に戻す" })).toBeNull();

    fireEvent.click(completedToggle);

    expect(completedToggle.getAttribute("aria-expanded")).toBe("true");
    const restoreButton = screen.getByRole("button", { name: "数学の復習を未完了に戻す" });
    expect(restoreButton.getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByRole("button", { name: "数学の復習のタイマーを開始" })).toBeNull();
    fireEvent.click(restoreButton);
    await waitFor(() => expect(props.onToggleTask).toHaveBeenCalledWith(completedTask.id));
  });

  it("keeps task capture concise when switching to a project", () => {
    renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: /^勉強 / }));
    expect(screen.getByRole("heading", { name: "勉強" })).toBeTruthy();
    expect(screen.getByLabelText("新しいタスク").getAttribute("placeholder")).toBe("タスクを追加");
  });

  it("adds projects with the shared color picker and saved presets", async () => {
    const props = renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: "新規" }));

    const palette = screen.getByRole("group", { name: "プロジェクトの色を選択" });
    const picker = within(palette).getByRole("region", { name: "プロジェクトの色" });
    expect(within(picker).getByText("プロジェクトの色")).toBeTruthy();
    expect(within(picker).getByRole("button", { name: "推奨テーマ ブルー #0A84FF" })).toBeTruthy();
    expect(within(picker).getByRole("button", { name: "推奨テーマ シアン #00AEEF" })).toBeTruthy();

    const cyan = within(picker).getByRole("button", { name: "推奨テーマ シアン #00AEEF" });
    expect(cyan.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(cyan);
    expect(cyan.getAttribute("aria-pressed")).toBe("true");

    fireEvent.change(screen.getByLabelText("新しいプロジェクト名"), { target: { value: "読書" } });
    fireEvent.click(screen.getByRole("button", { name: "プロジェクトを追加" }));
    await waitFor(() => expect(props.onAddProject).toHaveBeenCalledWith("読書", "#00AEEF"));

    fireEvent.click(screen.getByRole("button", { name: "新規" }));
    expect(within(screen.getByRole("group", { name: "プロジェクトの色を選択" })).getByRole("button", { name: "推奨テーマ ブルー #0A84FF" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("opens the suggested task in the dedicated editor and returns to the list", async () => {
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
    await waitFor(() => expect(screen.getByRole("form", { name: "英語の宿題の詳細" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "タスク一覧へ戻る" }));
    expect(screen.queryByRole("form", { name: "英語の宿題の詳細" })).toBeNull();
    expect(screen.getByRole("button", { name: "英語の宿題のタイマーを開始" })).toBeTruthy();
  });

  it("surfaces the active focus context at the top of the drawer", async () => {
    renderDrawer({ timerStatus: "running", activeTaskId: task.id });
    expect(screen.getByRole("region", { name: "一覧へ戻ったあとの案内" }).textContent).toContain("いまの集中");
    expect(screen.getByRole("region", { name: "一覧へ戻ったあとの案内" }).textContent).toContain("数学の復習に取り組んでいます");
    expect(screen.getByRole("button", { name: "タイマーへ戻る" }).querySelector(".task-row__timer-icon")).toBeTruthy();
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
      expect(screen.queryByRole("button", { name: /^表示先 今日/ })).toBeNull();
      expect(screen.queryByRole("heading", { name: "表示先を選ぶ" })).toBeNull();
      expect(screen.queryByText("リストまたはプロジェクトを選択してください。")).toBeNull();
      expect(screen.queryByText("リストを選択")).toBeNull();
      expect(document.querySelector(".task-drawer__body")?.classList.contains("is-navigation-open")).toBe(true);
      fireEvent.click(screen.getByRole("button", { name: /^明日 / }));

      expect(document.querySelector(".task-drawer__body")?.classList.contains("is-navigation-open")).toBe(false);
      expect(screen.getByRole("heading", { name: "明日" })).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "一覧を開く" }));

      expect(document.querySelector(".task-drawer__body")?.classList.contains("is-navigation-open")).toBe(true);
      expect(screen.queryByRole("heading", { name: "表示先を選ぶ" })).toBeNull();
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

  it("opens the active task in the dedicated editor even after filter narrowing", async () => {
    renderDrawer({ timerStatus: "running", activeTaskId: task.id });
    fireEvent.click(screen.getByRole("button", { name: /^Inbox / }));
    fireEvent.click(screen.getByRole("button", { name: "期限切れ 0" }));

    fireEvent.click(screen.getByRole("button", { name: "すべて 1" }));
    fireEvent.click(screen.getByRole("button", { name: /数学の復習/, expanded: false }));

    await waitFor(() => expect(screen.getByRole("form", { name: "数学の復習の詳細" })).toBeTruthy());
    expect(screen.queryByRole("group", { name: "表示するタスクを絞り込む" })).toBeNull();
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

    fireEvent.click(screen.getByRole("button", { name: /^Inbox / }));
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

  it("keeps overdue task cards compact while retaining their details", () => {
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

    expect(screen.getByRole("button", { name: /英語の宿題/, expanded: false }).textContent).toBe("英語の宿題0/2");
    fireEvent.click(screen.getByRole("button", { name: /英語の宿題/, expanded: false }));
    expect(screen.getByRole("form", { name: "英語の宿題の詳細" })).toBeTruthy();
  });

  it("adds a task to today's list with a single title", async () => {
    const props = renderDrawer();
    const titleInput = screen.getByLabelText("新しいタスク");
    const addButton = screen.getByRole("button", { name: "タスクを追加" });
    expect(titleInput.previousElementSibling).toBe(addButton);
    expect(addButton.querySelector("svg")).toBeTruthy();
    fireEvent.change(titleInput, { target: { value: "英単語を覚える" } });
    fireEvent.click(addButton);
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
    fireEvent.click(screen.getByRole("button", { name: /^完了済み / }));

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
        onUpdateSession={vi.fn().mockResolvedValue(true)}
        onToggleTask={vi.fn().mockResolvedValue(true)}
        onArchiveTask={vi.fn().mockResolvedValue(true)}
        onDeleteTask={vi.fn().mockResolvedValue(true)}
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
    fireEvent.click(screen.getByRole("button", { name: "タスクを追加" }));
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
        onUpdateSession={vi.fn().mockResolvedValue(true)}
        onToggleTask={vi.fn().mockResolvedValue(true)}
        onArchiveTask={vi.fn().mockResolvedValue(true)}
        onDeleteTask={vi.fn().mockResolvedValue(true)}
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
    fireEvent.click(screen.getByRole("button", { name: "タスクを追加" }));
    await waitFor(() => expect(props.onAddTask).toHaveBeenCalledWith(expect.objectContaining({ title: "理科の暗記", dueDate: addLocalDays(today, 1) })));
  });

  it("adds a task with a planned pomodoro count", async () => {
    const props = renderDrawer();
    fireEvent.change(screen.getByLabelText("新しいタスク"), { target: { value: "理科の暗記" } });
    fireEvent.click(screen.getByRole("button", { name: "2回" }));
    fireEvent.click(screen.getByRole("button", { name: "タスクを追加" }));
    await waitFor(() => expect(props.onAddTask).toHaveBeenCalledWith(expect.objectContaining({ title: "理科の暗記", estimatedPomodoros: 2 })));
  });

  it("adjusts the planned pomodoro count down to one or by number input", () => {
    renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: "5回以上を設定" }));
    expect(screen.queryByRole("button", { name: "2回" })).toBeNull();
    const slider = screen.getByRole("slider", { name: "予定ポモドーロのスライダー" });
    fireEvent.change(slider, { target: { value: "1" } });
    expect((slider as HTMLInputElement).value).toBe("1");
    const numberInput = screen.getByRole("spinbutton", { name: "予定ポモドーロの回数" });
    fireEvent.change(numberInput, { target: { value: "12" } });
    expect((numberInput as HTMLInputElement).value).toBe("12");
    fireEvent.click(screen.getByRole("button", { name: "予定ポモドーロのプリセットへ戻る" }));
    expect(screen.getByRole("button", { name: "2回" })).toBeTruthy();
  });

  it("adds the selected priority and project from the bottom toolbar", async () => {
    const props = renderDrawer();
    fireEvent.change(screen.getByLabelText("新しいタスク"), { target: { value: "重要な課題" } });
    fireEvent.click(screen.getByRole("button", { name: "優先度 なし" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "優先度を設定" })).getByRole("button", { name: "高" }));
    fireEvent.click(screen.getByRole("button", { name: "プロジェクトを設定" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "プロジェクトを設定" })).getByRole("button", { name: "勉強" }));
    fireEvent.click(screen.getByRole("button", { name: "タスクを追加" }));
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
    fireEvent.click(screen.getByRole("button", { name: "タスクを追加" }));
    await waitFor(() => expect(props.onAddTask).toHaveBeenCalledWith(expect.objectContaining({ tags: ["試験"] })));
  });

  it("shows filters only in Inbox and puts overdue work last in Today", () => {
    const overdueTask = { ...task, id: "task-overdue", title: "期限切れタスク", dueDate: addLocalDays(today, -1), order: 2 };
    renderDrawer({ tasks: [overdueTask, task] });

    expect(screen.queryByRole("group", { name: "表示するタスクを絞り込む" })).toBeNull();
    const sectionHeadings = [...document.querySelectorAll(".task-list__section-header h4")].map((heading) => heading.textContent);
    expect(sectionHeadings.at(-1)).toBe("期限切れ");

    fireEvent.click(screen.getByRole("button", { name: /^Inbox / }));
    expect(screen.getByRole("group", { name: "表示するタスクを絞り込む" })).toBeTruthy();
  });

  it("opens task details from the task list", () => {
    renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: /数学の復習/, expanded: false }));
    expect(screen.getByRole("form", { name: "数学の復習の詳細" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "タスク詳細" })).toBeTruthy();
  });

  it("shows only the essential task settings until details are requested", () => {
    renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: /数学の復習/, expanded: false }));
    const details = within(screen.getByRole("form", { name: "数学の復習の詳細" }));

    expect(details.getByLabelText("タスク名")).toBeTruthy();
    expect(details.getByRole("group", { name: "タスクの期限をすばやく設定" })).toBeTruthy();
    expect(details.getByRole("group", { name: "集中回数をすばやく設定" })).toBeTruthy();
    expect(details.getByLabelText("プロジェクト")).toBeTruthy();
    expect(details.getByRole("button", { name: "数学の復習を詳細から開始" })).toBeTruthy();
    expect((details.getByText("詳細設定").closest("details") as HTMLDetailsElement).open).toBe(false);
  });

  it("keeps archive compact and offers permanent deletion in task details", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const props = renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: /数学の復習/, expanded: false }));
    const details = within(screen.getByRole("form", { name: "数学の復習の詳細" }));
    openAdvancedSettings(details);

    const archiveButton = details.getByRole("button", { name: "アーカイブ" });
    expect(archiveButton.className).toContain("task-editor__archive-button");
    fireEvent.click(details.getByRole("button", { name: "削除" }));
    await waitFor(() => expect(props.onDeleteTask).toHaveBeenCalledWith(task.id));
    expect(confirm).toHaveBeenCalledWith("数学の復習を完全に削除しますか？この操作は元に戻せません。");
    confirm.mockRestore();
  });

  it("saves edited task settings before starting the timer", async () => {
    const props = renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: /数学の復習/, expanded: false }));
    fireEvent.change(screen.getByLabelText("タスク名"), { target: { value: "数学Iの復習" } });
    fireEvent.click(screen.getByRole("button", { name: "数学の復習を詳細から開始" }));

    await waitFor(() => expect(props.onUpdateTask).toHaveBeenCalledWith(task.id, expect.objectContaining({ title: "数学Iの復習" })));
    expect(props.onStartTask).toHaveBeenCalledWith(task.id);
    expect(vi.mocked(props.onUpdateTask).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(props.onStartTask).mock.invocationCallOrder[0]);
  });

  it("asks before leaving task details with unsaved changes", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: /数学の復習/, expanded: false }));
    fireEvent.change(screen.getByLabelText("タスク名"), { target: { value: "変更中" } });

    fireEvent.click(screen.getByRole("button", { name: "タスク一覧へ戻る" }));
    expect(screen.getByRole("form", { name: "数学の復習の詳細" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "タスク一覧へ戻る" }));
    expect(screen.queryByRole("form", { name: "数学の復習の詳細" })).toBeNull();
    expect(confirm).toHaveBeenCalledTimes(2);
    confirm.mockRestore();
  });

  it("returns focus to the task row after returning from the dedicated editor", async () => {
    renderDrawer();
    const rowButton = screen.getByRole("button", { name: /数学の復習/, expanded: false });
    fireEvent.click(rowButton);
    fireEvent.click(screen.getByRole("button", { name: "タスク一覧へ戻る" }));
    await waitFor(() => expect((document.activeElement as HTMLElement).className).toBe("task-row__content"));
    expect(document.activeElement?.textContent).toContain("数学の復習");
  });

  it("keeps reminders out of the compact row and available in task details", () => {
    const reminderAt = new Date(`${addLocalDays(today, 1)}T09:30:00`).getTime();
    renderDrawer({
      tasks: [{ ...task, reminderAt }]
    });
    const taskButton = screen.getByRole("button", { name: /数学の復習/, expanded: false });
    expect(taskButton.textContent).not.toContain("通知");
    fireEvent.click(taskButton);
    openAdvancedSettings(within(screen.getByRole("form", { name: "数学の復習の詳細" })));
    expect(screen.getByText("通知と繰り返し")).toBeTruthy();
  });

  it("completes a task and edits its details through named controls", async () => {
    const props = renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: "数学の復習を完了" }));
    expect(props.onToggleTask).toHaveBeenCalledWith(task.id);

    fireEvent.click(screen.getByRole("button", { name: /数学の復習/, expanded: false }));
    openAdvancedSettings(within(screen.getByRole("form", { name: "数学の復習の詳細" })));
    fireEvent.click(screen.getByRole("button", { name: "数学の復習を詳細から完了" }));
    await waitFor(() => expect(props.onToggleTask).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("form", { name: "数学の復習の詳細" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /数学の復習/, expanded: false }));
    openAdvancedSettings(within(screen.getByRole("form", { name: "数学の復習の詳細" })));
    fireEvent.change(screen.getByLabelText("タスク名"), { target: { value: "数学Iの復習" } });
    fireEvent.change(screen.getByLabelText("見積もり"), { target: { value: "3" } });
    fireEvent.click(screen.getByText("通知と繰り返し"));
    chooseSelect(within(screen.getByRole("form", { name: "数学の復習の詳細" })), "繰り返し", "毎日");
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(props.onUpdateTask).toHaveBeenCalledWith(task.id, expect.objectContaining({ title: "数学Iの復習", estimatedPomodoros: 3, repeatRule: { type: "daily", interval: 1 } })));
  });

  it("uses shared controls for task scheduling fields without changing saved values", async () => {
    const props = renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: /数学の復習/, expanded: false }));

    const form = screen.getByRole("form", { name: "数学の復習の詳細" });
    const details = within(form);
    openAdvancedSettings(details);
    expect(form.querySelectorAll("select, input[type='date'], input[type='datetime-local']")).toHaveLength(0);
    chooseSelect(details, "プロジェクト", "なし");
    chooseSelect(details, "分類", "いつか");
    fireEvent.click(details.getByLabelText("期限"));
    fireEvent.click(within(details.getByRole("dialog", { name: "期限を選択" })).getByRole("button", { name: "7日後" }));
    fireEvent.click(screen.getByText("通知と繰り返し"));
    fireEvent.click(details.getByLabelText("リマインダー"));
    fireEvent.click(within(details.getByRole("dialog", { name: "リマインダーの日付を選択" })).getByRole("button", { name: "今日" }));
    fireEvent.change(details.getByLabelText("時"), { target: { value: "09" } });
    fireEvent.change(details.getByLabelText("分"), { target: { value: "30" } });
    chooseSelect(details, "繰り返し", "カスタム");
    fireEvent.change(screen.getByLabelText("繰り返し間隔"), { target: { value: "2" } });
    chooseSelect(details, "繰り返し単位", "週ごと");
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(props.onUpdateTask).toHaveBeenCalledWith(task.id, expect.objectContaining({
      projectId: null,
      bucket: "someday",
      dueDate: addLocalDays(today, 7),
      reminderAt: new Date(`${today}T09:30`).getTime(),
      repeatRule: { type: "weekly", interval: 2, weekdays: [new Date(`${addLocalDays(today, 7)}T00:00`).getDay()] }
    })));
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
    openAdvancedSettings(within(screen.getByRole("form", { name: "数学の復習の詳細" })));
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
    openAdvancedSettings(within(screen.getByRole("form", { name: "数学の復習の詳細" })));
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

    fireEvent.click(screen.getByRole("button", { name: /^Inbox / }));
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
    openAdvancedSettings(within(screen.getByRole("form", { name: "数学の復習の詳細" })));
    fireEvent.click(screen.getByText("サブタスク"));
    const details = within(screen.getByRole("form", { name: "数学の復習の詳細" }));
    fireEvent.change(details.getByLabelText("サブタスク名"), { target: { value: "例題を3問解く" } });
    fireEvent.click(details.getByRole("button", { name: "追加" }));
    await waitFor(() => expect(props.onAddTask).toHaveBeenCalledWith(expect.objectContaining({ title: "例題を3問解く", parentTaskId: task.id, projectId: task.projectId })));
  });

  it("saves a custom repeat interval", async () => {
    const props = renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: /数学の復習/, expanded: false }));
    openAdvancedSettings(within(screen.getByRole("form", { name: "数学の復習の詳細" })));
    fireEvent.click(screen.getByText("通知と繰り返し"));
    const details = within(screen.getByRole("form", { name: "数学の復習の詳細" }));
    chooseSelect(details, "繰り返し", "カスタム");
    fireEvent.change(details.getByLabelText("繰り返し間隔"), { target: { value: "2" } });
    chooseSelect(details, "繰り返し単位", "週ごと");
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(props.onUpdateTask).toHaveBeenCalledWith(task.id, expect.objectContaining({ repeatRule: expect.objectContaining({ type: "weekly", interval: 2 }) })));
  });

  it("lets the user edit the due date from task details", async () => {
    const props = renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: /数学の復習/, expanded: false }));
    const details = within(screen.getByRole("form", { name: "数学の復習の詳細" }));
    openAdvancedSettings(details);
    fireEvent.click(details.getByLabelText("期限"));
    fireEvent.click(within(details.getByRole("dialog", { name: "期限を選択" })).getByRole("button", { name: "明日" }));
    fireEvent.click(details.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(props.onUpdateTask).toHaveBeenCalledWith(task.id, expect.objectContaining({ dueDate: addLocalDays(today, 1) })));
  });

  it("updates the reminder from task details", async () => {
    const props = renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: /数学の復習/, expanded: false }));
    const details = within(screen.getByRole("form", { name: "数学の復習の詳細" }));
    openAdvancedSettings(details);
    fireEvent.click(details.getByText("通知と繰り返し"));
    fireEvent.click(details.getByLabelText("リマインダー"));
    fireEvent.click(within(details.getByRole("dialog", { name: "リマインダーの日付を選択" })).getByRole("button", { name: "明日" }));
    fireEvent.click(details.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(props.onUpdateTask).toHaveBeenCalledWith(task.id, expect.objectContaining({ reminderAt: new Date(`${addLocalDays(today, 1)}T09:00:00`).getTime() })));
  });

  it("updates the estimated focus count from task details", async () => {
    const props = renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: /数学の復習/, expanded: false }));
    const details = within(screen.getByRole("form", { name: "数学の復習の詳細" }));
    openAdvancedSettings(details);
    fireEvent.change(details.getByLabelText("見積もり"), { target: { value: "4" } });
    expect((details.getByLabelText("見積もり") as HTMLInputElement).value).toBe("4");
    fireEvent.click(details.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(props.onUpdateTask).toHaveBeenCalledWith(task.id, expect.objectContaining({ estimatedPomodoros: 4 })));
  });

  it("syncs detail quick presets into the date, bucket, estimate, and saved patch", async () => {
    const props = renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: /数学の復習/, expanded: false }));
    const details = within(screen.getByRole("form", { name: "数学の復習の詳細" }));
    openAdvancedSettings(details);

    const inSevenDays = details.getByRole("button", { name: "7日後" });
    fireEvent.click(inSevenDays);
    expect(inSevenDays.getAttribute("aria-pressed")).toBe("true");
    const expectedMonth = Number(addLocalDays(today, 7).slice(5, 7));
    expect(details.getByLabelText("期限").textContent).toContain(`${expectedMonth}月`);
    expect(details.getByLabelText("分類").textContent).toContain("Inbox");

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
    openAdvancedSettings(details);
    const someday = details.getByRole("button", { name: "いつか" });
    fireEvent.click(someday);
    expect(someday.getAttribute("aria-pressed")).toBe("true");
    expect(details.getByLabelText("期限").textContent).toContain("日付を選択");
    expect(details.getByLabelText("分類").textContent).toContain("いつか");
    fireEvent.click(details.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(props.onUpdateTask).toHaveBeenCalledWith(task.id, expect.objectContaining({ dueDate: null, bucket: "someday" })));
  });

  it("saves priority detail changes from the top save action", async () => {
    const props = renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: /数学の復習/, expanded: false }));
    const details = within(screen.getByRole("form", { name: "数学の復習の詳細" }));
    openAdvancedSettings(details);

    fireEvent.click(details.getByLabelText("期限"));
    fireEvent.click(within(details.getByRole("dialog", { name: "期限を選択" })).getByRole("button", { name: "明日" }));
    fireEvent.change(details.getByLabelText("見積もり"), { target: { value: "4" } });
    fireEvent.click(details.getByRole("radio", { name: "高" }));
    fireEvent.click(details.getByText("通知と繰り返し"));
    fireEvent.click(details.getByLabelText("リマインダー"));
    fireEvent.click(within(details.getByRole("dialog", { name: "リマインダーの日付を選択" })).getByRole("button", { name: "明日" }));
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
    openAdvancedSettings(details);
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
