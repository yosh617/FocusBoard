import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import type { ProjectRecord } from "../../types/project";
import type { FocusSessionRecord } from "../../types/focusSession";
import type { RepeatRule, TaskDraft, TaskPriority, TaskRecord, TaskView } from "../../types/task";
import type { TimerStatus } from "../../types/timer";
import type { ProductivityBackup } from "../../utils/productivityBackup";
import type { ConflictPreference, ImportStrategy } from "../../utils/productivityImport";
import { getActiveProjects, getTasksForProject, getTasksForView, sortTasksForFocus, toLocalDateKey, addLocalDays } from "../../utils/taskQueries";
import { ProductivityReport } from "./ProductivityReport";
import { ProductivityBackupPanel } from "./ProductivityBackupPanel";
import { AppCalendar } from "../ui/AppCalendar";
import { AppDateField } from "../ui/AppDateField";
import { AppDateTimeField } from "../ui/AppDateTimeField";
import { AppSelect } from "../ui/AppSelect";

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
  onOpenSettings?: () => void;
  onAddTask: (draft: TaskDraft) => Promise<string | null>;
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

const views: { value: TaskView; label: string }[] = [
  { value: "inbox", label: "Inbox" },
  { value: "today", label: "今日" },
  { value: "tomorrow", label: "明日" },
  { value: "upcoming", label: "今後" },
  { value: "someday", label: "いつか" },
  { value: "completed", label: "完了済み" }
];

const projectColorOptions = [
  { name: "ブルー", value: "#0A84FF" },
  { name: "インディゴ", value: "#4F46E5" },
  { name: "パープル", value: "#7C3AED" },
  { name: "レッド", value: "#FF453A" },
  { name: "オレンジ", value: "#FF9500" },
  { name: "イエロー", value: "#F5B700" },
  { name: "ライム", value: "#84CC16" },
  { name: "グリーン", value: "#30C759" },
  { name: "ティール", value: "#00BFA6" },
  { name: "シアン", value: "#00AEEF" }
] as const;
const quickEstimateOptions = [1, 2, 4];
const quickFocusOptions = [1, 2, 3, 4];
const priorityOptions: { value: TaskPriority; label: string; color: string }[] = [
  { value: "high", label: "高", color: "#FF453A" },
  { value: "medium", label: "中", color: "#FF9500" },
  { value: "low", label: "低", color: "#0A84FF" },
  { value: "none", label: "なし", color: "#8E8E93" }
];

function QuickAddIcon({ type }: { type: "date" | "priority" | "tag" | "project" | "more" }) {
  if (type === "date") return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2M4 12h2M18 12h2M12 4V2" /></svg>;
  if (type === "priority") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 21V4m0 1h10l-2 4 2 4H6" /></svg>;
  if (type === "tag") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h8l8 8-7 7-9-9V5Z" /><circle cx="9" cy="10" r="1" /></svg>;
  if (type === "project") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16v12H4zM7 7V4h10v3" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>;
}

function TagPicker({ selected, suggestions, onChange }: { selected: string[]; suggestions: string[]; onChange: (tags: string[]) => void }) {
  const inputId = useId();
  const [tagName, setTagName] = useState("");
  const toggleTag = (tag: string) => onChange(selected.includes(tag) ? selected.filter((item) => item !== tag) : selected.length < 10 ? [...selected, tag] : selected);
  const addTag = () => {
    const tag = tagName.trim().slice(0, 24);
    if (!tag) return;
    if (!selected.includes(tag) && selected.length < 10) onChange([...selected, tag]);
    setTagName("");
  };
  const options = [...new Set([...selected, ...suggestions])];
  return <div className="task-tag-picker">
    <div className="task-tag-picker__input">
      <label className="visually-hidden" htmlFor={inputId}>新しいタグ名</label>
      <input id={inputId} value={tagName} maxLength={24} placeholder="タグを入力" onChange={(event) => setTagName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addTag(); } }} />
      <button type="button" aria-label="タグを追加" disabled={!tagName.trim() || selected.length >= 10} onClick={addTag}>追加</button>
    </div>
    {options.length > 0 && <div className="task-tag-picker__options" role="group" aria-label="タグを選択">{options.map((tag) => <button className={selected.includes(tag) ? "is-selected" : ""} type="button" aria-pressed={selected.includes(tag)} onClick={() => toggleTag(tag)} key={tag}>#{tag}</button>)}</div>}
  </div>;
}

function isCompactTaskNavigationViewport() {
  try {
    return typeof window.matchMedia === "function" && window.matchMedia("(max-width: 820px)").matches;
  } catch {
    return false;
  }
}

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

function getViewForTask(task: TaskRecord, today: string, tomorrow: string): TaskView {
  if (task.status === "completed") return "completed";
  if (task.dueDate === today) return "today";
  if (task.dueDate === tomorrow) return "tomorrow";
  if (task.dueDate && task.dueDate > tomorrow) return "upcoming";
  if (task.bucket === "someday") return "someday";
  return "inbox";
}

function estimatedFocusTimeLabel(tasks: TaskRecord[], workMinutes: number) {
  const totalMinutes = tasks.reduce((sum, task) => sum + task.estimatedPomodoros * workMinutes, 0);
  return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
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

function TaskEditor({ task, projects, availableTags, subtasks, timerStatus, activeTaskId, nextTask, nextTaskDetail, onStartTask, onOpenNextTask, onReturnToTimer, onSave, onArchive, onToggleStatus, onCompleteAndStartNextTask, onAddSubtask, onToggleSubtask, canMoveUp, canMoveDown, onMove, onClose }: {
  task: TaskRecord;
  projects: ProjectRecord[];
  availableTags: string[];
  subtasks: TaskRecord[];
  timerStatus: TimerStatus;
  activeTaskId: string | null;
  nextTask: TaskRecord | null;
  nextTaskDetail: string;
  onStartTask: (id: string) => void;
  onOpenNextTask?: () => void;
  onReturnToTimer: () => void;
  onSave: (patch: Partial<TaskRecord>) => Promise<boolean>;
  onArchive: () => Promise<boolean>;
  onToggleStatus: () => Promise<boolean>;
  onCompleteAndStartNextTask?: () => Promise<boolean>;
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
  const [priority, setPriority] = useState<TaskPriority>(task.priority ?? "none");
  const [tags, setTags] = useState(task.tags ?? []);
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
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [startingNextTask, setStartingNextTask] = useState(false);
  const [scheduleExpanded, setScheduleExpanded] = useState(task.reminderAt !== null || task.repeatRule !== null);
  const [noteExpanded, setNoteExpanded] = useState(task.note.trim().length > 0);
  const [subtasksExpanded, setSubtasksExpanded] = useState(subtasks.length > 0);
  const isActiveTask = activeTaskId === task.id && timerStatus !== "idle";
  const canStartTask = isActiveTask || (timerStatus === "idle" && task.status === "open");
  const canCompleteAndStartNext = task.status === "open" && timerStatus === "idle" && nextTask !== null && onCompleteAndStartNextTask !== undefined;
  const now = new Date();
  const today = toLocalDateKey(now);
  const reminderSummary = reminder ? reminderLabel(new Date(reminder).getTime(), now) : "通知なし";
  const applyDuePreset = (preset: "today" | "tomorrow" | "week" | "someday") => {
    if (preset === "someday") {
      setDueDate("");
      setBucket("someday");
      return;
    }
    setDueDate(addLocalDays(today, preset === "today" ? 0 : preset === "tomorrow" ? 1 : 7));
    setBucket("inbox");
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    await onSave({
      title,
      projectId: projectId || null,
      dueDate: dueDate || null,
      bucket,
      estimatedPomodoros,
      priority,
      tags,
      note,
      reminderAt: reminder ? new Date(reminder).getTime() : null,
      repeatRule: buildRepeatRule(repeatType, dueDate, customRepeatInterval, customRepeatUnit)
    });
    setSaving(false);
  };

  return (
    <form className="task-editor" onSubmit={submit} aria-label={`${task.title}の詳細`}>
      <div className="task-editor__heading">
        <div className="task-editor__heading-title">
          {onClose && <button className="task-editor__back" type="button" onClick={onClose} aria-label="タスク一覧へ戻る"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg></button>}
          <h3>タスクの設定</h3>
        </div>
        <div className="task-editor__heading-actions"><button className="task-editor__save primary-button" type="submit" disabled={saving} aria-label="保存">{saving ? "保存中" : "変更を保存"}</button></div>
      </div>
      <section className="task-editor__summary" aria-label="タスクの要点">
        <label className="task-editor__title-field">タスク名<span aria-hidden="true">必須</span><input aria-label="タスク名" value={title} maxLength={200} required onChange={(event) => setTitle(event.target.value)} /></label>
        <div className="task-editor__summary-meta"><em className={task.status === "completed" ? "is-completed" : "is-open"}>{task.status === "completed" ? "完了済み" : "未完了"}</em>{priority !== "none" && <em>優先度 {priorityOptions.find((option) => option.value === priority)?.label}</em>}{dueDate && <em>期限 {dueDate}</em>}{estimatedPomodoros > 0 && <em>集中 {estimatedPomodoros}回</em>}{projectId && <em>{projects.find((project) => project.id === projectId)?.name}</em>}{tags.map((tag) => <em key={tag}>#{tag}</em>)}</div>
      </section>
      <section className="task-editor__quick-actions" aria-label="よく使う設定">
        <div className="task-editor__quick-group">
          <span>期限を選ぶ</span>
          <div role="group" aria-label="タスクの期限をすばやく設定">
            {([ ["today", "今日"], ["tomorrow", "明日"], ["week", "7日後"], ["someday", "いつか"] ] as const).map(([preset, label]) => <button type="button" aria-pressed={preset === "someday" ? bucket === "someday" && !dueDate : dueDate === addLocalDays(today, preset === "today" ? 0 : preset === "tomorrow" ? 1 : 7) && bucket === "inbox"} className={(preset === "someday" ? bucket === "someday" && !dueDate : dueDate === addLocalDays(today, preset === "today" ? 0 : preset === "tomorrow" ? 1 : 7) && bucket === "inbox") ? "is-active" : ""} onClick={() => applyDuePreset(preset)} key={preset}>{label}</button>)}
          </div>
        </div>
        <div className="task-editor__quick-group">
          <span>集中回数を選ぶ</span>
          <div role="group" aria-label="集中回数をすばやく設定">
            {[0, ...quickEstimateOptions].map((value) => <button type="button" aria-pressed={estimatedPomodoros === value} className={estimatedPomodoros === value ? "is-active" : ""} onClick={() => setEstimatedPomodoros(value)} key={value}>{value === 0 ? "なし" : value}</button>)}
          </div>
        </div>
      </section>
      <div className="task-editor__focus">
        <div>
          <strong>{task.status === "completed" ? "完了済みの状態です" : isActiveTask ? "いまの集中へ戻る" : "このタスクを始める"}</strong>
          <span>{task.status === "completed" ? "再開するときは、右のボタンで未完了に戻してから始められます。" : canCompleteAndStartNext ? `${nextTask?.title}へそのまま切り替える流れも選べます。` : isActiveTask ? "詳細を閉じて、進行中のタイマー表示へ戻ります。" : "保存せずに、そのまま集中タイマーを開始できます。"}</span>
        </div>
        <div className="task-editor__focus-actions">
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
          <button
            className="secondary-button"
            type="button"
            disabled={togglingStatus || startingNextTask}
            aria-label={task.status === "completed" ? `${task.title}を詳細から未完了に戻す` : `${task.title}を詳細から完了`}
            onClick={async () => {
              setTogglingStatus(true);
              await onToggleStatus();
              setTogglingStatus(false);
            }}
          >
            {togglingStatus ? "更新中" : task.status === "completed" ? "未完了に戻す" : "完了にする"}
          </button>
          {canCompleteAndStartNext && (
            <button
              className="secondary-button"
              type="button"
              disabled={togglingStatus || startingNextTask}
              aria-label={`${task.title}を完了して${nextTask.title}を開始`}
              onClick={async () => {
                setStartingNextTask(true);
                await onCompleteAndStartNextTask();
                setStartingNextTask(false);
              }}
            >
              {startingNextTask ? "切り替え中" : "完了して次を開始"}
            </button>
          )}
        </div>
      </div>
      {canCompleteAndStartNext && (
        <section className="task-editor__next-card" aria-label="次に進む候補">
          <div className="task-editor__next-card-copy">
            <span>NEXT</span>
            <strong>{nextTask.title}</strong>
            <p>{nextTaskDetail ? `${nextTaskDetail} に進めます。` : "このあとすぐ取りかかれる候補です。"}</p>
          </div>
          {onOpenNextTask && (
            <button
              className="task-editor__next-card-action"
              type="button"
              aria-label={`${nextTask.title}の候補を詳細で見る`}
              onClick={onOpenNextTask}
            >
              候補を見る
            </button>
          )}
        </section>
      )}
      <section className="task-editor__section" aria-labelledby={`task-plan-${task.id}`}>
        <div className="task-editor__section-heading">
          <div>
            <h4 id={`task-plan-${task.id}`}>基本情報</h4>
          </div>
        </div>
        <div className="task-editor__row">
          <AppSelect
            id={`task-${task.id}-project`}
            label="プロジェクト"
            value={projectId}
            options={[{ value: "", label: "なし" }, ...projects.map((project) => ({ value: project.id, label: project.name }))]}
            onChange={setProjectId}
          />
          <AppDateField id={`task-${task.id}-due-date`} label="期限" value={dueDate} today={today} onChange={setDueDate} />
        </div>
        <div className="task-editor__priority" role="radiogroup" aria-label="タスクの優先度">{priorityOptions.map((option) => <button className={priority === option.value ? "is-active" : ""} type="button" role="radio" aria-checked={priority === option.value} onClick={() => setPriority(option.value)} key={option.value}><span style={{ color: option.color }}><QuickAddIcon type="priority" /></span>{option.label}</button>)}</div>
        <div className="task-editor__tags"><span>タグ</span><TagPicker selected={tags} suggestions={availableTags} onChange={setTags} /></div>
      </section>
      <section className="task-editor__section" aria-labelledby={`task-focus-${task.id}`}>
        <div className="task-editor__section-heading">
          <div>
            <h4 id={`task-focus-${task.id}`}>集中の準備</h4>
          </div>
        </div>
        <div className="task-editor__row">
          <AppSelect
            id={`task-${task.id}-bucket`}
            label="分類"
            value={bucket}
            options={[{ value: "inbox", label: "Inbox" }, { value: "someday", label: "いつか" }]}
            onChange={(value) => setBucket(value as TaskRecord["bucket"])}
          />
          <label>見積もり<input type="number" min="0" max="99" inputMode="numeric" value={estimatedPomodoros} onChange={(event) => setEstimatedPomodoros(Number(event.target.value))} /></label>
        </div>
      </section>
      <details className="task-editor__details" style={{ overflow: "visible" }} open={scheduleExpanded} onToggle={(event) => setScheduleExpanded((event.currentTarget as HTMLDetailsElement).open)}>
        <summary>
          <span>通知と繰り返し</span>
          <strong>{repeatType === "none" ? reminderSummary : `${reminderSummary} ・ ${repeatType === "custom" ? `${customRepeatInterval}${customRepeatUnit === "daily" ? "日" : customRepeatUnit === "weekly" ? "週" : "か月"}ごと` : repeatType === "daily" ? "毎日" : repeatType === "weekdays" ? "平日" : repeatType === "weekly" ? "毎週" : "毎月"}`}</strong>
        </summary>
        <div className="task-editor__details-body">
          <div className="task-editor__row">
            <AppDateTimeField id={`task-${task.id}-reminder`} label="リマインダー" value={reminder} today={today} onChange={setReminder} />
            <AppSelect
              id={`task-${task.id}-repeat`}
              label="繰り返し"
              value={repeatType}
              disabled={!dueDate}
              options={[{ value: "none", label: "なし" }, { value: "daily", label: "毎日" }, { value: "weekdays", label: "平日" }, { value: "weekly", label: "毎週" }, { value: "monthly", label: "毎月" }, { value: "custom", label: "カスタム" }]}
              onChange={setRepeatType}
            />
          </div>
          {repeatType === "custom" && <div className="task-editor__row"><label>繰り返し間隔<input type="number" min="1" max={customRepeatUnit === "daily" ? 365 : customRepeatUnit === "weekly" ? 52 : 24} value={customRepeatInterval} onChange={(event) => setCustomRepeatInterval(Number(event.target.value))} /></label><AppSelect id={`task-${task.id}-repeat-unit`} label="繰り返し単位" value={customRepeatUnit} options={[{ value: "daily", label: "日ごと" }, { value: "weekly", label: "週ごと" }, { value: "monthly", label: "月ごと" }]} onChange={(value) => setCustomRepeatUnit(value as typeof customRepeatUnit)} /></div>}
        </div>
      </details>
      <details className="task-editor__details" open={noteExpanded} onToggle={(event) => setNoteExpanded((event.currentTarget as HTMLDetailsElement).open)}>
        <summary>
          <span>メモ</span>
          <strong>{note.trim() ? `${Math.min(note.trim().length, 40)}文字のメモ` : "まだ追加していません"}</strong>
        </summary>
        <div className="task-editor__details-body">
          <label>メモ<textarea value={note} maxLength={10_000} rows={4} onChange={(event) => setNote(event.target.value)} /></label>
        </div>
      </details>
      <details className="task-editor__details subtask-editor" open={subtasksExpanded} onToggle={(event) => setSubtasksExpanded((event.currentTarget as HTMLDetailsElement).open)}>
        <summary>
          <span>サブタスク</span>
          <strong>{subtasks.length > 0 ? `${subtasks.length}件` : "まだありません"}</strong>
        </summary>
        <div className="task-editor__details-body">
          {subtasks.length > 0 && <div className="subtask-list">{subtasks.map((subtask) => <button type="button" aria-pressed={subtask.status === "completed"} onClick={() => void onToggleSubtask(subtask.id)} key={subtask.id}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12 4 4 8-9" /></svg><span>{subtask.title}</span></button>)}</div>}
          <div className="subtask-add"><label className="visually-hidden" htmlFor={`subtask-title-${task.id}`}>サブタスク名</label><input id={`subtask-title-${task.id}`} value={subtaskTitle} maxLength={200} placeholder="小さな手順を追加" onChange={(event) => setSubtaskTitle(event.target.value)} /><button type="button" disabled={!subtaskTitle.trim()} onClick={async () => { if (await onAddSubtask(subtaskTitle)) setSubtaskTitle(""); }}>追加</button></div>
        </div>
      </details>
      <div className="task-editor__actions">
        <button className="danger-button" type="button" onClick={() => { if (window.confirm(`${task.title}をアーカイブしますか？`)) void onArchive(); }}>アーカイブ</button>
        <div className="task-editor__move"><button className="secondary-button" type="button" disabled={!canMoveUp} onClick={() => void onMove(-1)}>前へ</button><button className="secondary-button" type="button" disabled={!canMoveDown} onClick={() => void onMove(1)}>後へ</button></div>
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
  onOpenSettings = () => undefined,
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
  const [quickEstimatedPomodoros, setQuickEstimatedPomodoros] = useState(0);
  const [quickPriority, setQuickPriority] = useState<TaskPriority>("none");
  const [quickTags, setQuickTags] = useState<string[]>([]);
  const [quickProjectId, setQuickProjectId] = useState<string | null>(null);
  const [quickPanel, setQuickPanel] = useState<"date" | "priority" | "tag" | "project" | "estimate" | null>(null);
  const [returnFocusToQuickAdd, setReturnFocusToQuickAdd] = useState(false);
  const [listFilter, setListFilter] = useState<TaskListFilter>("all");
  const [workspaceMode, setWorkspaceMode] = useState<"tasks" | "report" | "backup">("tasks");
  const [navigationCollapsed, setNavigationCollapsed] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectColor, setNewProjectColor] = useState<string>(projectColorOptions[0].value);
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [showResumeBanner, setShowResumeBanner] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const navigationHeadingRef = useRef<HTMLHeadingElement>(null);
  const workspaceRef = useRef<HTMLElement>(null);
  const quickAddInputRef = useRef<HTMLInputElement>(null);
  const taskRowRefs = useRef(new Map<string, HTMLDivElement>());
  const taskContentButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const pendingTaskFocusIdRef = useRef<string | null>(null);
  const appliedResumeTaskIdRef = useRef<string | null>(null);
  const selectedTaskScrollModeRef = useRef<"nearest" | "start">("nearest");
  const now = new Date();
  const today = toLocalDateKey(now);
  const tomorrow = addLocalDays(today, 1);
  const activeProjects = useMemo(() => getActiveProjects(projects), [projects]);
  const availableTags = useMemo(() => [...new Set(tasks.flatMap((task) => task.tags ?? []))].sort((left, right) => left.localeCompare(right, "ja")), [tasks]);
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
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;
  const filteredTasks = useMemo(() => {
    if (listFilter === "all") return scopedTasks;
    if (listFilter === "overdue") return scopedTasks.filter((task) => task.dueDate !== null && task.dueDate < today);
    if (listFilter === "reminders") return scopedTasks.filter((task) => task.reminderAt !== null);
    return scopedTasks.filter((task) => activeTaskId === task.id || task.estimatedPomodoros > 0 || (completedPomodorosByTask.get(task.id) ?? 0) > 0);
  }, [activeTaskId, completedPomodorosByTask, listFilter, scopedTasks, today]);
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

    const overdueTodayTasks = view === "today"
      ? filteredTasks.filter((task) => task.dueDate !== null && task.dueDate < today)
      : [];
    const groupedTasks = view === "today"
      ? filteredTasks.filter((task) => task.dueDate === null || task.dueDate >= today)
      : filteredTasks;
    const sections = new Map<string, TaskListSection>();
    for (const task of groupedTasks) {
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

    const sortedSections = [...sections.values()].sort((left, right) => {
      if (left.color && right.color) {
        const leftProject = activeProjects.find((project) => project.id === left.key);
        const rightProject = activeProjects.find((project) => project.id === right.key);
        if (leftProject && rightProject) return leftProject.order - rightProject.order || leftProject.createdAt - rightProject.createdAt;
      }
      if (left.color) return -1;
      if (right.color) return 1;
      return left.label.localeCompare(right.label, "ja");
    });
    if (overdueTodayTasks.length > 0) sortedSections.push({
      key: "today-overdue",
      label: "期限切れ",
      color: "#FF453A",
      tasks: overdueTodayTasks,
      openCount: overdueTodayTasks.length,
      completedPomodoros: overdueTodayTasks.reduce((sum, task) => sum + (completedPomodorosByTask.get(task.id) ?? 0), 0),
      estimatedPomodoros: overdueTodayTasks.reduce((sum, task) => sum + task.estimatedPomodoros, 0)
    });
    return sortedSections;
  }, [activeProjects, completedPomodorosByTask, currentListLabel, currentProject, filteredTasks, projectId, today, view]);
  const filterCounts = useMemo(() => ({
    all: scopedTasks.length,
    overdue: scopedTasks.filter((task) => task.dueDate !== null && task.dueDate < today).length,
    reminders: scopedTasks.filter((task) => task.reminderAt !== null).length,
    focus: scopedTasks.filter((task) => activeTaskId === task.id || task.estimatedPomodoros > 0 || (completedPomodorosByTask.get(task.id) ?? 0) > 0).length
  }), [activeTaskId, completedPomodorosByTask, scopedTasks, today]);
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
    if (!open || workspaceMode !== "tasks") return;
    setNavigationCollapsed(false);
  }, [open, workspaceMode]);

  useEffect(() => {
    if (!returnFocusToQuickAdd) return;
    quickAddInputRef.current?.focus();
    setReturnFocusToQuickAdd(false);
  }, [returnFocusToQuickAdd]);

  useEffect(() => {
    if (!selectedTaskId) return;
    if (!scopedTasks.some((task) => task.id === selectedTaskId)) {
      setSelectedTaskId(null);
      return;
    }
    if (!filteredTasks.some((task) => task.id === selectedTaskId)) setSelectedTaskId(null);
  }, [filteredTasks, scopedTasks, selectedTaskId]);

  useEffect(() => {
    const taskId = pendingTaskFocusIdRef.current;
    if (selectedTaskId !== null || taskId === null) return;
    pendingTaskFocusIdRef.current = null;
    window.setTimeout(() => taskContentButtonRefs.current.get(taskId)?.focus(), 0);
  }, [selectedTaskId]);

  useEffect(() => {
    setShowResumeBanner(open && toolbarContext !== null);
  }, [open, toolbarContext]);

  const addTask = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!title.trim()) return;
    const defaultDueDate = view === "today" ? today : view === "tomorrow" ? addLocalDays(today, 1) : null;
    const addedTaskId = await onAddTask({
      title: title.trim(),
      dueDate: dueDate || defaultDueDate,
      projectId: quickProjectId === null ? projectId : quickProjectId || null,
      bucket: view === "someday" ? "someday" : "inbox",
      estimatedPomodoros: quickEstimatedPomodoros,
      priority: quickPriority,
      tags: quickTags
    });
    if (addedTaskId) {
      setTitle("");
      setDueDate("");
      setQuickEstimatedPomodoros(0);
      setQuickPriority("none");
      setQuickTags([]);
      setQuickProjectId(null);
      setQuickPanel(null);
      setReturnFocusToQuickAdd(true);
    }
  };

  const addProject = async (event: FormEvent) => {
    event.preventDefault();
    if (await onAddProject(newProjectName, newProjectColor)) {
      setNewProjectName("");
      setNewProjectColor(projectColorOptions[0].value);
      setShowProjectForm(false);
    }
  };

  const collapseNavigationIfCompact = useCallback(() => {
    if (!isCompactTaskNavigationViewport()) return;
    setNavigationCollapsed(true);
    window.setTimeout(() => workspaceRef.current?.focus(), 0);
  }, []);

  const openTaskNavigation = () => {
    setSelectedTaskId(null);
    setQuickPanel(null);
    setNavigationCollapsed(false);
    window.setTimeout(() => navigationHeadingRef.current?.focus(), 0);
  };

  const quickAddProjectId = quickProjectId === null ? projectId : quickProjectId || null;
  const openTaskDetails = useCallback((task: TaskRecord, options?: { revealInList?: boolean }) => {
    if (options?.revealInList) {
      setListFilter("all");
      selectedTaskScrollModeRef.current = "start";
    } else {
      selectedTaskScrollModeRef.current = "nearest";
    }
    setWorkspaceMode("tasks");
    collapseNavigationIfCompact();
    setSelectedTaskId(task.id);
    if (task.projectId && activeProjects.some((project) => project.id === task.projectId)) {
      setProjectId(task.projectId);
      return;
    }
    setProjectId(null);
    setView(getViewForTask(task, today, tomorrow));
  }, [activeProjects, collapseNavigationIfCompact, today, tomorrow]);
  const closeTaskDetails = (taskId: string) => {
    pendingTaskFocusIdRef.current = taskId;
    setSelectedTaskId(null);
  };
  const selectedTaskNextCandidate = selectedTask
    ? sortTasksForFocus(tasks, today, activeTaskId).find((task) => task.id !== selectedTask.id) ?? null
    : null;
  const selectedTaskNextCandidateProject = selectedTaskNextCandidate?.projectId
    ? activeProjects.find((project) => project.id === selectedTaskNextCandidate.projectId) ?? null
    : null;
  const selectedTaskNextCandidateDetail = selectedTaskNextCandidate ? [
    selectedTaskNextCandidateProject?.name ?? null,
    dueLabel(selectedTaskNextCandidate, today) || null,
    selectedTaskNextCandidate.estimatedPomodoros > 0 ? `目安 ${selectedTaskNextCandidate.estimatedPomodoros}セット` : null
  ].filter((item): item is string => item !== null).join(" ・ ") : "";
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
  }, [open, openTaskDetails, resumeContext, tasks]);

  useEffect(() => {
    if (!open || !selectedTaskId) return;
    const target = taskRowRefs.current.get(selectedTaskId);
    if (!target) return;
    let prefersReducedMotion: boolean;
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
          <div><h2 id="task-drawer-title">タスク管理</h2></div>
          <div className="task-drawer__header-actions">
            {notificationPermission === "default" && <button className="task-header-action" type="button" onClick={() => void onRequestNotification()}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7M10 20h4" /></svg><span>通知を許可</span></button>}
            {canUndo && <button className="task-header-action" type="button" onClick={() => void onUndo()}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 7-5 5 5 5M5 12h8a6 6 0 0 1 6 6" /></svg><span>元に戻す</span></button>}
            <button
              className={`task-header-action${workspaceMode === "backup" ? " is-active" : ""}`}
              type="button"
              aria-pressed={workspaceMode === "backup"}
              onClick={() => setWorkspaceMode((current) => current === "backup" ? "tasks" : "backup")}
            >
              <WorkspaceIcon type="backup" />
              <span>データ管理</span>
            </button>
            <button className="panel-switch-button" type="button" onClick={() => onOpenSettings()} aria-label="設定を開く"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.3a3.3 3.3 0 1 0 0-6.6 3.3 3.3 0 0 0 0 6.6Z" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></svg><span>設定</span></button>
            <button className="icon-button" type="button" onClick={onClose} ref={closeRef} aria-label="タスクを閉じる"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" /></svg></button>
          </div>
        </header>

        <nav className="task-mode-tabs" aria-label="作業ビュー">
          <button type="button" className={workspaceMode === "tasks" ? "is-active" : ""} aria-current={workspaceMode === "tasks" ? "page" : undefined} onClick={() => setWorkspaceMode("tasks")}><WorkspaceIcon type="tasks" /><span>タスク</span></button>
          <button type="button" className={workspaceMode === "report" ? "is-active" : ""} aria-current={workspaceMode === "report" ? "page" : undefined} onClick={() => setWorkspaceMode("report")}><WorkspaceIcon type="report" /><span>レポート</span></button>
        </nav>

        <div className={`task-drawer__body task-drawer__body--${workspaceMode}${workspaceMode === "tasks" && !navigationCollapsed ? " is-navigation-open" : ""}`}>
          {workspaceMode === "tasks" && <nav className={`task-navigation${navigationCollapsed ? " is-collapsed" : ""}`} aria-label="タスク一覧">
            {!navigationCollapsed && <div className="task-navigation__content" id="task-navigation-content">
              <header className="task-navigation__screen-heading">
                <span>タスク</span>
                <h3 ref={navigationHeadingRef} tabIndex={-1}>表示先を選ぶ</h3>
                <p>リストまたはプロジェクトを選択してください。</p>
              </header>
              <p className="task-navigation__label">リストを選択</p>
              <div className="task-navigation__views">
                {views.map((item) => {
                  const estimatedTime = estimatedFocusTimeLabel(getTasksForView(tasks, item.value, today), workMinutes);
                  return <button type="button" className={!projectId && view === item.value ? "is-active" : ""} aria-current={!projectId && view === item.value ? "page" : undefined} onClick={() => { setProjectId(null); setView(item.value); setSelectedTaskId(null); setWorkspaceMode("tasks"); collapseNavigationIfCompact(); }} key={item.value}><span>{item.label}</span><strong>{estimatedTime}</strong></button>;
                })}
              </div>
              <div className="task-navigation__projects">
                <div className="task-navigation__projects-heading"><h3>プロジェクト</h3><button type="button" aria-expanded={showProjectForm} onClick={() => setShowProjectForm((current) => !current)}>{showProjectForm ? "閉じる" : "新規"}</button></div>
                {activeProjects.map((project) => (
                  <div className={projectId === project.id ? "project-link is-active" : "project-link"} key={project.id}>
                    <button type="button" onClick={() => { setProjectId(project.id); setSelectedTaskId(null); setWorkspaceMode("tasks"); collapseNavigationIfCompact(); }}><i style={{ background: project.color }} /><span>{project.name}</span><strong>{estimatedFocusTimeLabel(getTasksForProject(tasks, project.id), workMinutes)}</strong></button>
                    <button type="button" aria-label={`${project.name}をアーカイブ`} onClick={() => { if (window.confirm(`${project.name}をアーカイブし、タスクをInboxへ移しますか？`)) void onArchiveProject(project.id); }}>×</button>
                  </div>
                ))}
                {showProjectForm && <form className="project-add" onSubmit={addProject}>
                  <input aria-label="新しいプロジェクト名" placeholder="プロジェクトを追加" maxLength={80} value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} disabled={!storageAvailable} />
                  <button className="project-add__submit" type="submit" aria-label="プロジェクトを追加" disabled={!storageAvailable || !newProjectName.trim()}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg></button>
                  <div className="project-add__palette" role="group" aria-label="プロジェクトの色を選択">
                    {projectColorOptions.map((color) => {
                      const selected = newProjectColor === color.value;
                      return <button className={selected ? "is-selected" : ""} type="button" aria-label={color.name} aria-pressed={selected} disabled={!storageAvailable} onClick={() => setNewProjectColor(color.value)} key={color.value}>
                        <span style={{ backgroundColor: color.value }} />
                        {selected && <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>}
                      </button>;
                    })}
                  </div>
                </form>}
              </div>
            </div>}
          </nav>}

          <section ref={workspaceRef} className={`task-workspace${workspaceMode !== "tasks" ? " task-workspace--standalone" : ""}${workspaceMode === "tasks" && (!selectedTask || selectedTask.status === "archived") ? " task-workspace--list" : ""}`} id="task-workspace-main" tabIndex={-1} aria-label={workspaceMode === "report" ? "集中レポート" : workspaceMode === "backup" ? "バックアップと復元" : currentListLabel}>
            {workspaceMode === "report" ? <ProductivityReport tasks={tasks} sessions={sessions} workMinutes={workMinutes} /> : workspaceMode === "backup" ? <ProductivityBackupPanel tasks={tasks} projects={projects} sessions={sessions} storageAvailable={storageAvailable} onImport={onImportBackup} /> : selectedTask && selectedTask.status !== "archived" ? <div className="task-editor-screen"><TaskEditor key={`${selectedTask.id}-${selectedTask.updatedAt}`} task={selectedTask} projects={activeProjects} availableTags={availableTags} subtasks={tasks.filter((item) => item.parentTaskId === selectedTask.id && item.status !== "archived").sort((a, b) => a.order - b.order)} timerStatus={timerStatus} activeTaskId={activeTaskId} nextTask={selectedTaskNextCandidate} nextTaskDetail={selectedTaskNextCandidateDetail} onStartTask={onStartTask} onOpenNextTask={selectedTaskNextCandidate ? () => openTaskDetails(selectedTaskNextCandidate, { revealInList: true }) : undefined} onReturnToTimer={() => { setSelectedTaskId(null); onClose(); }} onSave={(patch) => onUpdateTask(selectedTask.id, patch)} onArchive={async () => { const archived = await onArchiveTask(selectedTask.id); if (archived) setSelectedTaskId(null); return archived; }} onToggleStatus={async () => { const toggled = await onToggleTask(selectedTask.id); if (toggled) closeTaskDetails(selectedTask.id); return toggled; }} onCompleteAndStartNextTask={selectedTaskNextCandidate ? async () => { const toggled = await onToggleTask(selectedTask.id); if (!toggled) return false; onStartTask(selectedTaskNextCandidate.id); return true; } : undefined} onAddSubtask={async (subtaskTitle) => (await onAddTask({ title: subtaskTitle, parentTaskId: selectedTask.id, projectId: selectedTask.projectId, bucket: selectedTask.bucket })) !== null} onToggleSubtask={onToggleTask} canMoveUp={scopedTasks.findIndex((item) => item.id === selectedTask.id) > 0} canMoveDown={scopedTasks.findIndex((item) => item.id === selectedTask.id) >= 0 && scopedTasks.findIndex((item) => item.id === selectedTask.id) < scopedTasks.length - 1} onMove={(direction) => onMoveTask(selectedTask.id, scopedTasks.map((item) => item.id), direction)} onClose={() => closeTaskDetails(selectedTask.id)} /></div> : <>
            <div className="task-workspace__scroll">
            <div className="task-workspace__toolbar">
              <div className="task-workspace__heading">
                <div><button className="task-workspace__destination-button" type="button" onClick={openTaskNavigation}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5-7 7 7 7" /></svg><span>表示先を選ぶ</span></button><h3>{currentListLabel}</h3><span>{filteredTasks.length}件のタスク</span></div>
              </div>
              {view !== "completed" && <form className="task-quick-add task-capture" id="task-quick-add-form" onSubmit={addTask}>
                <div className="task-capture__title"><span aria-hidden="true">＋</span><label className="visually-hidden" htmlFor="task-title">新しいタスク</label><input id="task-title" ref={quickAddInputRef} placeholder="タスクを追加…" maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} disabled={!storageAvailable} /></div>
              </form>}
              {showResumeBanner && toolbarContext && (
                <section className="task-inline-context" aria-label="一覧へ戻ったあとの案内">
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
              {!projectId && view === "inbox" && <div className="task-list-filters" role="group" aria-label="表示するタスクを絞り込む">
                <button className={listFilter === "all" ? "is-active" : ""} type="button" aria-pressed={listFilter === "all"} onClick={() => setListFilter("all")}><span>すべて</span><strong>{filterCounts.all}</strong></button>
                <button className={listFilter === "overdue" ? "is-active" : ""} type="button" aria-pressed={listFilter === "overdue"} onClick={() => setListFilter("overdue")}><span>期限切れ</span><strong>{filterCounts.overdue}</strong></button>
                <button className={listFilter === "reminders" ? "is-active" : ""} type="button" aria-pressed={listFilter === "reminders"} onClick={() => setListFilter("reminders")}><span>通知</span><strong>{filterCounts.reminders}</strong></button>
                <button className={listFilter === "focus" ? "is-active" : ""} type="button" aria-label={`集中目安 ${filterCounts.focus}`} aria-pressed={listFilter === "focus"} onClick={() => setListFilter("focus")}><span>集中</span><strong>{filterCounts.focus}</strong></button>
              </div>}
              {!storageAvailable && <div className="task-callout" role="status"><strong>タスク保存を利用できません</strong><span>時計とタイマーはそのまま使えます。ブラウザのサイトデータ設定を確認してください。</span></div>}
            </div>

            {loading ? <p className="task-empty">読み込み中...</p> : filteredTasks.length === 0 ? <div className="task-empty"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5.5h14v14H5zM8 3.5h8M8 10h8M8 14h5" /></svg><strong>{listFilter === "all" ? "タスクはありません" : "該当するタスクはありません"}</strong><span>{listFilter === "all" ? "上の入力欄から追加できます。" : "絞り込みを変更してください。"}</span></div> : (
              <div className="task-list" aria-label="タスク一覧">
                {taskSections.map((section) => (
                  <section className="task-list__section" aria-labelledby={`task-section-${section.key}`} key={section.key}>
                    {(taskSections.length > 1 || section.key === "today-overdue") && (
                      <div className="task-list__section-header">
                        <div className="task-list__section-copy">
                          <h4 id={`task-section-${section.key}`}>{section.label}</h4>
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
                    {section.tasks.map((task, taskIndex) => {
                        const project = activeProjects.find((item) => item.id === task.projectId);
                        const label = dueLabel(task, today);
                        const reminder = reminderLabel(task.reminderAt, now);
                        const completedPomodoros = completedPomodorosByTask.get(task.id) ?? 0;
                        const isResumeTarget = showResumeBanner && resumeContext?.taskId === task.id;
                        const isActiveFocusTarget = activeTaskId === task.id && timerStatus !== "idle";
                        const rowStateLabel: string | null = isActiveFocusTarget
                          ? "進行中"
                          : isResumeTarget
                            ? "戻る先"
                            : task.status === "completed"
                              ? "完了済み"
                              : label.startsWith("期限切れ")
                                ? "先に片づける"
                                : taskIndex === 0
                                  ? "次に集中"
                                  : reminder
                                    ? "通知あり"
                                    : null;
                        const rowStateTone = isActiveFocusTarget
                          ? "active"
                          : label.startsWith("期限切れ")
                            ? "alert"
                            : taskIndex === 0 || isResumeTarget
                              ? "focus"
                              : "default";
                        return (<div className={`task-list__item${isResumeTarget || isActiveFocusTarget ? " task-list__item--attention" : ""}`} key={task.id} ref={(node) => {
                          if (node) taskRowRefs.current.set(task.id, node);
                          else taskRowRefs.current.delete(task.id);
                        }}>
                          <article className={`task-row${selectedTaskId === task.id ? " is-selected" : ""}`} key={task.id}>
                            <button className="task-row__check" type="button" aria-label={task.status === "completed" ? `${task.title}を未完了に戻す` : `${task.title}を完了`} aria-pressed={task.status === "completed"} onClick={() => void onToggleTask(task.id)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12 4 4 8-9" /></svg></button>
                            <button
                              className="task-row__content"
                              type="button"
                              aria-expanded="false"
                              ref={(node) => {
                                if (node) taskContentButtonRefs.current.set(task.id, node);
                                else taskContentButtonRefs.current.delete(task.id);
                              }}
                              onClick={() => {
                                selectedTaskScrollModeRef.current = "nearest";
                                openTaskDetails(task);
                              }}
                            >
                              {rowStateLabel && <span className="task-row__eyebrow"><em className={`task-chip task-chip--state task-chip--${rowStateTone}`}>{rowStateLabel}</em></span>}
                              <strong>{task.priority && task.priority !== "none" && <span className="task-row__priority" style={{ color: priorityOptions.find((option) => option.value === task.priority)?.color }} aria-label={`優先度 ${priorityOptions.find((option) => option.value === task.priority)?.label}`}><QuickAddIcon type="priority" /></span>}{task.title}</strong>
                              <span className="task-row__meta">
                                {project && taskSections.length === 1 && <span className="task-chip task-chip--project"><i style={{ background: project.color }} />{project.name}</span>}
                                {label && <em className={label.startsWith("期限切れ") ? "is-overdue" : ""}>{label}</em>}
                                {reminder && <em>{reminder}</em>}
                                {(task.tags ?? []).map((tag) => <em className="task-chip task-chip--tag" key={tag}>#{tag}</em>)}
                                {(task.estimatedPomodoros > 0 || completedPomodoros > 0) && (
                                  <FocusMeter
                                    label={`${task.title}の集中目安`}
                                    completedPomodoros={completedPomodoros}
                                    estimatedPomodoros={task.estimatedPomodoros}
                                  />
                                )}
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
                            >
                              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 9 6-9 6V6Z" /></svg>
                              <span>{activeTaskId === task.id && timerStatus !== "idle" ? "戻る" : "開始"}</span>
                            </button>
                          </article>
                        </div>);
                      })}
                    </div>
                  </section>
                ))}
              </div>
            )}
            </div>
            {view !== "completed" && (
              <section className="task-capture__settings" aria-labelledby="task-capture-settings-heading">
                <h4 id="task-capture-settings-heading" className="task-capture__settings-heading">設定</h4>
                <div className="task-capture__estimate" aria-label="ポモドーロの予定数">
                  <span>予定数</span>
                  <div role="group" aria-label="追加するタスクの集中回数">
                    {quickFocusOptions.map((value) => <button className={quickEstimatedPomodoros === value ? "is-active" : ""} type="button" aria-pressed={quickEstimatedPomodoros === value} aria-label={`${value}回`} onClick={() => { setQuickEstimatedPomodoros(value); setQuickPanel(null); }} key={value}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="7" /><path d="M9 3h6M12 9v4l3 2" /></svg><strong>{value}</strong></button>)}
                    <button className={quickPanel === "estimate" || quickEstimatedPomodoros >= 5 ? "is-active" : ""} type="button" aria-expanded={quickPanel === "estimate"} aria-label="5回以上を設定" onClick={() => setQuickPanel((current) => current === "estimate" ? null : "estimate")}><QuickAddIcon type="more" /></button>
                  </div>
                </div>
                {quickPanel === "estimate" && <div className="task-capture__estimate-slider"><label htmlFor="quick-estimate-range">予定数 <output>{Math.max(5, quickEstimatedPomodoros)}回</output></label><input id="quick-estimate-range" type="range" min="5" max="20" step="1" value={Math.max(5, quickEstimatedPomodoros)} onChange={(event) => setQuickEstimatedPomodoros(Number(event.target.value))} /></div>}
                <div className="task-capture__toolbar">
                  <button className={dueDate ? "is-active" : ""} type="button" aria-label={dueDate ? `期限 ${dueDate}。もう一度押して変更` : "期限を今日に設定"} aria-expanded={quickPanel === "date"} onClick={() => { if (!dueDate) { setDueDate(today); setQuickPanel(null); } else setQuickPanel((current) => current === "date" ? null : "date"); }}><QuickAddIcon type="date" /><span>{dueDate === today ? "今日" : dueDate ? dueDate.slice(5).replace("-", "/") : "期限"}</span></button>
                  <button className={quickPriority !== "none" ? "is-active" : ""} type="button" aria-label={`優先度 ${priorityOptions.find((option) => option.value === quickPriority)?.label}`} aria-expanded={quickPanel === "priority"} onClick={() => setQuickPanel((current) => current === "priority" ? null : "priority")} style={{ color: priorityOptions.find((option) => option.value === quickPriority)?.color }}><QuickAddIcon type="priority" /><span>優先度</span></button>
                  <button className={quickTags.length > 0 ? "is-active" : ""} type="button" aria-label={quickTags.length > 0 ? `タグ ${quickTags.join("、")}` : "タグを設定"} aria-expanded={quickPanel === "tag"} onClick={() => setQuickPanel((current) => current === "tag" ? null : "tag")}><QuickAddIcon type="tag" /><span>{quickTags.length > 0 ? `${quickTags.length}件` : "タグ"}</span></button>
                  <button className={quickAddProjectId ? "is-active" : ""} type="button" aria-label="プロジェクトを設定" aria-expanded={quickPanel === "project"} onClick={() => setQuickPanel((current) => current === "project" ? null : "project")}><QuickAddIcon type="project" /><span>{activeProjects.find((item) => item.id === quickAddProjectId)?.name ?? "Inbox"}</span></button>
                  <button className="task-capture__submit" type="button" onClick={() => void addTask()} disabled={!storageAvailable || !title.trim()}>追加</button>
                </div>
                {quickPanel === "date" && <AppCalendar title="期限を設定" value={dueDate} today={today} onSelect={(value) => { setDueDate(value); setQuickPanel(null); }} onClose={() => setQuickPanel(null)} />}
                {quickPanel === "priority" && <section className="quick-add-popover quick-add-priority" role="dialog" aria-label="優先度を設定"><div className="quick-add-popover__header"><strong>優先度</strong><button type="button" aria-label="優先度設定を閉じる" onClick={() => setQuickPanel(null)}>×</button></div><div>{priorityOptions.map((option) => <button className={quickPriority === option.value ? "is-selected" : ""} type="button" aria-pressed={quickPriority === option.value} onClick={() => { setQuickPriority(option.value); setQuickPanel(null); }} key={option.value}><span style={{ color: option.color }}><QuickAddIcon type="priority" /></span><strong>{option.label}</strong></button>)}</div></section>}
                {quickPanel === "tag" && <section className="quick-add-popover quick-add-tags" role="dialog" aria-label="タグを設定"><div className="quick-add-popover__header"><strong>タグ</strong><button type="button" aria-label="タグ設定を閉じる" onClick={() => setQuickPanel(null)}>×</button></div><TagPicker selected={quickTags} suggestions={availableTags} onChange={setQuickTags} /></section>}
                {quickPanel === "project" && <section className="quick-add-popover quick-add-project" role="dialog" aria-label="プロジェクトを設定"><div className="quick-add-popover__header"><strong>プロジェクト</strong><button type="button" aria-label="プロジェクト設定を閉じる" onClick={() => setQuickPanel(null)}>×</button></div><div><button className={!quickAddProjectId ? "is-selected" : ""} type="button" onClick={() => { setQuickProjectId(""); setQuickPanel(null); }}><i /><span>Inbox</span></button>{activeProjects.map((item) => <button className={quickAddProjectId === item.id ? "is-selected" : ""} type="button" onClick={() => { setQuickProjectId(item.id); setQuickPanel(null); }} key={item.id}><i style={{ background: item.color }} /><span>{item.name}</span></button>)}</div></section>}
              </section>
            )}
            </>}
          </section>
        </div>
      </aside>
    </div>
  );
}
