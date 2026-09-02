import { describe, expect, it } from "vitest";
import type { FocusSessionRecord } from "../types/focusSession";
import type { ProjectRecord } from "../types/project";
import type { TaskRecord } from "../types/task";
import { createProductivityBackup } from "./productivityBackup";
import { analyzeProductivityImport, applyProductivityImportPlan, getProductivityImportCounts, isValidProductivityDataSet, type ProductivityDataSet } from "./productivityImport";

const project: ProjectRecord = { version: 1, id: "project-1", name: "勉強", color: "#3f6fab", order: 0, archivedAt: null, createdAt: 1, updatedAt: 10 };
const task: TaskRecord = { version: 1, id: "task-1", title: "数学", status: "open", bucket: "inbox", projectId: project.id, parentTaskId: null, note: "", dueDate: null, reminderAt: null, repeatRule: null, repeatSeriesId: null, estimatedPomodoros: 1, order: 0, createdAt: 1, updatedAt: 10, completedAt: null };
const session: FocusSessionRecord = { version: 2, id: "session-1", taskId: task.id, taskTitleSnapshot: task.title, projectIdSnapshot: project.id, projectNameSnapshot: project.name, program: "pomodoro", mode: "work", result: "completed", startedAt: 1, endedAt: 2, plannedDurationMs: 1, focusedDurationMs: 1, pauseIntervals: [] };
const current: ProductivityDataSet = { tasks: [task], projects: [project], sessions: [session] };

describe("productivityImport", () => {
  it("adds only new ids without changing existing records", () => {
    const newTask = { ...task, id: "task-2", title: "英語" };
    const backup = createProductivityBackup([{ ...task, title: "古い数学", updatedAt: 5 }, newTask], [project], [session]);
    const plan = analyzeProductivityImport(current, backup, "add-only");
    expect(getProductivityImportCounts(plan)).toMatchObject({ inserts: 1, updates: 0, keptCurrent: 1, conflicts: 0, deletions: 0 });
    expect(applyProductivityImportPlan(current, plan).tasks).toEqual([task, newTask]);
  });

  it("uses newer mutable records and keeps newer local records during smart merge", () => {
    const backup = createProductivityBackup(
      [{ ...task, title: "新しい数学", updatedAt: 11 }],
      [{ ...project, name: "端末より古い勉強", updatedAt: 9 }],
      [session]
    );
    const plan = analyzeProductivityImport(current, backup, "smart-merge");
    const merged = applyProductivityImportPlan(current, plan);
    expect(merged.tasks[0].title).toBe("新しい数学");
    expect(merged.projects[0].name).toBe(project.name);
    expect(getProductivityImportCounts(plan)).toMatchObject({ updates: 1, keptCurrent: 1, unchanged: 1, conflicts: 0 });
  });

  it("does not silently resolve equal-time or immutable session conflicts", () => {
    const backup = createProductivityBackup(
      [{ ...task, title: "同時刻の別タイトル" }],
      [project],
      [{ ...session, focusedDurationMs: 2 }]
    );
    const plan = analyzeProductivityImport(current, backup, "smart-merge");
    expect(plan.tasks.conflicts).toHaveLength(1);
    expect(plan.sessions.conflicts).toHaveLength(1);
    expect(applyProductivityImportPlan(current, plan, "current")).toEqual(current);
    const incoming = applyProductivityImportPlan(current, plan, "incoming");
    expect(incoming.tasks[0].title).toBe("同時刻の別タイトル");
    expect(incoming.sessions[0].focusedDurationMs).toBe(2);
  });

  it("makes replacement data exactly match the backup record set", () => {
    const backup = createProductivityBackup([], [], []);
    const plan = analyzeProductivityImport(current, backup, "replace");
    expect(getProductivityImportCounts(plan).deletions).toBe(3);
    expect(applyProductivityImportPlan(current, plan)).toEqual({ tasks: [], projects: [], sessions: [] });
  });

  it("rejects a relationship cycle created by combining otherwise valid data", () => {
    const parent = { ...task, id: "parent", projectId: null, parentTaskId: "child" };
    const child = { ...task, id: "child", projectId: null, parentTaskId: "parent" };
    expect(isValidProductivityDataSet({ tasks: [parent, child], projects: [], sessions: [] })).toBe(false);
  });

  it("is idempotent when the same backup is applied more than once", () => {
    const newTask = { ...task, id: "task-2", title: "英語", projectId: null };
    const backup = createProductivityBackup([task, newTask], [project], [session]);
    const firstPlan = analyzeProductivityImport(current, backup, "smart-merge");
    const firstResult = applyProductivityImportPlan(current, firstPlan);
    const secondPlan = analyzeProductivityImport(firstResult, backup, "smart-merge");
    const secondResult = applyProductivityImportPlan(firstResult, secondPlan);

    expect(secondResult).toEqual(firstResult);
    expect(getProductivityImportCounts(secondPlan)).toMatchObject({
      inserts: 0,
      updates: 0,
      unchanged: 4,
      conflicts: 0,
      deletions: 0
    });
  });
});
