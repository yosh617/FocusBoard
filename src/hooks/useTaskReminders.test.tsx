import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskRecord } from "../types/task";
import { useTaskReminders } from "./useTaskReminders";

const task: TaskRecord = {
  version: 1,
  id: "task-1",
  title: "英単語",
  status: "open",
  bucket: "inbox",
  projectId: null,
  parentTaskId: null,
  note: "",
  dueDate: null,
  reminderAt: 1,
  repeatRule: null,
  repeatSeriesId: null,
  estimatedPomodoros: 0,
  order: 0,
  createdAt: 1,
  updatedAt: 1,
  completedAt: null
};

describe("useTaskReminders", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-18T03:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("shows a due reminder inside the app without requiring system notifications", () => {
    const { result } = renderHook(() => useTaskReminders([task]));
    expect(result.current.reminderMessage).toContain("英単語");
    expect(result.current.notificationPermission).toBe("unsupported");
  });

  it("does not remind for completed tasks", () => {
    const { result } = renderHook(() => useTaskReminders([{ ...task, status: "completed", completedAt: 2 }]));
    expect(result.current.reminderMessage).toBe("");
  });
});
