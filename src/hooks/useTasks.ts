import { useCallback, useEffect, useRef, useState } from "react";
import type { FocusSessionRecord } from "../types/focusSession";
import type { ProjectRecord } from "../types/project";
import type { TaskDraft, TaskRecord } from "../types/task";
import type { TimerSessionEvent } from "../types/timer";
import type { ProductivityBackup } from "../utils/productivityBackup";
import {
  loadProductivityData,
  saveProductivityRecords,
  saveFocusSessionRecord,
  saveProjectRecord,
  saveTaskRecord
} from "../utils/productivityStorage";
import { validateTaskRecord } from "../utils/taskValidation";
import { createNextRepeatedTask } from "../utils/repeatRule";

const createId = (prefix: string) =>
  globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function useTasks() {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [sessions, setSessions] = useState<FocusSessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [message, setMessage] = useState("");
  const [canUndo, setCanUndo] = useState(false);
  const tasksRef = useRef(tasks);
  const projectsRef = useRef(projects);
  const undoRef = useRef<(() => Promise<void>) | null>(null);
  const pendingTaskIdsRef = useRef(new Set<string>());
  tasksRef.current = tasks;
  projectsRef.current = projects;

  useEffect(() => {
    let cancelled = false;
    void loadProductivityData()
      .then((data) => {
        if (cancelled) return;
        setTasks(data.tasks);
        setProjects(data.projects);
        setSessions(data.sessions);
        setStorageAvailable(true);
        if (data.invalidRecordCount > 0) setMessage(`読み込めないタスクデータ${data.invalidRecordCount}件を除外しました。`);
      })
      .catch(() => {
        if (!cancelled) setStorageAvailable(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const fail = useCallback(() => setMessage("タスクを保存できませんでした。端末の保存設定を確認してください。"), []);

  const setUndo = useCallback((action: () => Promise<void>) => {
    undoRef.current = action;
    setCanUndo(true);
  }, []);

  const addTask = useCallback(async (draft: TaskDraft) => {
    if (!storageAvailable) return false;
    const title = draft.title.trim();
    if (!title) {
      setMessage("タスク名を入力してください。");
      return false;
    }
    const now = Date.now();
    const task: TaskRecord = {
      version: 1,
      id: createId("task"),
      title,
      status: "open",
      bucket: draft.bucket ?? "inbox",
      projectId: draft.projectId ?? null,
      parentTaskId: draft.parentTaskId ?? null,
      note: draft.note ?? "",
      dueDate: draft.dueDate ?? null,
      reminderAt: draft.reminderAt ?? null,
      repeatRule: draft.repeatRule ?? null,
      repeatSeriesId: null,
      estimatedPomodoros: Math.min(99, Math.max(0, Math.round(draft.estimatedPomodoros ?? 0))),
      order: Math.max(0, ...tasksRef.current.map((item) => item.order + 1)),
      createdAt: now,
      updatedAt: now,
      completedAt: null
    };
    const validTask = validateTaskRecord(task);
    if (!validTask) {
      setMessage("タスクの入力内容を確認してください。");
      return false;
    }
    try {
      await saveTaskRecord(validTask);
      setTasks((current) => [...current, validTask]);
      setMessage("タスクを追加しました。");
      return true;
    } catch {
      fail();
      return false;
    }
  }, [fail, storageAvailable]);

  const updateTask = useCallback(async (id: string, patch: Partial<TaskRecord>) => {
    const previous = tasksRef.current.find((task) => task.id === id);
    if (!previous || !storageAvailable) return false;
    const candidate = validateTaskRecord({ ...previous, ...patch, id, version: 1, updatedAt: Date.now() });
    if (!candidate) {
      setMessage("タスクの入力内容を確認してください。");
      return false;
    }
    try {
      await saveTaskRecord(candidate);
      setTasks((current) => current.map((task) => task.id === id ? candidate : task));
      return true;
    } catch {
      fail();
      return false;
    }
  }, [fail, storageAvailable]);

  const toggleTask = useCallback(async (id: string) => {
    if (pendingTaskIdsRef.current.has(id)) return false;
    const previous = tasksRef.current.find((task) => task.id === id);
    if (!previous) return false;
    pendingTaskIdsRef.current.add(id);
    const completed = previous.status !== "completed";
    const now = Date.now();
    const changedTask = validateTaskRecord({ ...previous, status: completed ? "completed" : "open", completedAt: completed ? now : null, updatedAt: now });
    if (!changedTask) {
      pendingTaskIdsRef.current.delete(id);
      return false;
    }
    const nextTask = completed ? createNextRepeatedTask(changedTask, createId("task"), now + 1) : null;
    try {
      await saveProductivityRecords({ tasks: nextTask ? [changedTask, nextTask] : [changedTask] });
      setTasks((current) => [...current.map((task) => task.id === id ? changedTask : task), ...(nextTask ? [nextTask] : [])]);
      setMessage(nextTask ? `タスクを完了し、次回分を${nextTask.dueDate}に作成しました。` : completed ? "タスクを完了しました。" : "タスクを未完了に戻しました。");
      setUndo(async () => {
        const archivedNext = nextTask ? { ...nextTask, status: "archived" as const, updatedAt: Date.now() } : null;
        await saveProductivityRecords({ tasks: archivedNext ? [previous, archivedNext] : [previous] });
        setTasks((current) => current.map((task) => task.id === id ? previous : archivedNext && task.id === archivedNext.id ? archivedNext : task));
      });
      return true;
    } catch {
      fail();
      return false;
    } finally {
      pendingTaskIdsRef.current.delete(id);
    }
  }, [fail, setUndo]);

  const archiveTask = useCallback(async (id: string) => {
    const previous = tasksRef.current.find((task) => task.id === id);
    if (!previous || !storageAvailable) return false;
    const childTasks = tasksRef.current.filter((task) => task.parentTaskId === id && task.status !== "archived");
    const previousRecords = [previous, ...childTasks];
    const now = Date.now();
    const archivedRecords = previousRecords.map((task) => ({ ...task, status: "archived" as const, completedAt: null, updatedAt: now }));
    try {
      await saveProductivityRecords({ tasks: archivedRecords });
      const archivedById = new Map(archivedRecords.map((task) => [task.id, task]));
      setTasks((current) => current.map((task) => archivedById.get(task.id) ?? task));
      setMessage(childTasks.length > 0 ? "タスクとサブタスクをアーカイブしました。" : "タスクをアーカイブしました。");
      setUndo(async () => {
        await saveProductivityRecords({ tasks: previousRecords });
        const previousById = new Map(previousRecords.map((task) => [task.id, task]));
        setTasks((current) => current.map((task) => previousById.get(task.id) ?? task));
      });
      return true;
    } catch {
      fail();
      return false;
    }
  }, [fail, setUndo, storageAvailable]);

  const moveTask = useCallback(async (id: string, visibleIds: string[], direction: -1 | 1) => {
    const index = visibleIds.indexOf(id);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= visibleIds.length || !storageAvailable) return false;
    const orderedIds = [...visibleIds];
    [orderedIds[index], orderedIds[targetIndex]] = [orderedIds[targetIndex], orderedIds[index]];
    const now = Date.now();
    const updated = orderedIds
      .map((taskId, order) => {
        const task = tasksRef.current.find((item) => item.id === taskId);
        return task ? { ...task, order, updatedAt: now } : null;
      })
      .filter((task): task is TaskRecord => task !== null);
    try {
      await saveProductivityRecords({ tasks: updated });
      const byId = new Map(updated.map((task) => [task.id, task]));
      setTasks((current) => current.map((task) => byId.get(task.id) ?? task));
      setMessage("タスクの順番を保存しました。");
      return true;
    } catch {
      fail();
      return false;
    }
  }, [fail, storageAvailable]);

  const addProject = useCallback(async (name: string, color = "#3f6fab") => {
    if (!storageAvailable || !name.trim()) return false;
    const now = Date.now();
    const project: ProjectRecord = {
      version: 1,
      id: createId("project"),
      name: name.trim().slice(0, 80),
      color,
      order: Math.max(0, ...projectsRef.current.map((item) => item.order + 1)),
      archivedAt: null,
      createdAt: now,
      updatedAt: now
    };
    try {
      await saveProjectRecord(project);
      setProjects((current) => [...current, project]);
      setMessage("プロジェクトを追加しました。");
      return true;
    } catch {
      fail();
      return false;
    }
  }, [fail, storageAvailable]);

  const archiveProject = useCallback(async (id: string) => {
    const project = projectsRef.current.find((item) => item.id === id);
    if (!project || !storageAvailable) return false;
    const now = Date.now();
    const archived = { ...project, archivedAt: now, updatedAt: now };
    const affectedTasks = tasksRef.current
      .filter((task) => task.projectId === id && task.status !== "archived")
      .map((task) => ({ ...task, projectId: null, bucket: "inbox" as const, updatedAt: now }));
    try {
      await saveProductivityRecords({ tasks: affectedTasks, projects: [archived] });
      setProjects((current) => current.map((item) => item.id === id ? archived : item));
      setTasks((current) => current.map((task) => affectedTasks.find((item) => item.id === task.id) ?? task));
      setMessage("プロジェクトをアーカイブし、タスクをInboxへ移しました。");
      return true;
    } catch {
      fail();
      return false;
    }
  }, [fail, storageAvailable]);

  const undo = useCallback(async () => {
    const action = undoRef.current;
    if (!action) return false;
    try {
      await action();
      undoRef.current = null;
      setCanUndo(false);
      setMessage("直前のタスク操作を元に戻しました。");
      return true;
    } catch {
      fail();
      return false;
    }
  }, [fail]);

  const recordTimerSession = useCallback((event: TimerSessionEvent) => {
    const task = event.taskId ? tasksRef.current.find((item) => item.id === event.taskId) : null;
    const project = task?.projectId ? projectsRef.current.find((item) => item.id === task.projectId) : null;
    const session: FocusSessionRecord = {
      version: 1,
      id: event.id,
      taskId: task?.id ?? null,
      taskTitleSnapshot: task?.title ?? null,
      projectIdSnapshot: project?.id ?? null,
      projectNameSnapshot: project?.name ?? null,
      program: event.program,
      mode: event.mode,
      result: event.result,
      startedAt: event.startedAt,
      endedAt: event.endedAt,
      plannedDurationMs: event.plannedDurationMs,
      focusedDurationMs: event.focusedDurationMs
    };
    void saveFocusSessionRecord(session)
      .then(() => setSessions((current) => current.some((item) => item.id === session.id)
        ? current.map((item) => item.id === session.id ? session : item)
        : [...current, session]))
      .catch(fail);
  }, [fail]);

  const importProductivityBackup = useCallback(async (backup: ProductivityBackup) => {
    if (!storageAvailable) return false;
    try {
      await saveProductivityRecords({ tasks: backup.tasks, projects: backup.projects, sessions: backup.sessions });
      const mergeById = <T extends { id: string }>(current: T[], imported: T[]) => {
        const importedById = new Map(imported.map((record) => [record.id, record]));
        const merged = current.map((record) => importedById.get(record.id) ?? record);
        const currentIds = new Set(current.map((record) => record.id));
        return [...merged, ...imported.filter((record) => !currentIds.has(record.id))];
      };
      setTasks((current) => mergeById(current, backup.tasks));
      setProjects((current) => mergeById(current, backup.projects));
      setSessions((current) => mergeById(current, backup.sessions));
      setMessage(`バックアップからタスク${backup.tasks.length}件、プロジェクト${backup.projects.length}件、履歴${backup.sessions.length}件を復元しました。`);
      return true;
    } catch {
      fail();
      return false;
    }
  }, [fail, storageAvailable]);

  return {
    tasks,
    projects,
    sessions,
    loading,
    storageAvailable,
    taskMessage: message,
    setTaskMessage: setMessage,
    canUndo,
    addTask,
    updateTask,
    toggleTask,
    archiveTask,
    moveTask,
    addProject,
    archiveProject,
    undo,
    recordTimerSession,
    importProductivityBackup
  };
}
