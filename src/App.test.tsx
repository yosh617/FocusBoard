import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { defaultSettings } from "./types/settings";
import type { FocusSessionRecord } from "./types/focusSession";
import type { ProjectRecord } from "./types/project";
import type { TaskRecord } from "./types/task";
import { SETTINGS_KEY } from "./utils/storage";
import { toLocalDateKey } from "./utils/taskQueries";

const mockTasksState = vi.hoisted(() => ({
  tasks: [] as TaskRecord[],
  projects: [] as ProjectRecord[],
  sessions: [] as FocusSessionRecord[],
  loading: false,
  storageAvailable: true,
  taskMessage: "",
  setTaskMessage: vi.fn(),
  canUndo: false,
  addTask: vi.fn(),
  updateTask: vi.fn(),
  toggleTask: vi.fn(),
  archiveTask: vi.fn(),
  deleteTask: vi.fn(),
  moveTask: vi.fn(),
  addProject: vi.fn(),
  archiveProject: vi.fn(),
  undo: vi.fn(),
  recordTimerSession: vi.fn(),
  importProductivityBackup: vi.fn()
}));

vi.mock("./hooks/useTasks", () => ({
  useTasks: () => mockTasksState
}));

vi.mock("./hooks/useTaskReminders", () => ({
  useTaskReminders: () => ({
    reminderMessage: "",
    setReminderMessage: vi.fn(),
    notificationPermission: "unsupported",
    requestNotificationPermission: vi.fn().mockResolvedValue(false)
  })
}));

describe("App", () => {
  beforeEach(() => {
    localStorage.clear();
    mockTasksState.tasks = [];
    mockTasksState.projects = [];
    mockTasksState.sessions = [];
    mockTasksState.loading = false;
    mockTasksState.storageAvailable = true;
    mockTasksState.taskMessage = "";
    mockTasksState.canUndo = false;
    mockTasksState.setTaskMessage.mockReset();
    mockTasksState.addTask.mockReset().mockResolvedValue("task-new");
    mockTasksState.updateTask.mockReset().mockResolvedValue(true);
    mockTasksState.toggleTask.mockReset().mockResolvedValue(true);
    mockTasksState.archiveTask.mockReset().mockResolvedValue(true);
    mockTasksState.deleteTask.mockReset().mockResolvedValue(true);
    mockTasksState.moveTask.mockReset().mockResolvedValue(true);
    mockTasksState.addProject.mockReset().mockResolvedValue(true);
    mockTasksState.archiveProject.mockReset().mockResolvedValue(true);
    mockTasksState.undo.mockReset().mockResolvedValue(true);
    mockTasksState.recordTimerSession.mockReset();
    mockTasksState.importProductivityBackup.mockReset().mockResolvedValue(true);
  });

  const revealSettings = () => fireEvent.pointerUp(document.querySelector<HTMLElement>(".background")!);
  const openSettings = () => {
    fireEvent.click(screen.getByRole("button", { name: "タスク" }));
    fireEvent.click(screen.getByRole("button", { name: "設定を開く" }));
  };
  const startWithoutTask = () => {
    fireEvent.click(screen.getByRole("button", { name: "開始" }));
    fireEvent.click(screen.getByRole("button", { name: "タスクなしで開始" }));
  };
  const today = toLocalDateKey(new Date("2026-07-29T09:00:00+09:00"));
  const focusTask: TaskRecord = {
    version: 1,
    id: "task-1",
    title: "数学の復習",
    status: "open",
    bucket: "inbox",
    projectId: "project-1",
    parentTaskId: null,
    note: "",
    dueDate: today,
    reminderAt: null,
    repeatRule: null,
    repeatSeriesId: null,
    estimatedPomodoros: 1,
    order: 0,
    createdAt: 1,
    updatedAt: 1,
    completedAt: null
  };
  const focusProject: ProjectRecord = {
    version: 1,
    id: "project-1",
    name: "勉強",
    color: "#3f6fab",
    order: 0,
    archivedAt: null,
    createdAt: 1,
    updatedAt: 1
  };
  const nextFocusTask: TaskRecord = {
    ...focusTask,
    id: "task-2",
    title: "英語の宿題",
    dueDate: today,
    estimatedPomodoros: 2,
    order: 1,
    updatedAt: 2
  };

  const prepareTaskFlow = (tasks: TaskRecord[] = [focusTask]) => {
    mockTasksState.tasks = tasks;
    mockTasksState.projects = [focusProject];
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: `タスクを開く。次のおすすめは数学の復習。今日の未完了は${tasks.length}件` }));
    fireEvent.click(screen.getByRole("button", { name: "数学の復習を詳細から開始" }));
  };

  it("keeps only tasks in the home dock and never renders a direct settings button", () => {
    render(<App />);
    const homeDock = screen.getByRole("navigation", { name: "ホーム操作" });
    expect(within(homeDock).getByRole("button", { name: "タスク" })).toBeTruthy();
    expect(within(homeDock).queryByRole("button", { name: "設定" })).toBeNull();
    expect(document.querySelector(".settings-button")).toBeNull();
  });

  it("does not reveal the detailed task card when an interactive home dock control is clicked", () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...defaultSettings, taskLauncherVisibility: "background-tap" }));
    render(<App />);

    openSettings();

    expect(document.querySelector(".task-launcher")).toBeNull();
  });

  it("reveals only the detailed task card after a background tap", () => {
    vi.useFakeTimers();
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...defaultSettings, taskLauncherVisibility: "background-tap" }));
      render(<App />);
      revealSettings();
      const launcher = screen.getByRole("button", { name: /タスクを開く/ });

      act(() => { vi.advanceTimersByTime(2_500); });
      expect(launcher.classList.contains("task-launcher--fading")).toBe(true);

      act(() => { vi.advanceTimersByTime(280); });
      expect(document.querySelector(".task-launcher")).toBeNull();
      expect(document.querySelector(".settings-button")).toBeNull();

      revealSettings();
      expect(screen.getByRole("button", { name: /タスクを開く/ })).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the task dock available while the detailed task card fades in background-tap mode", () => {
    vi.useFakeTimers();
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...defaultSettings, taskLauncherVisibility: "background-tap" }));
      render(<App />);
      expect(screen.queryByRole("button", { name: /タスクを開く/ })).toBeNull();

      revealSettings();
      const launcher = screen.getByRole("button", { name: /タスクを開く/ });
      expect(document.querySelector(".settings-button")).toBeNull();

      act(() => { vi.advanceTimersByTime(2_500); });
      expect(launcher.classList.contains("task-launcher--fading")).toBe(true);
      act(() => { vi.advanceTimersByTime(280); });
      expect(screen.queryByRole("button", { name: /タスクを開く/ })).toBeNull();
      expect(screen.getByRole("button", { name: "タスク" })).toBeTruthy();

      revealSettings();
      expect(screen.getByRole("button", { name: /タスクを開く/ })).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses the task workspace as the settings entry point and switches between panels", () => {
    render(<App />);
    const homeDock = screen.getByRole("navigation", { name: "ホーム操作" });
    expect(within(homeDock).getByRole("button", { name: "タスク" }).textContent).toContain("タスク");
    expect(within(homeDock).queryByRole("button", { name: "設定" })).toBeNull();

    fireEvent.click(within(homeDock).getByRole("button", { name: "タスク" }));
    expect(screen.getByRole("dialog", { name: "タスク管理" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "設定を開く" }));
    expect(screen.queryByRole("dialog", { name: "タスク管理" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "設定" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "タスクを開く" }));
    expect(screen.queryByRole("dialog", { name: "設定" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "タスク管理" })).toBeTruthy();
  });

  it("returns focus to the trigger that remains available after closing or switching panels", async () => {
    render(<App />);
    const homeDock = screen.getByRole("navigation", { name: "ホーム操作" });
    const homeTasks = within(homeDock).getByRole("button", { name: "タスク" });

    fireEvent.click(homeTasks);
    fireEvent.click(screen.getByRole("button", { name: "タスクを閉じる" }));
    await waitFor(() => expect(document.activeElement).toBe(homeTasks));

    const launcher = screen.getByRole("button", { name: /タスクを開く/ });
    fireEvent.click(launcher);
    fireEvent.click(screen.getByRole("button", { name: "タスクを閉じる" }));
    await waitFor(() => expect(document.activeElement).toBe(launcher));

    fireEvent.click(homeTasks);
    fireEvent.click(screen.getByRole("button", { name: "設定を開く" }));
    fireEvent.click(screen.getByRole("button", { name: "設定を閉じる" }));
    await waitFor(() => expect(document.activeElement).toBe(homeTasks));

    fireEvent.click(homeTasks);
    fireEvent.click(screen.getByRole("button", { name: "設定を開く" }));
    fireEvent.click(screen.getByRole("button", { name: "設定を閉じる" }));
    await waitFor(() => expect(document.activeElement).toBe(homeTasks));

    fireEvent.click(homeTasks);
    fireEvent.click(screen.getByRole("button", { name: "設定を開く" }));
    fireEvent.click(screen.getByRole("button", { name: "タスクを開く" }));
    fireEvent.click(screen.getByRole("button", { name: "タスクを閉じる" }));
    await waitFor(() => expect(document.activeElement).toBe(homeTasks));
  });

  it("saves the selected task launcher visibility from display settings", () => {
    const view = render(<App />);
    openSettings();
    fireEvent.click(screen.getByRole("tab", { name: "表示" }));
    fireEvent.click(screen.getByText("タスク画面"));
    const taskCardVisibility = screen.getByRole("radiogroup", { name: "メイン画面のタスクカード" });
    expect(taskCardVisibility.getAttribute("aria-describedby")).toBe("task-card-visibility-description");
    fireEvent.click(screen.getByRole("radio", { name: "背景タップ時のみ" }));

    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}").taskLauncherVisibility).toBe("background-tap");
    expect(screen.getByRole("radio", { name: "背景タップ時のみ" }).getAttribute("aria-checked")).toBe("true");
    expect(document.querySelector(".task-launcher")).toBeNull();

    view.unmount();
    render(<App />);
    expect(document.querySelector(".task-launcher")).toBeNull();
  });

  it("applies, persists, and resets the task workspace theme from display settings", () => {
    render(<App />);
    openSettings();
    fireEvent.click(screen.getByRole("tab", { name: "表示" }));
    fireEvent.click(screen.getByText("タスク画面"));
    const taskThemes = screen.getByRole("radiogroup", { name: "テーマ" });
    const violet = within(taskThemes).getByRole("radio", { name: /バイオレット/ });
    expect(violet.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(violet);
    expect(violet.getAttribute("aria-checked")).toBe("true");
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}").taskTheme).toBe("violet");
    expect(document.querySelector<HTMLElement>(".app-shell")?.style.getPropertyValue("--task-primary")).toBe("#c9b8f4");
    fireEvent.click(screen.getByRole("button", { name: "初期値に戻す" }));
    expect(document.querySelector<HTMLElement>(".app-shell")?.style.getPropertyValue("--task-primary")).toBe("#f4a6a8");
  });

  it("starts in setup mode, collapses to a floating timer, and opens settings", () => {
    render(<App />);
    expect(screen.getByLabelText("タイマー設定")).toBeTruthy();
    expect(document.querySelector(".dashboard")?.classList.contains("dashboard--timer-setup")).toBe(true);
    startWithoutTask();
    expect(screen.getByLabelText("集中タイマー")).toBeTruthy();
    expect(screen.queryByLabelText("タイマー設定")).toBeNull();
    expect(document.querySelector(".dashboard")?.classList.contains("dashboard--timer-setup")).toBe(false);
    openSettings();
    expect(screen.getByRole("dialog", { name: "設定" })).toBeTruthy();
  });

  it("selects a task from the timer setup and starts a linked focus session", () => {
    mockTasksState.tasks = [focusTask];
    mockTasksState.projects = [focusProject];
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /タスクを選ぶ・追加する/ }));
    expect(screen.getByRole("dialog", { name: "取り組むタスクを選ぶ" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "数学の復習を選択" }));
    fireEvent.click(screen.getByRole("button", { name: "数学の復習を開始" }));

    expect(screen.queryByRole("dialog", { name: "取り組むタスクを選ぶ" })).toBeNull();
    const linkedTimer = screen.getByLabelText("数学の復習の集中タイマー");
    expect(linkedTimer.textContent).not.toContain("数学の復習");
    expect(linkedTimer.textContent).toContain("SESSION 1/1");
  });

  it("asks for a task when starting and can start the selected task directly", () => {
    mockTasksState.tasks = [focusTask];
    mockTasksState.projects = [focusProject];
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "開始" }));
    expect(screen.getByRole("dialog", { name: "どのタスクを始めますか？" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "数学の復習を開始" }));

    expect(screen.queryByRole("dialog", { name: "どのタスクを始めますか？" })).toBeNull();
    expect(screen.getByLabelText("数学の復習の集中タイマー").textContent).toContain("SESSION 1/1");
  });

  it("shows the current task session beyond its planned count", () => {
    mockTasksState.sessions = [1, 2].map((index) => ({
      version: 1,
      id: `session-${index}`,
      taskId: focusTask.id,
      taskTitleSnapshot: focusTask.title,
      projectIdSnapshot: focusProject.id,
      projectNameSnapshot: focusProject.name,
      program: "pomodoro",
      mode: "work",
      result: "completed",
      startedAt: index,
      endedAt: index + 1,
      plannedDurationMs: 25 * 60_000,
      focusedDurationMs: 25 * 60_000
    }));

    prepareTaskFlow();

    expect(screen.getByLabelText("数学の復習の集中タイマー").textContent).toContain("SESSION 3/1");
  });

  it("adds a new task from the start dialog and begins it immediately", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "開始" }));
    fireEvent.change(screen.getByRole("textbox", { name: "新しいタスク" }), { target: { value: "理科のレポート" } });
    fireEvent.click(screen.getByRole("button", { name: "追加して開始" }));

    await waitFor(() => expect(mockTasksState.addTask).toHaveBeenCalledWith({ title: "理科のレポート", dueDate: toLocalDateKey(new Date()) }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "どのタスクを始めますか？" })).toBeNull());
    expect(screen.getByLabelText("集中タイマー")).toBeTruthy();
  });

  it("gives settings ranges a progress value without affecting the background editor range", () => {
    render(<App />);
    openSettings();

    const overlayRange = document.querySelector<HTMLInputElement>("#overlay")!;
    expect(overlayRange.classList.contains("settings-range")).toBe(true);
    expect(overlayRange.style.getPropertyValue("--range-progress")).not.toBe("");

    fireEvent.change(overlayRange, { target: { value: "50" } });
    expect(overlayRange.getAttribute("aria-valuenow")).toBe("50");
    expect(overlayRange.style.getPropertyValue("--range-progress")).toBe("71.42857142857143%");
    expect(document.querySelector("#background-editor-scale.settings-range")).toBeNull();
  });

  it("closes settings on browser back", () => {
    render(<App />);
    openSettings();
    expect(screen.getByRole("dialog", { name: "設定" })).toBeTruthy();

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(screen.queryByRole("dialog", { name: "設定" })).toBeNull();
  });

  it("uses familiar icons alongside labels for every settings category", () => {
    render(<App />);
    openSettings();

    ["背景", "表示", "タイマー", "データ"].forEach((name) => {
      expect(screen.getByRole("tab", { name }).querySelector("svg")).toBeTruthy();
    });
  });

  it("collapses the idle timer into the same circular timer UI and returns to setup", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "タイマー設定をしまう" }));
    expect(screen.queryByLabelText("タイマー設定")).toBeNull();
    expect(screen.getByLabelText("集中タイマー")).toBeTruthy();
    expect(screen.getByRole("button", { name: "開始" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "タイマーセット" }));
    expect(screen.getByLabelText("タイマー設定")).toBeTruthy();
  });

  it("returns to setup without stopping an active timer", () => {
    render(<App />);
    startWithoutTask();
    fireEvent.click(screen.getByRole("button", { name: "タイマーセット（タイマーは継続）" }));

    expect(screen.getByLabelText("進行中タイマーの設定")).toBeTruthy();
    expect(document.querySelector(".timer-setup__live-note")?.textContent).toBe("進行中");
    expect(screen.queryByLabelText("集中タイマー")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "タイマー表示へ戻る" }));
    expect(screen.getByLabelText("集中タイマー")).toBeTruthy();
  });

  it("opens the session complete dialog and lets the user start the break flow", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-29T09:00:00+09:00"));
    try {
      prepareTaskFlow();
      await act(async () => { await vi.advanceTimersByTimeAsync(25 * 60_000 + 250); });

      expect(screen.getByRole("dialog", { name: "集中セッション完了" })).toBeTruthy();
      expect(mockTasksState.recordTimerSession).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByRole("button", { name: "休憩を開始" }));
      expect(screen.queryByRole("dialog", { name: "集中セッション完了" })).toBeNull();
      expect(screen.getByText("休憩中")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("surfaces the post-break candidate from the launcher while resting", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-29T09:00:00+09:00"));
    try {
      prepareTaskFlow([focusTask, nextFocusTask]);
      await act(async () => { await vi.advanceTimersByTimeAsync(25 * 60_000 + 250); });

      fireEvent.click(screen.getByRole("button", { name: "休憩を開始" }));
      const launcher = screen.getByRole("button", { name: "タスクを開く。短い休憩中。次のおすすめは英語の宿題。今日の未完了は2件" });
      expect(launcher.textContent).toContain("短い休憩");
      expect(launcher.textContent).toContain("次は 英語の宿題");
      fireEvent.click(launcher);
      expect(screen.getByRole("form", { name: "英語の宿題の詳細" })).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "タスク一覧へ戻る" }));
      expect(screen.getByRole("region", { name: "一覧へ戻ったあとの案内" }).textContent).toContain("休憩後");
    } finally {
      vi.useRealTimers();
    }
  });

  it("completes the task from the session complete dialog", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-29T09:00:00+09:00"));
    try {
      prepareTaskFlow();
      await act(async () => { await vi.advanceTimersByTimeAsync(25 * 60_000 + 250); });

      fireEvent.click(screen.getByText("ほかの操作"));
      fireEvent.click(screen.getByRole("button", { name: "タスクを完了" }));
      expect(mockTasksState.toggleTask).toHaveBeenCalledWith("task-1");
      expect(screen.queryByRole("dialog", { name: "集中セッション完了" })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("continues the same task from the session complete dialog", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-29T09:00:00+09:00"));
    try {
      prepareTaskFlow();
      await act(async () => { await vi.advanceTimersByTimeAsync(25 * 60_000 + 250); });

      fireEvent.click(screen.getByText("ほかの操作"));
      fireEvent.click(screen.getByRole("button", { name: "同じタスクを続ける" }));
      expect(screen.queryByRole("dialog", { name: "集中セッション完了" })).toBeNull();
      expect(screen.getByRole("button", { name: "タスクを開く。取り組んでいるタスクは数学の復習。今日の未完了は1件" })).toBeTruthy();
      expect(screen.getByText("FOCUS")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("starts the suggested next task from the session complete dialog", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-29T09:00:00+09:00"));
    try {
      prepareTaskFlow([focusTask, nextFocusTask]);
      await act(async () => { await vi.advanceTimersByTimeAsync(25 * 60_000 + 250); });

      expect(screen.getByRole("button", { name: "英語の宿題を開始" }).textContent).toContain("英語の宿題");
      fireEvent.click(screen.getByRole("button", { name: "英語の宿題を開始" }));
      expect(screen.queryByRole("dialog", { name: "集中セッション完了" })).toBeNull();
      expect(screen.getByRole("button", { name: "タスクを開く。取り組んでいるタスクは英語の宿題。今日の未完了は2件" })).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("opens the task drawer around the active task while focus is in progress", () => {
    prepareTaskFlow([focusTask, nextFocusTask]);

    expect(document.querySelector(".floating-timer__task")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "タスクを開く。取り組んでいるタスクは数学の復習。今日の未完了は2件" }));
    expect(screen.getByRole("dialog", { name: "タスク管理" })).toBeTruthy();
    expect(screen.getByRole("form", { name: "数学の復習の詳細" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "数学の復習の詳細からタイマーへ戻る" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "タスク一覧へ戻る" }));
    expect(screen.getByRole("region", { name: "一覧へ戻ったあとの案内" }).textContent).toContain("いまの集中");
    expect(screen.getByRole("region", { name: "一覧へ戻ったあとの案内" }).textContent).toContain("数学の復習へ戻れます");
  });

  it("closes the task drawer on browser back and restores focus to the launcher", async () => {
    prepareTaskFlow([focusTask, nextFocusTask]);
    const launcher = screen.getByRole("button", { name: "タスクを開く。取り組んでいるタスクは数学の復習。今日の未完了は2件" });

    fireEvent.click(launcher);
    expect(screen.getByRole("dialog", { name: "タスク管理" })).toBeTruthy();

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "タスク管理" })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(launcher));
  });

  it("opens the task drawer from the session complete dialog without restarting the timer", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-29T09:00:00+09:00"));
    try {
      prepareTaskFlow([focusTask, nextFocusTask]);
      await act(async () => { await vi.advanceTimersByTimeAsync(25 * 60_000 + 250); });

      fireEvent.click(screen.getByText("ほかの操作"));
      fireEvent.click(screen.getByRole("button", { name: "タスク一覧を開く" }));
      expect(screen.queryByRole("dialog", { name: "集中セッション完了" })).toBeNull();
      expect(screen.getByRole("dialog", { name: "タスク管理" })).toBeTruthy();
      expect(screen.getByRole("form", { name: "英語の宿題の詳細" })).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "タスク一覧へ戻る" }));
      expect(screen.getByRole("region", { name: "一覧へ戻ったあとの案内" }).textContent).toContain("英語の宿題を次の候補として開いています");
      expect(screen.getByLabelText("新しいタスク")).toBeTruthy();
      expect(screen.queryByText("FOCUS")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("closes the session complete dialog on browser back", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-29T09:00:00+09:00"));
    try {
      prepareTaskFlow();
      await act(async () => { await vi.advanceTimersByTimeAsync(25 * 60_000 + 250); });

      expect(screen.getByRole("dialog", { name: "集中セッション完了" })).toBeTruthy();
      act(() => {
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
      expect(screen.queryByRole("dialog", { name: "集中セッション完了" })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("applies a shared opacity to timer backgrounds", () => {
    render(<App />);
    openSettings();
    fireEvent.click(screen.getByRole("tab", { name: "タイマー" }));
    fireEvent.click(screen.getByText("タイマーの表示と配置"));
    fireEvent.change(screen.getByRole("slider", { name: /タイマー背景の不透明度/ }), { target: { value: "60" } });
    expect(document.querySelector<HTMLElement>(".app-shell")?.style.getPropertyValue("--timer-background-opacity")).toBe("0.6");
  });

  it("requests fullscreen from the display settings", async () => {
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(document.documentElement, "requestFullscreen", { configurable: true, value: requestFullscreen });
    try {
      render(<App />);
      openSettings();
      fireEvent.click(screen.getByRole("tab", { name: "表示" }));
      const fullscreen = screen.getByLabelText("全画面表示") as HTMLInputElement;
      expect(fullscreen.disabled).toBe(false);
      fireEvent.click(fullscreen);
      await act(async () => {});
      expect(requestFullscreen).toHaveBeenCalledTimes(1);
      expect(fullscreen.checked).toBe(true);
    } finally {
      Reflect.deleteProperty(document.documentElement, "requestFullscreen");
    }
  });

  it("shows readable size labels without pixel units", () => {
    render(<App />);
    openSettings();
    fireEvent.click(screen.getByRole("tab", { name: "表示" }));
    fireEvent.click(screen.getByText("時計・日付の見やすさ"));
    expect(screen.getAllByText("標準").length).toBe(2);
    expect(screen.queryByText(/px/)).toBeNull();
  });

  it("keeps advanced appearance settings in ordered disclosures", () => {
    render(<App />);
    openSettings();
    fireEvent.click(screen.getByRole("tab", { name: "表示" }));
    const section = document.querySelector<HTMLElement>(".settings-section");
    const fontDisclosure = screen.getByText("フォント").closest("details");
    const clockVisibility = screen.getByText("時計・日付の見やすさ").closest("details");

    expect(section).toBeTruthy();
    expect(fontDisclosure).toBeTruthy();
    expect(clockVisibility).toBeTruthy();
    expect(fontDisclosure?.open).toBe(false);
    expect(Array.from(section!.children).indexOf(fontDisclosure!)).toBeGreaterThan(Array.from(section!.children).indexOf(clockVisibility!));
  });

  it("does not show an empty accessibility settings tab", () => {
    render(<App />);
    openSettings();
    expect(screen.queryByRole("tab", { name: "アクセシビリティ" })).toBeNull();
  });

  it("changes the date display format from clock settings", () => {
    render(<App />);
    openSettings();
    fireEvent.click(screen.getByRole("tab", { name: "表示" }));
    fireEvent.click(screen.getByText("時計・日付の見やすさ"));
    fireEvent.click(screen.getByRole("button", { name: "日付の形式" }));
    fireEvent.click(screen.getByRole("option", { name: "mm/dd 曜日" }));
    expect(document.querySelector(".date")?.textContent).toMatch(/^\d{2}\/\d{2} /);
  });

  it("opens the selected background settings from its image card", () => {
    render(<App />);
    openSettings();
    fireEvent.click(screen.getByRole("tab", { name: "背景" }));
    const picker = screen.getByRole("radiogroup", { name: "背景を選択" });
    expect(screen.queryByRole("heading", { name: "この背景を設定" })).toBeNull();

    const lavender = within(picker).getByRole("radio", { name: "ラベンダー" });
    fireEvent.click(lavender);
    expect(screen.getByRole("heading", { name: "この背景を設定" })).toBeTruthy();
    expect(lavender.getAttribute("aria-expanded")).toBe("true");

    const automatic = within(picker).getByRole("radio", { name: "自動切替" });
    fireEvent.click(automatic);
    expect(automatic.getAttribute("aria-checked")).toBe("true");
    expect(within(picker).getByRole("radio", { name: "モーニング" }).getAttribute("aria-checked")).toBe("false");
    expect(screen.queryByRole("heading", { name: "この背景を設定" })).toBeNull();
  });

  it("selects a background image for direct editing on the home screen", () => {
    render(<App />);
    openSettings();
    fireEvent.click(screen.getByRole("tab", { name: "背景" }));
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "背景を選択" })).getByRole("radio", { name: "ラベンダー" }));
    expect(screen.getByRole("button", { name: "この背景を調整" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "この背景を調整" }));
    expect(screen.queryByRole("dialog", { name: "設定" })).toBeNull();
    expect(document.querySelectorAll(".background__image")[1].classList.contains("background__image--active")).toBe(true);
    expect(screen.queryByText("背景を調整中")).toBeNull();
    fireEvent.pointerDown(document.querySelector<HTMLElement>(".background__gesture")!, { pointerId: 1, clientX: 400, clientY: 300 });
    expect(screen.getByText("背景を調整中")).toBeTruthy();
    expect(document.querySelector(".app-shell")?.classList.contains("app-shell--background-editing")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "背景の調整を終了" }));
    expect(document.querySelector(".app-shell")?.classList.contains("app-shell--background-editing")).toBe(false);
  });

  it("keeps the clock available during background editing and hides it while the background moves", () => {
    render(<App />);
    openSettings();
    fireEvent.click(screen.getByRole("tab", { name: "背景" }));
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "背景を選択" })).getByRole("radio", { name: "ラベンダー" }));
    fireEvent.click(screen.getByRole("button", { name: "この背景を調整" }));

    const display = screen.getByRole("button", { name: "時計とカレンダーの表示設定を開く" });
    expect(display).toBeTruthy();
    const gesture = document.querySelector<HTMLElement>(".background__gesture");
    fireEvent.pointerDown(gesture!, { pointerId: 1, clientX: 200, clientY: 300 });
    expect(document.documentElement.classList.contains("focusboard-background-gesturing")).toBe(true);
    fireEvent.pointerUp(gesture!, { pointerId: 1, clientX: 200, clientY: 300 });
    expect(document.documentElement.classList.contains("focusboard-background-gesturing")).toBe(false);

    fireEvent.pointerDown(display, { pointerId: 2, clientX: 400, clientY: 500 });
    fireEvent.pointerUp(display, { pointerId: 2, clientX: 400, clientY: 500 });
    fireEvent.click(screen.getByLabelText("時計の色を自動調整"));
    const color = screen.getByLabelText("時計・日付の色") as HTMLInputElement;
    fireEvent.change(color, { target: { value: "#112233" } });
    expect(display.style.color).toBe("rgb(17, 34, 51)");
  });

  it("keeps background edits temporary until completion", () => {
    render(<App />);
    openSettings();
    fireEvent.click(screen.getByRole("tab", { name: "背景" }));
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "背景を選択" })).getByRole("radio", { name: "ラベンダー" }));
    fireEvent.click(screen.getByRole("button", { name: "この背景を調整" }));
    const gesture = document.querySelector<HTMLElement>(".background__gesture");
    fireEvent.pointerDown(gesture!, { pointerId: 1, clientX: 200, clientY: 300 });
    fireEvent.pointerMove(gesture!, { pointerId: 1, clientX: 260, clientY: 260 });
    fireEvent.pointerUp(gesture!, { pointerId: 1, clientX: 260, clientY: 260 });
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}").backgroundFrames).toEqual({});
    fireEvent.click(screen.getByRole("button", { name: "変更を取り消す" }));
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}").backgroundFrames).toEqual({});
  });

  it("can minimize the floating timer without losing its main controls", () => {
    render(<App />);
    startWithoutTask();
    const timer = screen.getByLabelText(/クリックでミニ表示にする/);
    fireEvent.click(timer);
    expect(document.querySelector(".floating-timer--compact")).not.toBeNull();
    expect(document.querySelector(".floating-timer--compact .progress-ring")).not.toBeNull();
    expect(document.querySelector(".floating-timer--compact strong")?.textContent).toMatch(/^\d{2}:\d{2}$/);
    fireEvent.click(screen.getByRole("button", { name: /クリックで通常表示に戻す/ }));
    expect(document.querySelector(".floating-timer--compact")).toBeNull();
    expect(screen.getByRole("button", { name: "タイマーセット（タイマーは継続）" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "タイマーをリセット" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "タイマーセット（タイマーは継続）" }));
    expect(screen.getByRole("button", { name: "タイマーをリセット" })).toBeTruthy();
  });

  it("reclamps on expansion and restores the compact edge position on shrink", () => {
    const originalWidth = window.innerWidth;
    const originalHeight = window.innerHeight;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 320 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 568 });
    try {
      render(<App />);
      startWithoutTask();
      const timer = screen.getByLabelText(/クリックでミニ表示にする/);
      Object.defineProperty(timer, "getBoundingClientRect", {
        configurable: true,
        value: () => ({ width: timer.closest(".floating-timer")?.classList.contains("floating-timer--compact") ? 80 : 224, height: timer.closest(".floating-timer")?.classList.contains("floating-timer--compact") ? 80 : 224 })
      });
      fireEvent.click(timer);
      for (let index = 0; index < 12; index += 1) fireEvent.keyDown(timer, { key: "ArrowLeft" });
      fireEvent.click(screen.getByRole("button", { name: /クリックで通常表示に戻す/ }));
      act(() => {});
      expect(Number.parseFloat(document.querySelector<HTMLElement>(".floating-timer")?.style.left ?? "0")).toBeGreaterThanOrEqual(37.5);
      fireEvent.click(screen.getByLabelText(/クリックでミニ表示にする/));
      act(() => {});
      expect(Number.parseFloat(document.querySelector<HTMLElement>(".floating-timer")?.style.left ?? "0")).toBeCloseTo(15, 5);
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
      Object.defineProperty(window, "innerHeight", { configurable: true, value: originalHeight });
    }
  });

  it("keeps the right-aligned clock display inside the viewport", () => {
    const originalWidth = window.innerWidth;
    const originalHeight = window.innerHeight;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1000 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
    try {
      render(<App />);
      const display = screen.getByRole("button", { name: "時計とカレンダーの表示設定を開く" });
      Object.defineProperty(display, "getBoundingClientRect", {
        configurable: true,
        value: () => ({ left: 60, right: 340, top: 520, bottom: 670, width: 280, height: 150 })
      });
      fireEvent.pointerDown(display, { pointerId: 1, clientX: 100, clientY: 600 });
      fireEvent.pointerUp(display, { pointerId: 1, clientX: 100, clientY: 600 });
      fireEvent.click(screen.getByRole("radio", { name: "右" }));
      expect(Number.parseFloat(document.querySelector<HTMLElement>(".clock-widget")?.style.left ?? "0")).toBeGreaterThanOrEqual(29.2);
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
      Object.defineProperty(window, "innerHeight", { configurable: true, value: originalHeight });
    }
  });

  it("shows the app version and exports settings from data management", () => {
    const createObjectURL = vi.fn(() => "blob:focusboard-settings");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    try {
      render(<App />);
      openSettings();
      fireEvent.click(screen.getByRole("tab", { name: "データ" }));
      expect(screen.getByText(/^v(?:\d+\.\d+\.\d+|開発版)$/)).toBeTruthy();
      expect(screen.getByRole("button", { name: "アプリを再読み込み" })).toBeTruthy();
      expect(screen.getByRole("heading", { name: "設定をバックアップ" })).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "設定をエクスポート" }));
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(click).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:focusboard-settings");
    } finally {
      click.mockRestore();
      Reflect.deleteProperty(URL, "createObjectURL");
      Reflect.deleteProperty(URL, "revokeObjectURL");
    }
  });

  it("uses the rounded font picker and keeps clock and timer colors independent", () => {
    render(<App />);
    openSettings();
    fireEvent.click(screen.getByRole("tab", { name: "表示" }));
    fireEvent.click(screen.getByText("カラーテーマ"));
    fireEvent.click(screen.getByRole("radio", { name: "丸ゴシック" }));
    expect(screen.getByRole("radio", { name: "丸ゴシック" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("dialog", { name: "設定" })).toBeTruthy();

    const colorThemes = within(screen.getByRole("radiogroup", { name: "カラーテーマ" }));
    fireEvent.click(colorThemes.getByRole("radio", { name: "ラベンダー" }));
    expect(document.querySelector<HTMLElement>(".app-shell")?.style.getPropertyValue("--timer-accent")).toBe("#baa9e3");

    fireEvent.click(colorThemes.getByRole("radio", { name: "カスタム" }));
    fireEvent.click(screen.getByRole("tab", { name: "表示" }));
    fireEvent.click(screen.getByText("時計・日付の見やすさ"));
    fireEvent.click(screen.getByLabelText("自動調整"));
    fireEvent.click(screen.getByText("カラーコード（詳細）"));
    const clockColor = screen.getByLabelText("時計・日付の色") as HTMLInputElement;
    fireEvent.change(clockColor, { target: { value: "#112233" } });
    fireEvent.click(screen.getByRole("tab", { name: "タイマー" }));
    const timerColor = screen.getByLabelText("タイマーのアクセント色") as HTMLInputElement;
    fireEvent.change(timerColor, { target: { value: "#aabbcc" } });
    expect(clockColor.value).toBe("#112233");
    expect(timerColor.value).toBe("#aabbcc");
    expect(screen.getByRole("button", { name: "時計とカレンダーの表示設定を開く" }).style.color).toBe("rgb(17, 34, 51)");
    expect(document.querySelector<HTMLElement>(".app-shell")?.style.getPropertyValue("--timer-accent")).toBe("#aabbcc");

    fireEvent.click(screen.getByRole("tab", { name: "表示" }));
    fireEvent.click(screen.getByText("時計・日付の見やすさ"));
    const clockAutoToggle = screen.getByLabelText("自動調整") as HTMLInputElement;
    fireEvent.click(clockAutoToggle);
    expect(clockAutoToggle.checked).toBe(true);
    expect(screen.queryByLabelText("時計・日付の色")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "タイマー" }));
    expect(screen.getByLabelText("タイマーのアクセント色")).toBeTruthy();
  });

  it("allows clock and timer adaptive colors to be toggled separately", () => {
    render(<App />);
    openSettings();
    fireEvent.click(screen.getByRole("tab", { name: "表示" }));
    fireEvent.click(screen.getByText("時計・日付の見やすさ"));
    const clockAutoToggle = screen.getByLabelText("自動調整") as HTMLInputElement;
    fireEvent.click(clockAutoToggle);
    expect(screen.getByRole("radio", { name: /カスタム色/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "タイマー" }));
    expect(screen.getByLabelText("タイマーのアクセント色")).toBeTruthy();
    const timerAutoToggle = screen.getByLabelText("背景に合わせて自動調整") as HTMLInputElement;
    fireEvent.click(timerAutoToggle);
    expect(screen.queryByLabelText("タイマーのアクセント色")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "表示" }));
    fireEvent.click(screen.getByText("時計・日付の見やすさ"));
    expect((screen.getByLabelText("自動調整") as HTMLInputElement).checked).toBe(false);
  });

  it("restores clock position and manual color for each background without moving the timer", () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      ...defaultSettings,
      matchClockBackgroundColors: false,
      backgroundChoice: "bg1",
      timerPosition: "top-right",
      clockBackgroundSettings: {
        bg1: { position: { x: .06, y: .22 }, color: "#112233", matchColors: false },
        bg2: { position: { x: .1, y: .68 }, color: "#aabbcc", matchColors: false }
      }
    }));
    render(<App />);
    expect(document.querySelector<HTMLElement>(".clock-widget")?.style.left).toBe("6%");
    expect(screen.getByRole("button", { name: "時計とカレンダーの表示設定を開く" }).style.color).toBe("rgb(17, 34, 51)");
    expect(document.querySelector(".slot--top-right .timer-setup")).not.toBeNull();

    openSettings();
    fireEvent.click(screen.getByRole("tab", { name: "背景" }));
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "背景を選択" })).getByRole("radio", { name: "ラベンダー" }));
    expect(document.querySelector<HTMLElement>(".clock-widget")?.style.left).toBe("10%");
    expect(document.querySelector<HTMLElement>(".clock-widget")?.style.top).toBe("68%");
    expect(screen.getByRole("button", { name: "時計とカレンダーの表示設定を開く" }).style.color).toBe("rgb(170, 187, 204)");
    expect(document.querySelector(".slot--top-right .timer-setup")).not.toBeNull();
  });

  it("uses a separate clock auto-color setting for each background", () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      ...defaultSettings,
      backgroundChoice: "bg1",
      matchClockBackgroundColors: false,
      clockBackgroundSettings: {
        bg1: { position: defaultSettings.clockDatePosition, color: "#112233", matchColors: false },
        bg2: { position: defaultSettings.clockDatePosition, color: "#aabbcc", matchColors: true }
      }
    }));
    render(<App />);
    openSettings();
    fireEvent.click(screen.getByRole("tab", { name: "表示" }));
    fireEvent.click(screen.getByText("時計・日付の見やすさ"));
    const autoToggle = screen.getByLabelText("自動調整") as HTMLInputElement;
    expect(autoToggle.checked).toBe(false);
    fireEvent.click(screen.getByText("背景ごとの設定"));
    fireEvent.click(screen.getByRole("button", { name: "設定する背景" }));
    fireEvent.click(screen.getByRole("option", { name: "ラベンダー" }));
    expect(autoToggle.checked).toBe(true);
    fireEvent.click(autoToggle);
    expect(autoToggle.checked).toBe(false);
  });

  it("applies the selected theme color to the clock and date", () => {
    render(<App />);
    const display = screen.getByRole("button", { name: "時計とカレンダーの表示設定を開く" });
    openSettings();
    fireEvent.click(screen.getByRole("tab", { name: "表示" }));
    fireEvent.click(screen.getByText("カラーテーマ"));
    const colorThemes = within(screen.getByRole("radiogroup", { name: "カラーテーマ" }));
    fireEvent.click(colorThemes.getByRole("radio", { name: "ローズ" }));
    fireEvent.click(screen.getByRole("tab", { name: "表示" }));
    fireEvent.click(screen.getByText("時計・日付の見やすさ"));
    fireEvent.click(screen.getByLabelText("自動調整"));
    expect(display.style.color).toBe("rgb(107, 64, 80)");
  });

  it("edits the clock and calendar together from the display itself", () => {
    render(<App />);
    const display = screen.getByRole("button", { name: "時計とカレンダーの表示設定を開く" });
    fireEvent.pointerDown(display, { pointerId: 1, clientX: 400, clientY: 500 });
    fireEvent.pointerUp(display, { pointerId: 1, clientX: 400, clientY: 500 });
    expect(screen.getByRole("dialog", { name: "時計とカレンダーの表示設定" })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "中央" }));
    expect(screen.getByRole("radio", { name: "中央" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.change(screen.getByRole("slider", { name: "時計の大きさ" }), { target: { value: "128" } });
    expect(document.querySelector<HTMLElement>(".clock")?.style.fontSize).toBe("128px");
  });

  it("shows the clock gesture hint briefly after tapping the clock", () => {
    vi.useFakeTimers();
    try {
      render(<App />);
      const display = screen.getByRole("button", { name: "時計とカレンダーの表示設定を開く" });
      expect(document.querySelector(".clock-widget")?.classList.contains("clock-widget--hint-visible")).toBe(false);
      fireEvent.pointerDown(display, { pointerId: 1, clientX: 400, clientY: 500 });
      fireEvent.pointerUp(display, { pointerId: 1, clientX: 400, clientY: 500 });
      expect(document.querySelector(".clock-widget")?.classList.contains("clock-widget--hint-visible")).toBe(true);
      act(() => { vi.advanceTimersByTime(2_500); });
      expect(document.querySelector(".clock-widget")?.classList.contains("clock-widget--hint-visible")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the clock editor within the viewport near the right edge", () => {
    const originalWidth = window.innerWidth;
    const originalHeight = window.innerHeight;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 800 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 900 });
    try {
      render(<App />);
      const display = screen.getByRole("button", { name: "時計とカレンダーの表示設定を開く" });
      Object.defineProperty(display, "getBoundingClientRect", {
        configurable: true,
        value: () => ({ left: 760, top: 120, width: 80, height: 180, right: 840, bottom: 300 })
      });
      fireEvent.pointerDown(display, { pointerId: 1, clientX: 800, clientY: 210 });
      fireEvent.pointerUp(display, { pointerId: 1, clientX: 800, clientY: 210 });
      const editor = screen.getByRole("dialog", { name: "時計とカレンダーの表示設定" }) as HTMLElement;
      expect(Number.parseInt(editor.style.left, 10)).toBeLessThanOrEqual(424);
      expect(Number.parseInt(editor.style.left, 10)).toBeGreaterThanOrEqual(16);
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
      Object.defineProperty(window, "innerHeight", { configurable: true, value: originalHeight });
    }
  });

  it("starts with background settings and keeps display and timer controls separate", () => {
    render(<App />);
    openSettings();
    expect(screen.getByRole("tab", { name: "背景" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "表示" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "タイマー" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "データ" })).toBeTruthy();
    expect(screen.getAllByRole("tab")).toHaveLength(4);
    expect(screen.getByRole("tab", { name: "背景" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByLabelText("時計を表示")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "表示" }));
    expect(screen.getByLabelText("時計を表示")).toBeTruthy();
    expect(screen.getByLabelText("日付を表示")).toBeTruthy();
    expect(screen.queryByLabelText("タイマーを表示")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "タイマー" }));
    expect(screen.getByLabelText("タイマーを表示")).toBeTruthy();
    expect(screen.queryByLabelText("時計を表示")).toBeNull();
  });

  it("opens the task workspace from a persistent touch-sized launcher", async () => {
    render(<App />);
    const launcher = screen.getByRole("button", { name: /タスクを開く/ });
    fireEvent.click(launcher);
    expect(screen.getByRole("dialog", { name: "タスク管理" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "タスクを閉じる" }));
    expect(screen.queryByRole("dialog", { name: "タスク管理" })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(launcher));
  });

  it("persists a dragged task launcher position and restores it on a new render", async () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...defaultSettings, taskLauncherPosition: { x: .5, y: .5 } }));
    const { unmount } = render(<App />);
    const launcher = screen.getByRole("button", { name: /タスクを開く/ });
    fireEvent(launcher, new MouseEvent("pointerdown", { bubbles: true, clientX: 100, clientY: 100 }));
    fireEvent(launcher, new MouseEvent("pointermove", { bubbles: true, clientX: 260, clientY: 20 }));
    fireEvent(launcher, new MouseEvent("pointerup", { bubbles: true, clientX: 260, clientY: 20 }));

    await waitFor(() => expect(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}").taskLauncherPosition).toMatchObject({ x: expect.any(Number), y: expect.any(Number) }));
    const savedPosition = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}").taskLauncherPosition as { x: number; y: number };
    expect(savedPosition.x).toBeGreaterThan(.5);
    unmount();

    render(<App />);
    const restored = screen.getByRole("button", { name: /タスクを開く/ });
    expect(restored.style.left).toBe(`${savedPosition.x * 100}%`);
    expect(restored.style.top).toBe(`${savedPosition.y * 100}%`);
  });

  it("restores the transient launcher and focus when the task drawer closes or browser back is used", async () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...defaultSettings, taskLauncherVisibility: "background-tap" }));
    render(<App />);
    revealSettings();
    fireEvent.click(screen.getByRole("button", { name: /タスクを開く/ }));
    fireEvent.click(screen.getByRole("button", { name: "タスクを閉じる" }));
    const launcher = screen.getByRole("button", { name: /タスクを開く/ });
    await waitFor(() => expect(document.activeElement).toBe(launcher));

    fireEvent.click(launcher);
    act(() => window.dispatchEvent(new PopStateEvent("popstate")));
    const restoredLauncher = screen.getByRole("button", { name: /タスクを開く/ });
    await waitFor(() => expect(document.activeElement).toBe(restoredLauncher));
  });

  it("opens the suggested next task directly from the launcher while idle", async () => {
    mockTasksState.tasks = [focusTask, nextFocusTask];
    mockTasksState.projects = [focusProject];
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "タスクを開く。次のおすすめは数学の復習。今日の未完了は2件" }));
    expect(screen.getByRole("dialog", { name: "タスク管理" })).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("form", { name: "数学の復習の詳細" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "タスク一覧へ戻る" }));
    expect(screen.getByRole("region", { name: "一覧へ戻ったあとの案内" }).textContent).toContain("今日のおすすめ");
    expect(screen.getByRole("button", { name: "おすすめを開く" })).toBeTruthy();
  });
});
