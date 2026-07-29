import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { ProjectRecord } from "../../types/project";
import type { FocusSessionRecord } from "../../types/focusSession";
import type { RepeatRule, TaskDraft, TaskRecord, TaskView } from "../../types/task";
import type { TimerStatus } from "../../types/timer";
import type { ProductivityBackup } from "../../utils/productivityBackup";
import type { ConflictPreference, ImportStrategy } from "../../utils/productivityImport";
import { formatFocusedTime } from "../../utils/productivityReport";
import { getActiveProjects, getTasksForProject, getTasksForView, sortTasksForFocus, toLocalDateKey, addLocalDays } from "../../utils/taskQueries";
import { ProductivityReport } from "./ProductivityReport";
import { ProductivityBackupPanel } from "./ProductivityBackupPanel";

type Props = {
  open: boolean;
  tasks: TaskRecord[];
  projects: ProjectRecord[];
  sessions: FocusSessionRecord[];
  loading: boolean;
  storageAvailable: boolean;
  canUndo: boolean;
  timerStatus: TimerStatus;
  activeTaskId: string | null;
  workMinutes: number;
  notificationPermission: NotificationPermission | "unsupported";
  onClose: () => void;
  onAddTask: (draft: TaskDraft) => Promise<boolean>;
  onUpdateTask: (id: string, patch: Partial<TaskRecord>) => Promise<boolean>;
  onToggleTask: (id: string) => Promise<boolean>;
  onArchiveTask: (id: string) => Promise<boolean>;
  onMoveTask: (id: string, visibleIds: string[], direction: -1 | 1) => Promise<boolean>;
  onAddProject: (name: string, color?: string) => Promise<boolean>;
  onArchiveProject: (id: string) => Promise<boolean>;
  onUndo: () => Promise<boolean>;
  onStartTask: (id: string) => void;
  onRequestNotification: () => Promise<boolean>;
  onImportBackup: (backup: ProductivityBackup, strategy: ImportStrategy, conflictPreference: ConflictPreference) => Promise<boolean>;
  resumeContext?: {
    label: string;
    title: string;
    detail: string;
    taskId: string | null;
    actionLabel?: string;
  } | null;
};

type TaskListFilter = "all" | "overdue" | "reminders" | "focus";

type TaskListSection = {
  key: string;
  label: string;
  color: string | null;
  tasks: TaskRecord[];
  openCount: number;
  completedPomodoros: number;
  estimatedPomodoros: number;
};

type SmartJump = {
  key: string;
  label: string;
  detail: string;
  tone?: "default" | "focus" | "alert";
  onSelect: () => void;
};

const views: { value: TaskView; label: string }[] = [
  { value: "inbox", label: "Inbox" },
  { value: "today", label: "今日" },
  { value: "tomorrow", label: "明日" },
  { value: "upcoming", label: "今後" },
  { value: "someday", label: "いつか" },
  { value: "completed", label: "完了済み" }
];

const projectColors = ["#3f6fab", "#69559d", "#347b70", "#965748", "#98536c"];

function toDateTimeLocal(timestamp: number | null) {
  if (timestamp === null) return "";
  const date = new Date(timestamp);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(timestamp - offset).toISOString().slice(0, 16);
}

function buildRepeatRule(type: string, dueDate: string, customInterval: number, customUnit: "daily" | "weekly" | "monthly"): RepeatRule | null {
  if (!dueDate || type === "none") return null;
  if (type === "daily") return { type: "daily", interval: 1 };
  if (type === "weekdays") return { type: "weekdays" };
  const [year, month, day] = dueDate.split("-").map(Number);
  if (type === "weekly") return { type: "weekly", interval: 1, weekdays: [new Date(year, month - 1, day).getDay()] };
  if (type === "monthly") return { type: "monthly", interval: 1, day };
  const interval = Math.max(1, Math.round(customInterval));
  if (customUnit === "daily") return { type: "daily", interval: Math.min(365, interval) };
  if (customUnit === "weekly") return { type: "weekly", interval: Math.min(52, interval), weekdays: [new Date(year, month - 1, day).getDay()] };
  return { type: "monthly", interval: Math.min(24, interval), day };
}

function dueLabel(task: TaskRecord, today: string) {
  if (!task.dueDate) return "";
  if (task.status === "open" && task.dueDate < today) return `期限切れ・${task.dueDate}`;
  if (task.dueDate === today) return "今日";
  if (task.dueDate === addLocalDays(today, 1)) return "明日";
  return task.dueDate;
}

function reminderLabel(timestamp: number | null, referenceDate: Date) {
  if (timestamp === null) return "";
  const reminderDate = new Date(timestamp);
  const dayKey = toLocalDateKey(reminderDate);
  const today = toLocalDateKey(referenceDate);
  const tomorrow = addLocalDays(today, 1);
  const time = reminderDate.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
  if (dayKey === today) return `通知 ${time}`;
  if (dayKey === tomorrow) return `通知 明日 ${time}`;
  const day = reminderDate.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
  return `通知 ${day} ${time}`;
}

function sameLocalDay(timestamp: number, dateKey: string) {
  return toLocalDateKey(new Date(timestamp)) === dateKey;
}

function getViewForTask(task: TaskRecord, today: string, tomorrow: string): TaskView {
  if (task.status === "completed") return "completed";
  if (task.dueDate === today) return "today";
  if (task.dueDate === tomorrow) return "tomorrow";
  if (task.dueDate && task.dueDate > tomorrow) return "upcoming";
  if (task.bucket === "someday") return "someday";
  return "inbox";
}

function FocusMeter({
  label,
  completedPomodoros,
  estimatedPomodoros
}: {
  label: string;
  completedPomodoros: number;
  estimatedPomodoros: number;
}) {
  const targetDots = Math.max(estimatedPomodoros, completedPomodoros, 1);
  const visibleDots = Math.min(targetDots, 6);
  const overflowDots = targetDots - visibleDots;

  return (
    <span className="task-pomodoro-meter" aria-label={`${label} ${completedPomodoros} / ${estimatedPomodoros || "—"}`}>
      <span className="task-pomodoro-meter__dots" aria-hidden="true">
        {Array.from({ length: visibleDots }, (_, index) => {
          const isCompleted = index < completedPomodoros;
          const isPlanned = index < estimatedPomodoros;
          return <i className={`${isCompleted ? "is-completed" : ""}${!isCompleted && isPlanned ? " is-planned" : ""}`} key={index} />;
        })}
      </span>
      {overflowDots > 0 && <span className="task-pomodoro-meter__overflow" aria-hidden="true">+{overflowDots}</span>}
      <span>{completedPomodoros} / {estimatedPomodoros || "—"}</span>
    </span>
  );
}

function TaskEditor({ task, projects, subtasks, timerStatus, activeTaskId, completedPomodoros, onStartTask, onReturnToTimer, onSave, onArchive, onAddSubtask, onToggleSubtask, canMoveUp, canMoveDown, onMove, onClose }: {
  task: TaskRecord;
  projects: ProjectRecord[];
  subtasks: TaskRecord[];
  timerStatus: TimerStatus;
  activeTaskId: string | null;
  completedPomodoros: number;
  onStartTask: (id: string) => void;
  onReturnToTimer: () => void;
  onSave: (patch: Partial<TaskRecord>) => Promise<boolean>;
  onArchive: () => Promise<boolean>;
  onAddSubtask: (title: string) => Promise<boolean>;
  onToggleSubtask: (id: string) => Promise<boolean>;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (direction: -1 | 1) => Promise<boolean>;
  onClose?: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [projectId, setProjectId] = useState(task.projectId ?? "");
  const [dueDate, setDueDate] = useState(task.dueDate ?? "");
  const [bucket, setBucket] = useState(task.bucket);
  const [estimatedPomodoros, setEstimatedPomodoros] = useState(task.estimatedPomodoros);
  const [note, setNote] = useState(task.note);
  const [reminder, setReminder] = useState(toDateTimeLocal(task.reminderAt));
  const savedInterval = task.repeatRule && "interval" in task.repeatRule ? task.repeatRule.interval : 1;
  const [repeatType, setRepeatType] = useState(task.repeatRule === null
    ? "none"
    : task.repeatRule.type === "weekdays" || savedInterval === 1 ? task.repeatRule.type : "custom");
  const [customRepeatInterval, setCustomRepeatInterval] = useState(savedInterval);
  const [customRepeatUnit, setCustomRepeatUnit] = useState<"daily" | "weekly" | "monthly">(
    task.repeatRule?.type === "weekly" || task.repeatRule?.type === "monthly" ? task.repeatRule.type : "daily"
  );
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const isActiveTask = activeTaskId === task.id && timerStatus !== "idle";
  const canStartTask = isActiveTask || (timerStatus === "idle" && task.status === "open");
  const now = new Date();
  const today = toLocalDateKey(now);
  const tomorrow = addLocalDays(today, 1);
  const selectedProject = projectId ? projects.find((project) => project.id === projectId) ?? null : null;
  const dueSummary = dueDate
    ? dueDate === today
      ? "今日"
      : dueDate === tomorrow
        ? "明日"
        : dueDate < today
          ? `期限切れ ${dueDate.replace(/-/g, "/")}`
          : dueDate.replace(/-/g, "/")
    : bucket === "someday"
      ? "いつか"
      : "Inbox";
  const reminderSummary = reminder ? reminderLabel(new Date(reminder).getTime(), now) : "通知なし";
  const focusSummary = estimatedPomodoros > 0 || completedPomodoros > 0 ? `集中 ${completedPomodoros} / ${estimatedPomodoros || "—"}` : "見積もりなし";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    await onSave({
      title,
      projectId: projectId || null,
      dueDate: dueDate || null,
      bucket,
      estimatedPomodoros,
      note,
      reminderAt: reminder ? new Date(reminder).getTime() : null,
      repeatRule: buildRepeatRule(repeatType, dueDate, customRepeatInterval, customRepeatUnit)
    });
    setSaving(false);
  };

  return (
    <form className="task-editor" onSubmit={submit} aria-label={`${task.title}の詳細`}>
      <div className="task-editor__heading">
        <div><p className="eyebrow">TASK DETAILS</p><h3>詳細設定</h3></div>
        {onClose && <button className="task-editor__close" type="button" onClick={onClose} aria-label="詳細を閉じる"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" /></svg></button>}
      </div>
      <section className="task-editor__summary" aria-label="タスクの概要">
        <div className="task-editor__summary-copy">
          <strong>{title || task.title}</strong>
          <p>{isActiveTask ? "いま集中しているタスクです。詳細を確認して、そのまま戻れます。" : "予定と集中の準備をここで整えてから開始できます。"}</p>
        </div>
        <div className="task-editor__summary-meta">
          {selectedProject && <em><i style={{ background: selectedProject.color }} />{selectedProject.name}</em>}
          <em className={dueDate && dueDate < today ? "is-overdue" : ""}>{dueSummary}</em>
          <em>{reminderSummary}</em>
          <em>{focusSummary}</em>
        </div>
      </section>
      <section className="task-editor__section" aria-labelledby={`task-plan-${task.id}`}>
        <div className="task-editor__section-heading">
          <div>
            <h4 id={`task-plan-${task.id}`}>予定を整える</h4>
            <p>タスク名、期限、通知を先に決めると、一覧の判断がしやすくなります。</p>
          </div>
        </div>
        <label>タスク名<input value={title} maxLength={200} required onChange={(event) => setTitle(event.target.value)} /></label>
        <div className="task-editor__row">
          <label>プロジェクト<select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">なし</option>{projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label>
          <label>期限<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
        </div>
        <div className="task-editor__date-presets" role="group" aria-label="期限をすばやく設定">
          <button type="button" className={dueDate === today ? "is-active" : ""} aria-pressed={dueDate === today} onClick={() => setDueDate(today)}>今日に移す</button>
          <button type="button" className={dueDate === tomorrow ? "is-active" : ""} aria-pressed={dueDate === tomorrow} onClick={() => setDueDate(tomorrow)}>明日に移す</button>
          <button type="button" className={!dueDate ? "is-active" : ""} aria-pressed={!dueDate} onClick={() => setDueDate("")}>期限を外す</button>
        </div>
        <div className="task-editor__row">
          <label>リマインダー<input type="datetime-local" value={reminder} onChange={(event) => setReminder(event.target.value)} /></label>
          <label>繰り返し<select value={repeatType} disabled={!dueDate} onChange={(event) => setRepeatType(event.target.value)}><option value="none">なし</option><option value="daily">毎日</option><option value="weekdays">平日</option><option value="weekly">毎週</option><option value="monthly">毎月</option><option value="custom">カスタム</option></select></label>
        </div>
        {repeatType === "custom" && <div className="task-editor__row"><label>繰り返し間隔<input type="number" min="1" max={customRepeatUnit === "daily" ? 365 : customRepeatUnit === "weekly" ? 52 : 24} value={customRepeatInterval} onChange={(event) => setCustomRepeatInterval(Number(event.target.value))} /></label><label>繰り返し単位<select value={customRepeatUnit} onChange={(event) => setCustomRepeatUnit(event.target.value as typeof customRepeatUnit)}><option value="daily">日ごと</option><option value="weekly">週ごと</option><option value="monthly">月ごと</option></select></label></div>}
      </section>
      <section className="task-editor__section" aria-labelledby={`task-focus-${task.id}`}>
        <div className="task-editor__section-heading">
          <div>
            <h4 id={`task-focus-${task.id}`}>集中の準備</h4>
            <p>置き場所と見積もりを決めておくと、次のおすすめと実績が安定します。</p>
          </div>
        </div>
        <div className="task-editor__row">
          <label>分類<select value={bucket} onChange={(event) => setBucket(event.target.value as TaskRecord["bucket"])}><option value="inbox">Inbox</option><option value="someday">いつか</option></select></label>
          <label>見積もり<input type="number" min="0" max="99" inputMode="numeric" value={estimatedPomodoros} onChange={(event) => setEstimatedPomodoros(Number(event.target.value))} /></label>
        </div>
      </section>
      <div className="task-editor__focus">
        <div>
          <strong>{isActiveTask ? "いまの集中へ戻る" : "このタスクを始める"}</strong>
          <span>{isActiveTask ? "詳細を閉じて、進行中のタイマー表示へ戻ります。" : "保存せずに、そのまま集中タイマーを開始できます。"}</span>
        </div>
        <button
          className="primary-button"
          type="button"
          disabled={!canStartTask}
          aria-label={isActiveTask ? `${task.title}の詳細からタイマーへ戻る` : `${task.title}を詳細から開始`}
          onClick={() => {
            if (isActiveTask) {
              onReturnToTimer();
              return;
            }
            onStartTask(task.id);
          }}
        >
          {isActiveTask ? "タイマーへ戻る" : "開始"}
        </button>
      </div>
      <section className="task-editor__section" aria-labelledby={`task-note-${task.id}`}>
        <div className="task-editor__section-heading">
          <div>
            <h4 id={`task-note-${task.id}`}>メモ</h4>
            <p>着手時のメモや気づきを残しておくと、次回の再開が速くなります。</p>
          </div>
        </div>
        <label>メモ<textarea value={note} maxLength={10_000} rows={4} onChange={(event) => setNote(event.target.value)} /></label>
      </section>
      <section className="subtask-editor" aria-labelledby={`subtasks-${task.id}`}>
        <h4 id={`subtasks-${task.id}`}>サブタスク</h4>
        {subtasks.length > 0 && <div className="subtask-list">{subtasks.map((subtask) => <button type="button" aria-pressed={subtask.status === "completed"} onClick={() => void onToggleSubtask(subtask.id)} key={subtask.id}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12 4 4 8-9" /></svg><span>{subtask.title}</span></button>)}</div>}
        <div className="subtask-add"><label className="visually-hidden" htmlFor={`subtask-title-${task.id}`}>サブタスク名</label><input id={`subtask-title-${task.id}`} value={subtaskTitle} maxLength={200} placeholder="小さな手順を追加" onChange={(event) => setSubtaskTitle(event.target.value)} /><button type="button" disabled={!subtaskTitle.trim()} onClick={async () => { if (await onAddSubtask(subtaskTitle)) setSubtaskTitle(""); }}>追加</button></div>
      </section>
      <div className="task-editor__actions">
        <button className="danger-button" type="button" onClick={() => { if (window.confirm(`${task.title}をアーカイブしますか？`)) void onArchive(); }}>アーカイブ</button>
        <div className="task-editor__move"><button className="secondary-button" type="button" disabled={!canMoveUp} onClick={() => void onMove(-1)}>前へ</button><button className="secondary-button" type="button" disabled={!canMoveDown} onClick={() => void onMove(1)}>後へ</button></div>
        <button className="primary-button" type="submit" disabled={saving}>{saving ? "保存中" : "保存"}</button>
      </div>
    </form>
  );
}

function WorkspaceIcon({ type }: { type: "tasks" | "report" | "backup" }) {
  if (type === "report") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V9m7 10V5m7 14v-7" /></svg>;
  if (type === "backup") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 20h14" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h10M9 12h10M9 18h10M4 6h.01M4 12h.01M4 18h.01" /></svg>;
}

export function TaskDrawer({
  open,
  tasks,
  projects,
  sessions,
  loading,
  storageAvailable,
  canUndo,
  timerStatus,
  activeTaskId,
  workMinutes,
  notificationPermission,
  onClose,
  onAddTask,
  onUpdateTask,
  onToggleTask,
  onArchiveTask,
  onMoveTask,
  onAddProject,
  onArchiveProject,
  onUndo,
  onStartTask,
  onRequestNotification,
  onImportBackup,
  resumeContext = null
}: Props) {
  const [view, setView] = useState<TaskView>("today");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [listFilter, setListFilter] = useState<TaskListFilter>("all");
  const [workspaceMode, setWorkspaceMode] = useState<"tasks" | "report" | "backup">("tasks");
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectColor, setNewProjectColor] = useState(projectColors[0]);
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [showResumeBanner, setShowResumeBanner] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const taskRowRefs = useRef(new Map<string, HTMLDivElement>());
  const taskContentButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const appliedResumeTaskIdRef = useRef<string | null>(null);
  const selectedTaskScrollModeRef = useRef<"nearest" | "start">("nearest");
  const now = new Date();
  const today = toLocalDateKey(now);
  const tomorrow = addLocalDays(today, 1);
  const activeProjects = useMemo(() => getActiveProjects(projects), [projects]);
  const currentListLabel = projectId
    ? activeProjects.find((project) => project.id === projectId)?.name ?? "プロジェクト"
    : views.find((item) => item.value === view)?.label ?? "タスク";
  const currentProject = projectId
    ? activeProjects.find((project) => project.id === projectId) ?? null
    : null;
  const completedPomodorosByTask = useMemo(() => {
    const counts = new Map<string, number>();
    for (const session of sessions) {
      if (session.taskId && session.mode === "work" && session.result === "completed") {
        counts.set(session.taskId, (counts.get(session.taskId) ?? 0) + 1);
      }
    }
    return counts;
  }, [sessions]);
  const scopedTasks = useMemo(
    () => projectId ? getTasksForProject(tasks, projectId) : getTasksForView(tasks, view, today),
    [projectId, tasks, today, view]
  );
  const visibleTasks = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase("ja");
    if (!query) return scopedTasks;
    return scopedTasks.filter((task) => `${task.title}\n${task.note}`.toLocaleLowerCase("ja").includes(query));
  }, [scopedTasks, searchQuery]);
  const filteredTasks = useMemo(() => {
    if (listFilter === "all") return visibleTasks;
    if (listFilter === "overdue") return visibleTasks.filter((task) => task.dueDate !== null && task.dueDate < today);
    if (listFilter === "reminders") return visibleTasks.filter((task) => task.reminderAt !== null);
    return visibleTasks.filter((task) => activeTaskId === task.id || task.estimatedPomodoros > 0 || (completedPomodorosByTask.get(task.id) ?? 0) > 0);
  }, [activeTaskId, completedPomodorosByTask, listFilter, today, visibleTasks]);
  const taskSections = useMemo<TaskListSection[]>(() => {
    if (filteredTasks.length === 0) return [];
    if (projectId) {
      return [{
        key: currentProject?.id ?? projectId,
        label: currentProject?.name ?? currentListLabel,
        color: currentProject?.color ?? null,
        tasks: filteredTasks,
        openCount: filteredTasks.filter((task) => task.status === "open").length,
        completedPomodoros: filteredTasks.reduce((sum, task) => sum + (completedPomodorosByTask.get(task.id) ?? 0), 0),
        estimatedPomodoros: filteredTasks.reduce((sum, task) => sum + task.estimatedPomodoros, 0)
      }];
    }

    const sections = new Map<string, TaskListSection>();
    for (const task of filteredTasks) {
      const taskProject = task.projectId
        ? activeProjects.find((project) => project.id === task.projectId) ?? null
        : null;
      const key = taskProject?.id ?? `ungrouped-${view}`;
      const label = taskProject?.name
        ?? (view === "inbox"
          ? "Inbox"
          : view === "someday"
            ? "いつか"
            : "プロジェクトなし");
      const currentSection = sections.get(key) ?? {
        key,
        label,
        color: taskProject?.color ?? null,
        tasks: [],
        openCount: 0,
        completedPomodoros: 0,
        estimatedPomodoros: 0
      };
      currentSection.tasks.push(task);
      if (task.status === "open") currentSection.openCount += 1;
      currentSection.completedPomodoros += completedPomodorosByTask.get(task.id) ?? 0;
      currentSection.estimatedPomodoros += task.estimatedPomodoros;
      sections.set(key, currentSection);
    }

    return [...sections.values()].sort((left, right) => {
      if (left.color && right.color) {
        const leftProject = activeProjects.find((project) => project.id === left.key);
        const rightProject = activeProjects.find((project) => project.id === right.key);
        if (leftProject && rightProject) return leftProject.order - rightProject.order || leftProject.createdAt - rightProject.createdAt;
      }
      if (left.color) return -1;
      if (right.color) return 1;
      return left.label.localeCompare(right.label, "ja");
    });
  }, [activeProjects, completedPomodorosByTask, currentListLabel, currentProject, filteredTasks, projectId, view]);
  const filterCounts = useMemo(() => ({
    all: visibleTasks.length,
    overdue: visibleTasks.filter((task) => task.dueDate !== null && task.dueDate < today).length,
    reminders: visibleTasks.filter((task) => task.reminderAt !== null).length,
    focus: visibleTasks.filter((task) => activeTaskId === task.id || task.estimatedPomodoros > 0 || (completedPomodorosByTask.get(task.id) ?? 0) > 0).length
  }), [activeTaskId, completedPomodorosByTask, today, visibleTasks]);
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;
  const todayTasks = useMemo(() => getTasksForView(tasks, "today", today), [tasks, today]);
  const todayOpenRootTasks = useMemo(
    () => todayTasks.filter((task) => task.parentTaskId === null && task.status === "open"),
    [todayTasks]
  );
  const todayOpenTasks = todayOpenRootTasks.length;
  const todayCompletedTasks = useMemo(
    () => tasks.filter((task) => task.parentTaskId === null && task.status === "completed" && task.completedAt !== null && sameLocalDay(task.completedAt, today)).length,
    [tasks, today]
  );
  const overdueCount = useMemo(
    () => tasks.filter((task) => task.parentTaskId === null && task.status === "open" && task.dueDate !== null && task.dueDate < today).length,
    [tasks, today]
  );
  const todaySessions = useMemo(
    () => sessions.filter((session) => session.mode === "work" && sameLocalDay(session.endedAt, today)),
    [sessions, today]
  );
  const todayFocusedMs = useMemo(
    () => todaySessions.reduce((sum, session) => sum + session.focusedDurationMs, 0),
    [todaySessions]
  );
  const focusQueue = useMemo(() => {
    return sortTasksForFocus(tasks, today, activeTaskId)
      .filter((task) => task.id === activeTaskId || (task.dueDate !== null && task.dueDate <= today))
      .slice(0, 3);
  }, [activeTaskId, tasks, today]);
  const focusCandidate = activeTaskId
    ? tasks.find((task) => task.id === activeTaskId && task.status === "open") ?? null
    : projectId
      ? visibleTasks.find((task) => task.status === "open") ?? null
      : focusQueue[0] ?? visibleTasks.find((task) => task.status === "open") ?? null;
  const activeFocusTask = activeTaskId && timerStatus !== "idle"
    ? tasks.find((task) => task.id === activeTaskId && task.status !== "archived") ?? null
    : null;
  const activeFocusProject = activeFocusTask?.projectId
    ? activeProjects.find((project) => project.id === activeFocusTask.projectId) ?? null
    : null;
  const activeFocusBanner = useMemo(() => {
    if (!activeFocusTask) return null;
    const detailParts: string[] = [];
    if (activeFocusProject) detailParts.push(activeFocusProject.name);
    const activeDueLabel = dueLabel(activeFocusTask, today);
    if (activeDueLabel) detailParts.push(activeDueLabel);
    return {
      label: "いまの集中",
      title: `${activeFocusTask.title}に集中中です`,
      detail: `${detailParts.join(" ・ ")}${detailParts.length > 0 ? " ・ " : ""}集中を止めずに、詳細や一覧を見直せます。`,
      taskId: activeFocusTask.id,
      actionLabel: "進行中を開く"
    };
  }, [activeFocusProject, activeFocusTask, today]);
  const toolbarContext = resumeContext ?? activeFocusBanner;
  const focusCandidateProject = focusCandidate?.projectId
    ? activeProjects.find((project) => project.id === focusCandidate.projectId) ?? null
    : null;
  const focusCandidateDueLabel = focusCandidate ? dueLabel(focusCandidate, today) : "";
  const quickDatePreset = dueDate === today ? "today" : dueDate === tomorrow ? "tomorrow" : dueDate === "" ? "none" : "custom";
  const todayCompletionRate = todayTasks.length === 0 ? 0 : Math.round((todayCompletedTasks / todayTasks.length) * 100);
  const todayProgressLabel = todayTasks.length === 0
    ? "まだ今日のタスクはありません"
    : `${todayCompletedTasks} / ${todayTasks.length}件が完了`;
  const nextReminderTask = tasks
    .filter((task) => task.parentTaskId === null && task.status === "open" && task.reminderAt !== null && task.reminderAt >= now.getTime())
    .sort((left, right) => (left.reminderAt ?? 0) - (right.reminderAt ?? 0))[0] ?? null;
  const nextReminderText = reminderLabel(nextReminderTask?.reminderAt ?? null, now);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !drawerRef.current) return;
      const focusable = [...drawerRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus();
    };
  }, [onClose, open]);

  useEffect(() => {
    if (selectedTaskId && !tasks.some((task) => task.id === selectedTaskId && task.status !== "archived")) setSelectedTaskId(null);
  }, [selectedTaskId, tasks]);

  useEffect(() => {
    setListFilter("all");
  }, [projectId, view, workspaceMode]);

  useEffect(() => {
    if (selectedTaskId && !filteredTasks.some((task) => task.id === selectedTaskId)) setSelectedTaskId(null);
  }, [filteredTasks, selectedTaskId]);

  useEffect(() => {
    setShowResumeBanner(open && toolbarContext !== null);
  }, [open, toolbarContext]);

  const addTask = async (event: FormEvent) => {
    event.preventDefault();
    const defaultDueDate = view === "today" ? today : view === "tomorrow" ? addLocalDays(today, 1) : null;
    const added = await onAddTask({
      title,
      dueDate: dueDate || defaultDueDate,
      projectId,
      bucket: view === "someday" ? "someday" : "inbox"
    });
    if (added) {
      setTitle("");
      setDueDate("");
    }
  };

  const addProject = async (event: FormEvent) => {
    event.preventDefault();
    if (await onAddProject(newProjectName, newProjectColor)) {
      setNewProjectName("");
      setShowProjectForm(false);
    }
  };

  const currentListRootTasks = scopedTasks.filter((task) => task.parentTaskId === null);
  const currentListOpenCount = currentListRootTasks.filter((task) => task.status === "open").length;
  const currentListCompletedCount = currentListRootTasks.filter((task) => task.status === "completed").length;
  const currentListDescription = projectId
    ? `${currentListLabel}にあるタスクを、集中する順で確認できます。`
    : view === "today"
      ? "今日動かすタスクを、この画面だけで追加して集中できます。"
      : view === "tomorrow"
        ? "明日の予定を先に整えて、今日の集中を軽くします。"
        : view === "upcoming"
          ? "今後の締切を見直して、今日に落とし込む準備をします。"
          : view === "someday"
            ? "今すぐではない候補を、あとで拾えるように残しておけます。"
            : view === "completed"
              ? "終わったタスクの確認専用です。新規追加は別の一覧で行います。"
              : "Inbox に集めたタスクを、今日やる順へ整理できます。";
  const quickAddContextLabel = currentProject
    ? `${currentProject.name}へすぐ追加`
    : view === "today"
      ? "今日の予定へ 1 行で追加"
      : view === "tomorrow"
        ? "明日の予定へ先回り追加"
        : view === "upcoming"
          ? "今後の予定を追加"
          : view === "someday"
            ? "いつかやることを追加"
            : view === "completed"
              ? "完了済み一覧では追加できません"
              : "Inbox にそのまま追加";
  const quickAddPlaceholder = currentProject
    ? `${currentProject.name}で次に進めることを追加`
    : view === "today"
      ? "今日すぐ始めたいタスクを追加"
      : view === "tomorrow"
        ? "明日に回す予定を追加"
        : view === "upcoming"
          ? "締切が先の予定を追加"
          : view === "someday"
            ? "あとでやりたいことを追加"
            : view === "completed"
              ? "完了済みでは追加できません"
              : "頭に浮かんだタスクをすぐ入力";
  const focusHeadline = activeTaskId
    ? "進行中の集中"
    : projectId
      ? "このプロジェクトの次の1件"
      : view === "today"
        ? "今日のおすすめ"
        : "次に始める";
  const focusSupportText = activeTaskId
    ? "タイマーを止めずに、タスクの詳細と進み具合を確認できます。"
    : focusCandidate
      ? "開始ボタンから、そのまま集中タイマーへ入れます。"
      : "まずは下の入力欄から、次の1件を追加してください。";
  const isActiveFocusTask = focusCandidate !== null && activeTaskId === focusCandidate.id && timerStatus !== "idle";

  const openTaskDetails = (task: TaskRecord, options?: { revealInList?: boolean }) => {
    if (options?.revealInList) {
      setSearchQuery("");
      setListFilter("all");
      selectedTaskScrollModeRef.current = "start";
    } else {
      selectedTaskScrollModeRef.current = "nearest";
    }
    setWorkspaceMode("tasks");
    setSelectedTaskId(task.id);
    if (task.projectId && activeProjects.some((project) => project.id === task.projectId)) {
      setProjectId(task.projectId);
      return;
    }
    setProjectId(null);
    setView(getViewForTask(task, today, tomorrow));
  };
  const focusTaskTrigger = (taskId: string) => {
    window.setTimeout(() => taskContentButtonRefs.current.get(taskId)?.focus(), 0);
  };
  const closeTaskDetails = (taskId: string) => {
    setSelectedTaskId(null);
    focusTaskTrigger(taskId);
  };
  const smartJumps: SmartJump[] = [];
  const jumpedTaskIds = new Set<string>();
  const pushTaskJump = (task: TaskRecord, label: string, keyPrefix: string, tone: SmartJump["tone"] = "default") => {
    if (jumpedTaskIds.has(task.id)) return;
    jumpedTaskIds.add(task.id);
    smartJumps.push({
      key: `${keyPrefix}-${task.id}`,
      label,
      detail: task.title,
      tone,
      onSelect: () => openTaskDetails(task, { revealInList: true })
    });
  };
  if (activeFocusTask && timerStatus !== "idle") {
    pushTaskJump(activeFocusTask, "進行中", "active", "focus");
  }
  if (focusCandidate && focusCandidate.status === "open" && activeTaskId !== focusCandidate.id) {
    pushTaskJump(focusCandidate, "次の1件", "focus", "focus");
  }
  if (nextReminderTask) {
    pushTaskJump(nextReminderTask, "次の通知", "reminder");
  }
  if (overdueCount > 0) {
    smartJumps.push({
      key: "overdue",
      label: "期限切れ",
      detail: `${overdueCount}件を見直す`,
      tone: "alert",
      onSelect: () => {
        selectedTaskScrollModeRef.current = "start";
        setProjectId(null);
        setView("today");
        setWorkspaceMode("tasks");
        setSearchQuery("");
        setSelectedTaskId(null);
        setListFilter("overdue");
      }
    });
  }

  useEffect(() => {
    if (!resumeContext?.taskId) {
      appliedResumeTaskIdRef.current = null;
      return;
    }
    if (!open || appliedResumeTaskIdRef.current === resumeContext.taskId) return;
    const task = tasks.find((item) => item.id === resumeContext.taskId && item.status !== "archived");
    if (!task) return;
    appliedResumeTaskIdRef.current = resumeContext.taskId;
    openTaskDetails(task, { revealInList: true });
  }, [open, resumeContext, tasks]);

  useEffect(() => {
    if (!open || !selectedTaskId) return;
    const target = taskRowRefs.current.get(selectedTaskId);
    if (!target) return;
    let prefersReducedMotion = false;
    try {
      prefersReducedMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      prefersReducedMotion = false;
    }
    if (typeof target.scrollIntoView === "function") {
      target.scrollIntoView({
        block: selectedTaskScrollModeRef.current,
        behavior: prefersReducedMotion ? "auto" : "smooth"
      });
      selectedTaskScrollModeRef.current = "nearest";
    }
  }, [open, selectedTaskId]);

  if (!open) return null;

  return (
    <div className="task-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="task-drawer" role="dialog" aria-modal="true" aria-labelledby="task-drawer-title" ref={drawerRef}>
        <a className="task-skip-link" href="#task-workspace-main">現在の一覧へ移動</a>
        <div className="task-drawer__sheet-handle" aria-hidden="true" />
        <header className="task-drawer__header">
          <div><p className="eyebrow">FOCUSBOARD</p><h2 id="task-drawer-title">タスクと集中</h2></div>
          <div className="task-drawer__header-actions">
            {notificationPermission === "default" && <button className="task-header-action" type="button" onClick={() => void onRequestNotification()}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7M10 20h4" /></svg><span>通知を許可</span></button>}
            {canUndo && <button className="task-header-action" type="button" onClick={() => void onUndo()}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 7-5 5 5 5M5 12h8a6 6 0 0 1 6 6" /></svg><span>元に戻す</span></button>}
            <button className="icon-button" type="button" onClick={onClose} ref={closeRef} aria-label="タスクを閉じる"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" /></svg></button>
          </div>
        </header>

        <nav className="task-mode-tabs" aria-label="タスク機能">
          <button type="button" className={workspaceMode === "tasks" ? "is-active" : ""} aria-current={workspaceMode === "tasks" ? "page" : undefined} onClick={() => setWorkspaceMode("tasks")}><WorkspaceIcon type="tasks" /><span>タスク</span></button>
          <button type="button" className={workspaceMode === "report" ? "is-active" : ""} aria-current={workspaceMode === "report" ? "page" : undefined} onClick={() => setWorkspaceMode("report")}><WorkspaceIcon type="report" /><span>レポート</span></button>
          <button type="button" className={workspaceMode === "backup" ? "is-active" : ""} aria-current={workspaceMode === "backup" ? "page" : undefined} onClick={() => setWorkspaceMode("backup")}><WorkspaceIcon type="backup" /><span>データ</span></button>
        </nav>

        <div className={`task-drawer__body task-drawer__body--${workspaceMode}`}>
          {workspaceMode === "tasks" && <nav className="task-navigation" aria-label="タスク一覧">
            <p className="task-navigation__label">スマートリスト</p>
            <div className="task-navigation__views">
              {views.map((item) => {
                const count = getTasksForView(tasks, item.value, today).length;
                return <button type="button" className={!projectId && view === item.value ? "is-active" : ""} aria-current={!projectId && view === item.value ? "page" : undefined} onClick={() => { setProjectId(null); setView(item.value); setSelectedTaskId(null); setWorkspaceMode("tasks"); }} key={item.value}><span>{item.label}</span><strong>{count}</strong></button>;
              })}
            </div>
            <div className="task-navigation__projects">
              <div className="task-navigation__projects-heading"><h3>プロジェクト</h3><button type="button" aria-expanded={showProjectForm} onClick={() => setShowProjectForm((current) => !current)}>{showProjectForm ? "閉じる" : "新規"}</button></div>
              {activeProjects.map((project) => (
                <div className={projectId === project.id ? "project-link is-active" : "project-link"} key={project.id}>
                  <button type="button" onClick={() => { setProjectId(project.id); setSelectedTaskId(null); setWorkspaceMode("tasks"); }}><i style={{ background: project.color }} /><span>{project.name}</span><strong>{getTasksForProject(tasks, project.id).length}</strong></button>
                  <button type="button" aria-label={`${project.name}をアーカイブ`} onClick={() => { if (window.confirm(`${project.name}をアーカイブし、タスクをInboxへ移しますか？`)) void onArchiveProject(project.id); }}>×</button>
                </div>
              ))}
              {showProjectForm && <form className="project-add" onSubmit={addProject}>
                <input aria-label="新しいプロジェクト名" placeholder="プロジェクトを追加" maxLength={80} value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} disabled={!storageAvailable} />
                <input className="project-add__color" aria-label="プロジェクトの色" type="color" value={newProjectColor} onChange={(event) => setNewProjectColor(event.target.value)} />
                <button type="submit" aria-label="プロジェクトを追加" disabled={!storageAvailable || !newProjectName.trim()}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg></button>
              </form>}
            </div>
          </nav>}

          <section className={`task-workspace${workspaceMode !== "tasks" ? " task-workspace--standalone" : ""}`} id="task-workspace-main" tabIndex={-1} aria-label={workspaceMode === "report" ? "集中レポート" : workspaceMode === "backup" ? "バックアップと復元" : currentListLabel}>
            {workspaceMode === "report" ? <ProductivityReport tasks={tasks} sessions={sessions} workMinutes={workMinutes} /> : workspaceMode === "backup" ? <ProductivityBackupPanel tasks={tasks} projects={projects} sessions={sessions} storageAvailable={storageAvailable} onImport={onImportBackup} /> : <>
            <section className="task-focus-hero" aria-label="今日の集中サマリー">
              <div className="task-focus-hero__header">
                <div>
                  <p className="eyebrow">TODAY</p>
                  <h3>今日の集中ハブ</h3>
                  <p>{today.replace(/-/g, "/")}の進捗をひと目で確認できます。</p>
                </div>
                <span className="task-focus-hero__pill">{todayTasks.length}件が今日の対象</span>
              </div>
              <div className="task-focus-hero__stats">
                <article>
                  <span>残タスク</span>
                  <strong>{todayOpenTasks}</strong>
                </article>
                <article>
                  <span>完了</span>
                  <strong>{todayCompletedTasks}</strong>
                </article>
                <article>
                  <span>集中</span>
                  <strong>{todayFocusedMs > 0 ? formatFocusedTime(todayFocusedMs) : "0分"}</strong>
                </article>
                <article>
                  <span>期限切れ</span>
                  <strong>{overdueCount}</strong>
                </article>
              </div>
              <div className="task-focus-hero__progress" aria-label="今日の進捗">
                <div>
                  <span>今日の進み具合</span>
                  <strong>{todayProgressLabel}</strong>
                </div>
                <progress max={100} value={todayCompletionRate} aria-label={`今日の進捗 ${todayCompletionRate}%`} />
              </div>
              {nextReminderTask && nextReminderText && (
                <div className="task-focus-hero__alert" role="status" aria-label="次のリマインダー">
                  <strong>次の通知</strong>
                  <span>{nextReminderTask.title}</span>
                  <em>{nextReminderText}</em>
                </div>
              )}
              <div className="task-focus-card">
                <div className="task-focus-card__copy">
                  <span>{focusHeadline}</span>
                  <strong>{focusCandidate?.title ?? "次に取り組むタスクを決めましょう"}</strong>
                  <p>{focusSupportText}</p>
                  {focusCandidate && (
                    <div className="task-focus-card__meta">
                      {focusCandidateProject && <em><i style={{ background: focusCandidateProject.color }} />{focusCandidateProject.name}</em>}
                      {focusCandidateDueLabel && <em className={focusCandidateDueLabel.startsWith("期限切れ") ? "is-overdue" : ""}>{focusCandidateDueLabel}</em>}
                      {focusCandidate.reminderAt !== null && <em>{reminderLabel(focusCandidate.reminderAt, now)}</em>}
                      {(focusCandidate.estimatedPomodoros > 0 || (completedPomodorosByTask.get(focusCandidate.id) ?? 0) > 0) && (
                        <em>集中 {completedPomodorosByTask.get(focusCandidate.id) ?? 0} / {focusCandidate.estimatedPomodoros || "—"}</em>
                      )}
                    </div>
                  )}
                </div>
                {focusCandidate ? (
                  <div className="task-focus-card__actions">
                    <button
                      className="task-focus-card__secondary"
                      type="button"
                      onClick={() => openTaskDetails(focusCandidate, { revealInList: true })}
                      aria-label={`${focusCandidate.title}の詳細を開く`}
                    >
                      詳細
                    </button>
                    <button
                      className="task-focus-card__action"
                      type="button"
                      onClick={() => {
                        if (isActiveFocusTask) {
                          onClose();
                          return;
                        }
                        onStartTask(focusCandidate.id);
                      }}
                      disabled={!isActiveFocusTask && (timerStatus !== "idle" || focusCandidate.status !== "open")}
                    >
                      {isActiveFocusTask ? "タイマーへ戻る" : activeTaskId === focusCandidate.id ? "進行中" : "開始"}
                    </button>
                  </div>
                ) : (
                  <div className="task-focus-card__empty" aria-hidden="true">+</div>
                )}
              </div>
              {focusQueue.length > 0 && (
                <section className="task-focus-queue" aria-labelledby="task-focus-queue-title">
                  <div className="task-focus-queue__heading">
                    <div>
                      <h4 id="task-focus-queue-title">今日の流れ</h4>
                      <p>先に片づける順で、すぐ始められる 3 件までを表示します。</p>
                    </div>
                    <span>{focusQueue.length}件</span>
                  </div>
                  <ol className="task-focus-queue__list">
                    {focusQueue.map((queueTask, index) => {
                      const queueProject = queueTask.projectId
                        ? activeProjects.find((project) => project.id === queueTask.projectId) ?? null
                        : null;
                      const queueDueLabel = dueLabel(queueTask, today);
                      const queuePomodoros = completedPomodorosByTask.get(queueTask.id) ?? 0;
                      const queueStateLabel = activeTaskId === queueTask.id && timerStatus !== "idle"
                        ? "進行中"
                        : queueDueLabel.startsWith("期限切れ")
                          ? "先に片づける"
                          : index === 0
                            ? "次に集中"
                            : "このあと";
                      const isQueueTaskActive = activeTaskId === queueTask.id && timerStatus !== "idle";

                      return (
                        <li key={queueTask.id}>
                          <button
                            className={`task-focus-queue__item${isQueueTaskActive ? " is-active" : ""}`}
                            type="button"
                            onClick={() => openTaskDetails(queueTask, { revealInList: true })}
                            aria-label={`${queueTask.title}の順番と詳細を開く`}
                          >
                            <span className="task-focus-queue__index" aria-hidden="true">{index + 1}</span>
                            <span className="task-focus-queue__content">
                              <span>{queueStateLabel}</span>
                              <strong>{queueTask.title}</strong>
                              <span className="task-focus-queue__meta">
                                {queueProject && <em><i style={{ background: queueProject.color }} />{queueProject.name}</em>}
                                {queueDueLabel && <em className={queueDueLabel.startsWith("期限切れ") ? "is-overdue" : ""}>{queueDueLabel}</em>}
                                {(queueTask.estimatedPomodoros > 0 || queuePomodoros > 0) && <em>集中 {queuePomodoros} / {queueTask.estimatedPomodoros || "—"}</em>}
                              </span>
                            </span>
                          </button>
                          <button
                            className={`task-focus-queue__start${isQueueTaskActive ? " is-active" : ""}`}
                            type="button"
                            aria-label={isQueueTaskActive ? "キューからタイマーへ戻る" : `${queueTask.title}をキューから開始`}
                            disabled={!isQueueTaskActive && timerStatus !== "idle"}
                            onClick={() => {
                              if (isQueueTaskActive) {
                                onClose();
                                return;
                              }
                              onStartTask(queueTask.id);
                            }}
                          >
                            {isQueueTaskActive ? "戻る" : "開始"}
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              )}
            </section>
            <div className="task-workspace__toolbar">
              <div className="task-workspace__heading">
                <div><p className="eyebrow">MY TASKS</p><h3>{currentListLabel}</h3><span>{filteredTasks.length}件のタスク</span></div>
                <div className="task-search">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></svg>
                  <label className="visually-hidden" htmlFor="task-search-query">タスクを検索</label>
                  <input id="task-search-query" type="search" placeholder="タイトル・メモを検索" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} />
                </div>
              </div>
              <section className="task-current-list" aria-label="現在の一覧">
                <div className="task-current-list__copy">
                  <span>現在の一覧</span>
                  <strong>{currentListLabel}</strong>
                  <p>{currentListDescription}</p>
                </div>
                <div className="task-current-list__stats" aria-label={`${currentListLabel}の件数`}>
                  <em>未完了 {currentListOpenCount}件</em>
                  <em>完了 {currentListCompletedCount}件</em>
                </div>
              </section>
              {showResumeBanner && toolbarContext && (
                <section className="task-resume-banner" aria-label="一覧へ戻ったあとの案内">
                  <div className="task-resume-banner__copy">
                    <span>{toolbarContext.label}</span>
                    <strong>{toolbarContext.title}</strong>
                    <p>{toolbarContext.detail}</p>
                  </div>
                  <div className="task-resume-banner__actions">
                    {toolbarContext.taskId && (
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => {
                          const task = tasks.find((item) => item.id === toolbarContext.taskId && item.status !== "archived");
                          if (task) openTaskDetails(task, { revealInList: true });
                        }}
                      >
                        {toolbarContext.actionLabel ?? "候補を開く"}
                      </button>
                    )}
                    <button className="text-button" type="button" onClick={() => setShowResumeBanner(false)}>閉じる</button>
                  </div>
                </section>
              )}
              {smartJumps.length > 0 && (
                <div className="task-smart-jumps" role="group" aria-label="すぐ移動">
                  {smartJumps.map((jump) => (
                    <button className={jump.tone ? `is-${jump.tone}` : undefined} key={jump.key} type="button" onClick={jump.onSelect}>
                      <span>{jump.label}</span>
                      <strong>{jump.detail}</strong>
                    </button>
                  ))}
                </div>
              )}
              <div className="task-list-filters" role="group" aria-label="表示するタスクを絞り込む">
                <button className={listFilter === "all" ? "is-active" : ""} type="button" aria-pressed={listFilter === "all"} onClick={() => setListFilter("all")}><span>すべて</span><strong>{filterCounts.all}</strong></button>
                <button className={listFilter === "overdue" ? "is-active" : ""} type="button" aria-pressed={listFilter === "overdue"} onClick={() => setListFilter("overdue")}><span>期限切れ</span><strong>{filterCounts.overdue}</strong></button>
                <button className={listFilter === "reminders" ? "is-active" : ""} type="button" aria-pressed={listFilter === "reminders"} onClick={() => setListFilter("reminders")}><span>通知</span><strong>{filterCounts.reminders}</strong></button>
                <button className={listFilter === "focus" ? "is-active" : ""} type="button" aria-pressed={listFilter === "focus"} onClick={() => setListFilter("focus")}><span>集中目安</span><strong>{filterCounts.focus}</strong></button>
              </div>
              {!storageAvailable && <div className="task-callout" role="status"><strong>タスク保存を利用できません</strong><span>時計とタイマーはそのまま使えます。ブラウザのサイトデータ設定を確認してください。</span></div>}
              <form className="task-quick-add" onSubmit={addTask}>
                <div className="task-quick-add__icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg></div>
                <div className="task-quick-add__fields">
                  <span className="task-quick-add__context">{quickAddContextLabel}</span>
                  <label className="visually-hidden" htmlFor="task-title">新しいタスク</label>
                  <input id="task-title" placeholder={quickAddPlaceholder} maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} disabled={!storageAvailable || view === "completed"} />
                  <div className="task-quick-add__presets" role="group" aria-label="追加するタスクの期限">
                    <button className={quickDatePreset === "today" ? "is-active" : ""} type="button" aria-pressed={quickDatePreset === "today"} onClick={() => setDueDate(today)} disabled={!storageAvailable || view === "completed"}>今日</button>
                    <button className={quickDatePreset === "tomorrow" ? "is-active" : ""} type="button" aria-pressed={quickDatePreset === "tomorrow"} onClick={() => setDueDate(tomorrow)} disabled={!storageAvailable || view === "completed"}>明日</button>
                    <button className={quickDatePreset === "none" ? "is-active" : ""} type="button" aria-pressed={quickDatePreset === "none"} onClick={() => setDueDate("")} disabled={!storageAvailable || view === "completed"}>期限なし</button>
                  </div>
                </div>
                <label className="visually-hidden" htmlFor="task-due-date">期限</label>
                <input id="task-due-date" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} disabled={!storageAvailable || view === "completed"} />
                <button type="submit" disabled={!storageAvailable || view === "completed" || !title.trim()}>追加</button>
              </form>
            </div>

            {loading ? <p className="task-empty">読み込み中...</p> : filteredTasks.length === 0 ? <div className="task-empty"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10v4H7zM5 5v16h14V5M8 12h8M8 16h5" /></svg><strong>{searchQuery.trim() ? "一致するタスクはありません" : listFilter === "all" ? "このリストは空です" : "この条件に合うタスクはありません"}</strong><span>{searchQuery.trim() ? "検索条件を変えてもう一度お試しください。" : listFilter === "all" ? "上の入力欄から、次に取り組むことを追加できます。" : "別の絞り込みに切り替えると、ほかのタスクを確認できます。"}</span></div> : (
              <div className="task-list" aria-label="タスク一覧">
                {taskSections.map((section) => (
                  <section className="task-list__section" aria-labelledby={`task-section-${section.key}`} key={section.key}>
                    {taskSections.length > 1 && (
                      <div className="task-list__section-header">
                        <div className="task-list__section-copy">
                          <h4 id={`task-section-${section.key}`}>{section.label}</h4>
                          <span>{section.openCount}件を順に進められます</span>
                        </div>
                        <div className="task-list__section-stats">
                          {section.estimatedPomodoros > 0 && (
                            <FocusMeter
                              label={`${section.label}の集中目安`}
                              completedPomodoros={section.completedPomodoros}
                              estimatedPomodoros={section.estimatedPomodoros}
                            />
                          )}
                          <em>{section.tasks.length}件</em>
                        </div>
                      </div>
                    )}
                    <div className="task-list__section-items">
                      {section.tasks.map((task) => {
                        const project = activeProjects.find((item) => item.id === task.projectId);
                        const label = dueLabel(task, today);
                        const reminder = reminderLabel(task.reminderAt, now);
                        const completedPomodoros = completedPomodorosByTask.get(task.id) ?? 0;
                        const isResumeTarget = showResumeBanner && resumeContext?.taskId === task.id;
                        const isActiveFocusTarget = activeTaskId === task.id && timerStatus !== "idle";
                        return (<div className={`task-list__item${isResumeTarget || isActiveFocusTarget ? " task-list__item--attention" : ""}`} key={task.id} ref={(node) => {
                          if (node) taskRowRefs.current.set(task.id, node);
                          else taskRowRefs.current.delete(task.id);
                        }}>
                          <article className={`task-row${selectedTaskId === task.id ? " is-selected" : ""}`} key={task.id}>
                            <button className="task-row__check" type="button" aria-label={task.status === "completed" ? `${task.title}を未完了に戻す` : `${task.title}を完了`} aria-pressed={task.status === "completed"} onClick={() => void onToggleTask(task.id)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12 4 4 8-9" /></svg></button>
                            <button
                              className="task-row__content"
                              type="button"
                              aria-expanded={selectedTaskId === task.id}
                              aria-controls={`task-editor-${task.id}`}
                              ref={(node) => {
                                if (node) taskContentButtonRefs.current.set(task.id, node);
                                else taskContentButtonRefs.current.delete(task.id);
                              }}
                              onClick={() => setSelectedTaskId((current) => {
                                if (current === task.id) {
                                  focusTaskTrigger(task.id);
                                  return null;
                                }
                                selectedTaskScrollModeRef.current = "nearest";
                                return task.id;
                              })}
                            >
                              <strong>{task.title}</strong>
                              <span className="task-row__meta">
                                {project && taskSections.length === 1 && <span className="task-chip task-chip--project"><i style={{ background: project.color }} />{project.name}</span>}
                                {label && <em className={label.startsWith("期限切れ") ? "is-overdue" : ""}>{label}</em>}
                                {reminder && <em>{reminder}</em>}
                                {(task.estimatedPomodoros > 0 || completedPomodoros > 0) && (
                                  <FocusMeter
                                    label={`${task.title}の集中目安`}
                                    completedPomodoros={completedPomodoros}
                                    estimatedPomodoros={task.estimatedPomodoros}
                                  />
                                )}
                                {isResumeTarget && <em className="task-chip task-chip--resume">次の候補</em>}
                                {activeTaskId === task.id && <em className="task-chip task-chip--active">進行中</em>}
                              </span>
                            </button>
                            <button
                              className={`task-row__start${activeTaskId === task.id ? " is-active" : ""}`}
                              type="button"
                              aria-label={activeTaskId === task.id && timerStatus !== "idle" ? "タイマーへ戻る" : `${task.title}のタイマーを開始`}
                              disabled={activeTaskId !== task.id && (timerStatus !== "idle" || task.status !== "open")}
                              onClick={() => {
                                if (activeTaskId === task.id && timerStatus !== "idle") {
                                  onClose();
                                  return;
                                }
                                onStartTask(task.id);
                              }}
                            ><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 9 6-9 6V6Z" /></svg></button>
                          </article>
                          {selectedTaskId === task.id && selectedTask && selectedTask.status !== "archived" && <div className="task-editor-wrap" id={`task-editor-${selectedTask.id}`}><TaskEditor key={`${selectedTask.id}-${selectedTask.updatedAt}`} task={selectedTask} projects={activeProjects} subtasks={tasks.filter((item) => item.parentTaskId === selectedTask.id && item.status !== "archived").sort((a, b) => a.order - b.order)} timerStatus={timerStatus} activeTaskId={activeTaskId} completedPomodoros={completedPomodoros} onStartTask={onStartTask} onReturnToTimer={() => { setSelectedTaskId(null); onClose(); }} onSave={(patch) => onUpdateTask(selectedTask.id, patch)} onArchive={async () => { const archived = await onArchiveTask(selectedTask.id); if (archived) setSelectedTaskId(null); return archived; }} onAddSubtask={(subtaskTitle) => onAddTask({ title: subtaskTitle, parentTaskId: selectedTask.id, projectId: selectedTask.projectId, bucket: selectedTask.bucket })} onToggleSubtask={onToggleTask} canMoveUp={scopedTasks.findIndex((item) => item.id === selectedTask.id) > 0} canMoveDown={scopedTasks.findIndex((item) => item.id === selectedTask.id) >= 0 && scopedTasks.findIndex((item) => item.id === selectedTask.id) < scopedTasks.length - 1} onMove={(direction) => onMoveTask(selectedTask.id, scopedTasks.map((item) => item.id), direction)} onClose={() => closeTaskDetails(selectedTask.id)} /></div>}
                        </div>);
                      })}
                    </div>
                  </section>
                ))}
              </div>
            )}
            </>}
          </section>
        </div>
      </aside>
    </div>
  );
}
