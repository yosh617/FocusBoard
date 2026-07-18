import { describe, expect, it } from "vitest";
import type { FocusSessionRecord } from "../types/focusSession";
import type { ProjectRecord } from "../types/project";
import type { TaskRecord } from "../types/task";
import { isLocalDate, validateFocusSessionRecord, validateProjectRecord, validateTaskRecord } from "./taskValidation";

const task: TaskRecord = {
  version: 1,
  id: "task-1",
  title: "数学の復習",
  status: "open",
  bucket: "inbox",
  projectId: null,
  parentTaskId: null,
  note: "",
  dueDate: "2026-07-18",
  reminderAt: null,
  repeatRule: null,
  repeatSeriesId: null,
  estimatedPomodoros: 2,
  order: 0,
  createdAt: 1,
  updatedAt: 1,
  completedAt: null
};

describe("task data validation", () => {
  it("accepts a valid task and trims its title", () => {
    expect(validateTaskRecord({ ...task, title: "  数学の復習  " })?.title).toBe("数学の復習");
  });

  it("rejects malformed dates, bounds, and repeat rules", () => {
    expect(isLocalDate("2026-02-29")).toBe(false);
    expect(isLocalDate("2028-02-29")).toBe(true);
    expect(validateTaskRecord({ ...task, dueDate: "2026-02-29" })).toBeNull();
    expect(validateTaskRecord({ ...task, estimatedPomodoros: 100 })).toBeNull();
    expect(validateTaskRecord({ ...task, repeatRule: { type: "weekly", interval: 1, weekdays: [] } })).toBeNull();
  });

  it("validates projects and normalizes their colors", () => {
    const project: ProjectRecord = { version: 1, id: "project-1", name: " 勉強 ", color: "#AABBCC", order: 0, archivedAt: null, createdAt: 1, updatedAt: 1 };
    expect(validateProjectRecord(project)).toMatchObject({ name: "勉強", color: "#aabbcc" });
    expect(validateProjectRecord({ ...project, color: "blue" })).toBeNull();
  });

  it("rejects a session with an invalid time range", () => {
    const session: FocusSessionRecord = {
      version: 1,
      id: "session-1",
      taskId: task.id,
      taskTitleSnapshot: task.title,
      projectIdSnapshot: null,
      projectNameSnapshot: null,
      program: "pomodoro",
      mode: "work",
      result: "completed",
      startedAt: 10,
      endedAt: 20,
      plannedDurationMs: 1_500_000,
      focusedDurationMs: 1_500_000
    };
    expect(validateFocusSessionRecord(session)).toEqual(session);
    expect(validateFocusSessionRecord({ ...session, endedAt: 9 })).toBeNull();
  });
});
