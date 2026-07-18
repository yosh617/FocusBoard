import { describe, expect, it } from "vitest";
import type { FocusSessionRecord } from "../types/focusSession";
import type { ProjectRecord } from "../types/project";
import type { TaskRecord } from "../types/task";
import { createProductivityBackup, parseProductivityBackup, stringifyProductivityBackup } from "./productivityBackup";

const project: ProjectRecord = { version: 1, id: "project-1", name: "勉強", color: "#3f6fab", order: 0, archivedAt: null, createdAt: 1, updatedAt: 1 };
const task: TaskRecord = { version: 1, id: "task-1", title: "数学", status: "open", bucket: "inbox", projectId: project.id, parentTaskId: null, note: "", dueDate: null, reminderAt: null, repeatRule: null, repeatSeriesId: null, estimatedPomodoros: 1, order: 0, createdAt: 1, updatedAt: 1, completedAt: null };
const session: FocusSessionRecord = { version: 1, id: "session-1", taskId: task.id, taskTitleSnapshot: task.title, projectIdSnapshot: project.id, projectNameSnapshot: project.name, program: "pomodoro", mode: "work", result: "completed", startedAt: 1, endedAt: 2, plannedDurationMs: 1, focusedDurationMs: 1 };

describe("productivityBackup", () => {
  it("round-trips tasks, projects, and sessions", () => {
    const backup = createProductivityBackup([task], [project], [session], new Date("2026-07-18T00:00:00.000Z"));
    expect(parseProductivityBackup(JSON.parse(stringifyProductivityBackup(backup)))).toEqual(backup);
  });

  it("rejects invalid records, duplicate ids, and broken task relations", () => {
    const backup = createProductivityBackup([task], [project], [session]);
    expect(parseProductivityBackup({ ...backup, tasks: [task, task] })).toBeNull();
    expect(parseProductivityBackup({ ...backup, tasks: [{ ...task, projectId: "missing" }] })).toBeNull();
    expect(parseProductivityBackup({ ...backup, sessions: [{ ...session, focusedDurationMs: -1 }] })).toBeNull();
  });
});
