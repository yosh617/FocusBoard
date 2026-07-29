import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { ProjectRecord } from "../../types/project";
import type { FocusSessionRecord } from "../../types/focusSession";
import type { RepeatRule, TaskDraft, TaskRecord, TaskView } from "../../types/task";
import type { TimerStatus } from "../../types/timer";
import type { ProductivityBackup } from "../../utils/productivityBackup";
import type { ConflictPreference, ImportStrategy } from "../../utils/productivityImport";
import { formatFocusedTime } from "../../utils/productivityReport";
import { getActiveProjects, getTasksForProject, getTasksForView, toLocalDateKey, addLocalDays } from "../../utils/taskQueries";
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

function TaskEditor({ task, projects, subtasks, onSave, onArchive, onAddSubtask, onToggleSubtask, canMoveUp, canMoveDown, onMove, onClose }: {
  task: TaskRecord;
  projects: ProjectRecord[];
  subtasks: TaskRecord[];
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
      <label>タスク名<input value={title} maxLength={200} required onChange={(event) => setTitle(event.target.value)} /></label>
      <div className="task-editor__row">
        <label>プロジェクト<select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">なし</option>{projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label>
        <label>期限<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
      </div>
      <div className="task-editor__row">
        <label>分類<select value={bucket} onChange={(event) => setBucket(event.target.value as TaskRecord["bucket"])}><option value="inbox">Inbox</option><option value="someday">いつか</option></select></label>
        <label>見積もり<input type="number" min="0" max="99" inputMode="numeric" value={estimatedPomodoros} onChange={(event) => setEstimatedPomodoros(Number(event.target.value))} /></label>
      </div>
      <div className="task-editor__row">
        <label>リマインダー<input type="datetime-local" value={reminder} onChange={(event) => setReminder(event.target.value)} /></label>
        <label>繰り返し<select value={repeatType} disabled={!dueDate} onChange={(event) => setRepeatType(event.target.value)}><option value="none">なし</option><option value="daily">毎日</option><option value="weekdays">平日</option><option value="weekly">毎週</option><option value="monthly">毎月</option><option value="custom">カスタム</option></select></label>
      </div>
      {repeatType === "custom" && <div className="task-editor__row"><label>繰り返し間隔<input type="number" min="1" max={customRepeatUnit === "daily" ? 365 : customRepeatUnit === "weekly" ? 52 : 24} value={customRepeatInterval} onChange={(event) => setCustomRepeatInterval(Number(event.target.value))} /></label><label>繰り返し単位<select value={customRepeatUnit} onChange={(event) => setCustomRepeatUnit(event.target.value as typeof customRepeatUnit)}><option value="daily">日ごと</option><option value="weekly">週ごと</option><option value="monthly">月ごと</option></select></label></div>}
      <label>メモ<textarea value={note} maxLength={10_000} rows={4} onChange={(event) => setNote(event.target.value)} /></label>
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
  onImportBackup
}: Props) {
  const [view, setView] = useState<TaskView>("today");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [workspaceMode, setWorkspaceMode] = useState<"tasks" | "report" | "backup">("tasks");
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectColor, setNewProjectColor] = useState(projectColors[0]);
  const [showProjectForm, setShowProjectForm] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const now = new Date();
  const today = toLocalDateKey(now);
  const tomorrow = addLocalDays(today, 1);
  const activeProjects = useMemo(() => getActiveProjects(projects), [projects]);
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
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;
  const todayTasks = useMemo(() => getTasksForView(tasks, "today", today), [tasks, today]);
  const todayOpenTasks = useMemo(
    () => todayTasks.filter((task) => task.parentTaskId === null && task.status === "open").length,
    [todayTasks]
  );
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
  const focusCandidate = activeTaskId
    ? tasks.find((task) => task.id === activeTaskId && task.status === "open") ?? null
    : visibleTasks.find((task) => task.status === "open") ?? null;
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

  if (!open) return null;

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

  const currentListLabel = projectId
    ? activeProjects.find((project) => project.id === projectId)?.name ?? "プロジェクト"
    : views.find((item) => item.value === view)?.label ?? "タスク";
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

  const openTaskDetails = (task: TaskRecord) => {
    setWorkspaceMode("tasks");
    setSelectedTaskId(task.id);
    if (task.projectId && activeProjects.some((project) => project.id === task.projectId)) {
      setProjectId(task.projectId);
      return;
    }
    setProjectId(null);
    setView(getViewForTask(task, today, tomorrow));
  };

  return (
    <div className="task-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="task-drawer" role="dialog" aria-modal="true" aria-labelledby="task-drawer-title" ref={drawerRef}>
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

          <section className={`task-workspace${workspaceMode !== "tasks" ? " task-workspace--standalone" : ""}`} aria-label={workspaceMode === "report" ? "集中レポート" : workspaceMode === "backup" ? "バックアップと復元" : currentListLabel}>
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
                      onClick={() => openTaskDetails(focusCandidate)}
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
            </section>
            <div className="task-workspace__heading">
              <div><p className="eyebrow">MY TASKS</p><h3>{currentListLabel}</h3><span>{visibleTasks.length}件のタスク</span></div>
              <div className="task-search">
                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></svg>
                <label className="visually-hidden" htmlFor="task-search-query">タスクを検索</label>
                <input id="task-search-query" type="search" placeholder="タイトル・メモを検索" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} />
              </div>
            </div>
            {!storageAvailable && <div className="task-callout" role="status"><strong>タスク保存を利用できません</strong><span>時計とタイマーはそのまま使えます。ブラウザのサイトデータ設定を確認してください。</span></div>}
            <form className="task-quick-add" onSubmit={addTask}>
              <div className="task-quick-add__icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg></div>
              <div className="task-quick-add__fields">
                <label className="visually-hidden" htmlFor="task-title">新しいタスク</label>
                <input id="task-title" placeholder="次に取り組むタスクを追加" maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} disabled={!storageAvailable || view === "completed"} />
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

            {loading ? <p className="task-empty">読み込み中...</p> : visibleTasks.length === 0 ? <div className="task-empty"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10v4H7zM5 5v16h14V5M8 12h8M8 16h5" /></svg><strong>{searchQuery.trim() ? "一致するタスクはありません" : "このリストは空です"}</strong><span>{searchQuery.trim() ? "検索条件を変えてもう一度お試しください。" : "上の入力欄から、次に取り組むことを追加できます。"}</span></div> : (
              <div className="task-list" aria-label="タスク一覧">
                {visibleTasks.map((task) => {
                  const project = activeProjects.find((item) => item.id === task.projectId);
                  const label = dueLabel(task, today);
                  const reminder = reminderLabel(task.reminderAt, now);
                  const completedPomodoros = completedPomodorosByTask.get(task.id) ?? 0;
                  return (<div className="task-list__item" key={task.id}>
                    <article className={`task-row${selectedTaskId === task.id ? " is-selected" : ""}`} key={task.id}>
                      <button className="task-row__check" type="button" aria-label={task.status === "completed" ? `${task.title}を未完了に戻す` : `${task.title}を完了`} aria-pressed={task.status === "completed"} onClick={() => void onToggleTask(task.id)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12 4 4 8-9" /></svg></button>
                      <button className="task-row__content" type="button" aria-expanded={selectedTaskId === task.id} aria-controls={`task-editor-${task.id}`} onClick={() => setSelectedTaskId((current) => current === task.id ? null : task.id)}>
                        <strong>{task.title}</strong>
                        <span className="task-row__meta">{project && <span className="task-chip task-chip--project"><i style={{ background: project.color }} />{project.name}</span>}{label && <em className={label.startsWith("期限切れ") ? "is-overdue" : ""}>{label}</em>}{reminder && <em>{reminder}</em>}{(task.estimatedPomodoros > 0 || completedPomodoros > 0) && <em>集中 {completedPomodoros} / {task.estimatedPomodoros || "—"}</em>}{activeTaskId === task.id && <em className="task-chip task-chip--active">進行中</em>}</span>
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
                    {selectedTaskId === task.id && selectedTask && selectedTask.status !== "archived" && <div id={`task-editor-${selectedTask.id}`}><TaskEditor key={`${selectedTask.id}-${selectedTask.updatedAt}`} task={selectedTask} projects={activeProjects} subtasks={tasks.filter((item) => item.parentTaskId === selectedTask.id && item.status !== "archived").sort((a, b) => a.order - b.order)} onSave={(patch) => onUpdateTask(selectedTask.id, patch)} onArchive={async () => { const archived = await onArchiveTask(selectedTask.id); if (archived) setSelectedTaskId(null); return archived; }} onAddSubtask={(subtaskTitle) => onAddTask({ title: subtaskTitle, parentTaskId: selectedTask.id, projectId: selectedTask.projectId, bucket: selectedTask.bucket })} onToggleSubtask={onToggleTask} canMoveUp={scopedTasks.findIndex((item) => item.id === selectedTask.id) > 0} canMoveDown={scopedTasks.findIndex((item) => item.id === selectedTask.id) >= 0 && scopedTasks.findIndex((item) => item.id === selectedTask.id) < scopedTasks.length - 1} onMove={(direction) => onMoveTask(selectedTask.id, scopedTasks.map((item) => item.id), direction)} onClose={() => setSelectedTaskId(null)} /></div>}
                  </div>);
                })}
              </div>
            )}
            </>}
          </section>
        </div>
      </aside>
    </div>
  );
}
