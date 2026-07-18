import { describe, expect, it } from "vitest";
import type { TaskRecord } from "../types/task";
import { createNextRepeatedTask, getNextDueDate } from "./repeatRule";

describe("task repeat rules", () => {
  it("handles daily, weekday, and weekly schedules", () => {
    expect(getNextDueDate("2026-07-18", { type: "daily", interval: 2 })).toBe("2026-07-20");
    expect(getNextDueDate("2026-07-17", { type: "weekdays" })).toBe("2026-07-20");
    expect(getNextDueDate("2026-07-13", { type: "weekly", interval: 1, weekdays: [1, 3] })).toBe("2026-07-15");
  });

  it("clamps monthly schedules to the last valid day", () => {
    expect(getNextDueDate("2026-01-31", { type: "monthly", interval: 1, day: 31 })).toBe("2026-02-28");
    expect(getNextDueDate("2028-01-31", { type: "monthly", interval: 1, day: 31 })).toBe("2028-02-29");
  });

  it("creates one open occurrence in the same repeat series", () => {
    const task: TaskRecord = {
      version: 1,
      id: "task-1",
      title: "復習",
      status: "completed",
      bucket: "inbox",
      projectId: null,
      parentTaskId: null,
      note: "",
      dueDate: "2026-07-18",
      reminderAt: null,
      repeatRule: { type: "daily", interval: 1 },
      repeatSeriesId: null,
      estimatedPomodoros: 1,
      order: 0,
      createdAt: 1,
      updatedAt: 2,
      completedAt: 2
    };
    expect(createNextRepeatedTask(task, "task-2", 3)).toMatchObject({ id: "task-2", status: "open", dueDate: "2026-07-19", repeatSeriesId: "task-1", completedAt: null });
  });
});
