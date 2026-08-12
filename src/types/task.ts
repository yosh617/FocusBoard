export type TaskStatus = "open" | "completed" | "archived";
export type TaskBucket = "inbox" | "someday";

export type RepeatRule =
  | { type: "daily"; interval: number }
  | { type: "weekdays" }
  | { type: "weekly"; interval: number; weekdays: number[] }
  | { type: "monthly"; interval: number; day: number };

export type TaskRecord = {
  version: 1;
  id: string;
  title: string;
  status: TaskStatus;
  bucket: TaskBucket;
  projectId: string | null;
  parentTaskId: string | null;
  note: string;
  dueDate: string | null;
  reminderAt: number | null;
  repeatRule: RepeatRule | null;
  repeatSeriesId: string | null;
  estimatedPomodoros: number;
  order: number;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
};

export type TaskDraft = Pick<TaskRecord, "title"> & Partial<Pick<
  TaskRecord,
  "bucket" | "projectId" | "parentTaskId" | "note" | "dueDate" | "reminderAt" | "repeatRule" | "estimatedPomodoros"
>>;

export type TaskView = "inbox" | "today" | "tomorrow" | "upcoming" | "someday" | "completed";
