import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ProjectRecord } from "../../types/project";
import type { TaskRecord } from "../../types/task";

type PickerIntent = "select" | "start";

type Props = {
  open: boolean;
  intent: PickerIntent;
  tasks: TaskRecord[];
  projects: ProjectRecord[];
  selectedTaskId: string | null;
  storageAvailable: boolean;
  onAddTask: (title: string) => Promise<string | null>;
  onSelect: (taskId: string) => void;
  onStart: (taskId: string | null) => void;
  onClose: () => void;
};

function taskMeta(task: TaskRecord, projects: ProjectRecord[]) {
  const parts: string[] = [];
  const project = task.projectId ? projects.find((item) => item.id === task.projectId) : null;
  if (project) parts.push(project.name);
  if (task.dueDate) parts.push(task.dueDate.replace(/-/g, "/"));
  if (task.estimatedPomodoros > 0) parts.push(`目安 ${task.estimatedPomodoros}セット`);
  return parts.join(" ・ ") || "Inbox";
}

export function TimerTaskPicker({
  open,
  intent,
  tasks,
  projects,
  selectedTaskId,
  storageAvailable,
  onAddTask,
  onSelect,
  onStart,
  onClose
}: Props) {
  const [title, setTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    window.setTimeout(() => inputRef.current?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !dialogRef.current) return;
      const controls = [...dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled])")];
      const first = controls[0];
      const last = controls.at(-1);
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
    if (!open) setTitle("");
  }, [open]);

  if (!open) return null;

  const chooseTask = (taskId: string) => {
    if (intent === "start") onStart(taskId);
    else onSelect(taskId);
  };
  const addAndContinue = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || adding) return;
    setAdding(true);
    const taskId = await onAddTask(title);
    setAdding(false);
    if (!taskId) return;
    setTitle("");
    chooseTask(taskId);
  };

  return (
    <div className="timer-task-picker-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="timer-task-picker" role="dialog" aria-modal="true" aria-labelledby="timer-task-picker-title" ref={dialogRef}>
        <div className="timer-task-picker__heading">
          <div>
            <span>FOCUS</span>
            <h2 id="timer-task-picker-title">{intent === "start" ? "どのタスクを始めますか？" : "取り組むタスクを選ぶ"}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="タスク選択を閉じる">×</button>
        </div>

        <form className="timer-task-picker__add" onSubmit={addAndContinue}>
          <label htmlFor="timer-task-title">新しいタスク</label>
          <div>
            <input
              id="timer-task-title"
              ref={inputRef}
              value={title}
              maxLength={120}
              placeholder="例：数学の問題集を3ページ"
              onChange={(event) => setTitle(event.target.value)}
            />
            <button type="submit" disabled={!storageAvailable || !title.trim() || adding}>
              {adding ? "追加中…" : intent === "start" ? "追加して開始" : "追加"}
            </button>
          </div>
        </form>

        {tasks.length > 0 ? (
          <div className="timer-task-picker__list" aria-label="未完了のタスク">
            {tasks.map((task) => {
              const selected = task.id === selectedTaskId;
              return (
                <button
                  className={selected ? "timer-task-picker__task is-selected" : "timer-task-picker__task"}
                  type="button"
                  onClick={() => chooseTask(task.id)}
                  aria-label={`${task.title}${intent === "start" ? "を開始" : "を選択"}`}
                  key={task.id}
                >
                  <span className="timer-task-picker__radio" aria-hidden="true">{selected ? "✓" : ""}</span>
                  <span><strong>{task.title}</strong><small>{taskMeta(task, projects)}</small></span>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d={intent === "start" ? "m9 6 9 6-9 6V6Z" : "m9 5 7 7-7 7"} /></svg>
                </button>
              );
            })}
          </div>
        ) : <p className="timer-task-picker__empty">未完了のタスクはありません。上で追加すると、すぐに取り組めます。</p>}

        {intent === "start" && (
          <button className="timer-task-picker__skip" type="button" onClick={() => onStart(null)}>
            タスクなしで開始
          </button>
        )}
      </div>
    </div>
  );
}
