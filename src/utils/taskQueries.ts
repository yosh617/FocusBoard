import type { ProjectRecord } from "../types/project";
import type { TaskRecord, TaskView } from "../types/task";

export function toLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addLocalDays(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return toLocalDateKey(new Date(year, month - 1, day + days));
}

export function getTasksForView(tasks: TaskRecord[], view: TaskView, today = toLocalDateKey(new Date())) {
  const tomorrow = addLocalDays(today, 1);
  return tasks
    .filter((task) => task.parentTaskId === null)
    .filter((task) => {
      if (view === "completed") return task.status === "completed";
      if (task.status !== "open") return false;
      if (view === "today") return task.dueDate !== null && task.dueDate <= today;
      if (view === "tomorrow") return task.dueDate === tomorrow;
      if (view === "upcoming") return task.dueDate !== null && task.dueDate > tomorrow;
      if (view === "someday") return task.bucket === "someday" && task.dueDate === null;
      return task.bucket === "inbox" && task.dueDate === null;
    })
    .sort((a, b) => {
      if (a.dueDate !== b.dueDate) return (a.dueDate ?? "9999-12-31").localeCompare(b.dueDate ?? "9999-12-31");
      return a.order - b.order || a.createdAt - b.createdAt;
    });
}

export function getTasksForProject(tasks: TaskRecord[], projectId: string) {
  return tasks
    .filter((task) => task.parentTaskId === null && task.status === "open" && task.projectId === projectId)
    .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
}

export function getActiveProjects(projects: ProjectRecord[]) {
  return projects.filter((project) => project.archivedAt === null).sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
}
