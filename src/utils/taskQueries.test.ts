import { describe, expect, it } from "vitest";
import type { ProjectRecord } from "../types/project";
import type { TaskRecord } from "../types/task";
import { getActiveProjects, getTasksForProject, getTasksForView } from "./taskQueries";

const createTask = (id: string, patch: Partial<TaskRecord> = {}): TaskRecord => ({
  version: 1,
  id,
  title: id,
  status: "open",
  bucket: "inbox",
  projectId: null,
  parentTaskId: null,
  note: "",
  dueDate: null,
  reminderAt: null,
  repeatRule: null,
  repeatSeriesId: null,
  estimatedPomodoros: 0,
  order: 0,
  createdAt: 1,
  updatedAt: 1,
  completedAt: null,
  ...patch
});

describe("task smart lists", () => {
  const today = "2026-07-18";
  const tasks = [
    createTask("inbox"),
    createTask("overdue", { dueDate: "2026-07-17" }),
    createTask("today", { dueDate: today }),
    createTask("tomorrow", { dueDate: "2026-07-19" }),
    createTask("future", { dueDate: "2026-07-25" }),
    createTask("someday", { bucket: "someday" }),
    createTask("done", { status: "completed", completedAt: 2 }),
    createTask("subtask", { parentTaskId: "today", dueDate: today })
  ];

  it("groups tasks by local due date and excludes subtasks", () => {
    expect(getTasksForView(tasks, "inbox", today).map((task) => task.id)).toEqual(["inbox"]);
    expect(getTasksForView(tasks, "today", today).map((task) => task.id)).toEqual(["overdue", "today"]);
    expect(getTasksForView(tasks, "tomorrow", today).map((task) => task.id)).toEqual(["tomorrow"]);
    expect(getTasksForView(tasks, "upcoming", today).map((task) => task.id)).toEqual(["future"]);
    expect(getTasksForView(tasks, "someday", today).map((task) => task.id)).toEqual(["someday"]);
    expect(getTasksForView(tasks, "completed", today).map((task) => task.id)).toEqual(["done"]);
  });

  it("filters projects and hides archived projects", () => {
    const projectTasks = [createTask("a", { projectId: "project-1" }), createTask("b", { projectId: "project-2" })];
    expect(getTasksForProject(projectTasks, "project-1").map((task) => task.id)).toEqual(["a"]);
    const projects: ProjectRecord[] = [
      { version: 1, id: "project-1", name: "勉強", color: "#3f6fab", order: 2, archivedAt: null, createdAt: 1, updatedAt: 1 },
      { version: 1, id: "project-2", name: "終了", color: "#3f6fab", order: 1, archivedAt: 2, createdAt: 1, updatedAt: 2 }
    ];
    expect(getActiveProjects(projects).map((project) => project.id)).toEqual(["project-1"]);
  });
});
