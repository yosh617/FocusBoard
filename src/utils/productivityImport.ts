import type { FocusSessionRecord } from "../types/focusSession";
import type { ProjectRecord } from "../types/project";
import type { TaskRecord } from "../types/task";
import type { ProductivityBackup } from "./productivityBackup";
import { hasCyclicTaskParents } from "./taskValidation";

export type ImportStrategy = "add-only" | "smart-merge" | "replace";
export type ConflictPreference = "current" | "incoming";

export type ProductivityDataSet = {
  tasks: TaskRecord[];
  projects: ProjectRecord[];
  sessions: FocusSessionRecord[];
};

export type ImportConflict<T> = {
  id: string;
  current: T;
  incoming: T;
  reason: "same-time-different-content" | "immutable-id-collision";
};

export type ImportKeptCurrent<T> = {
  id: string;
  current: T;
  incoming: T;
  reason: "add-only" | "current-newer";
};

export type StoreImportPlan<T> = {
  inserts: T[];
  updates: { current: T; incoming: T }[];
  unchanged: T[];
  keptCurrent: ImportKeptCurrent<T>[];
  conflicts: ImportConflict<T>[];
  deletions: T[];
};

export type ProductivityImportPlan = {
  strategy: ImportStrategy;
  tasks: StoreImportPlan<TaskRecord>;
  projects: StoreImportPlan<ProjectRecord>;
  sessions: StoreImportPlan<FocusSessionRecord>;
};

export type ProductivityImportCounts = {
  inserts: number;
  updates: number;
  unchanged: number;
  keptCurrent: number;
  conflicts: number;
  deletions: number;
};

function emptyPlan<T>(): StoreImportPlan<T> {
  return { inserts: [], updates: [], unchanged: [], keptCurrent: [], conflicts: [], deletions: [] };
}

function recordsEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function analyzeMutableRecords<T extends { id: string; updatedAt: number }>(
  current: T[],
  incoming: T[],
  strategy: ImportStrategy
): StoreImportPlan<T> {
  const plan = emptyPlan<T>();
  const currentById = new Map(current.map((record) => [record.id, record]));
  const incomingIds = new Set(incoming.map((record) => record.id));

  for (const incomingRecord of incoming) {
    const currentRecord = currentById.get(incomingRecord.id);
    if (!currentRecord) {
      plan.inserts.push(incomingRecord);
      continue;
    }
    if (recordsEqual(currentRecord, incomingRecord)) {
      plan.unchanged.push(currentRecord);
      continue;
    }
    if (strategy === "replace") {
      plan.updates.push({ current: currentRecord, incoming: incomingRecord });
    } else if (strategy === "add-only") {
      plan.keptCurrent.push({ id: currentRecord.id, current: currentRecord, incoming: incomingRecord, reason: "add-only" });
    } else if (incomingRecord.updatedAt > currentRecord.updatedAt) {
      plan.updates.push({ current: currentRecord, incoming: incomingRecord });
    } else if (incomingRecord.updatedAt < currentRecord.updatedAt) {
      plan.keptCurrent.push({ id: currentRecord.id, current: currentRecord, incoming: incomingRecord, reason: "current-newer" });
    } else {
      plan.conflicts.push({ id: currentRecord.id, current: currentRecord, incoming: incomingRecord, reason: "same-time-different-content" });
    }
  }

  if (strategy === "replace") plan.deletions = current.filter((record) => !incomingIds.has(record.id));
  return plan;
}

function analyzeSessionRecords(
  current: FocusSessionRecord[],
  incoming: FocusSessionRecord[],
  strategy: ImportStrategy
): StoreImportPlan<FocusSessionRecord> {
  const plan = emptyPlan<FocusSessionRecord>();
  const currentById = new Map(current.map((record) => [record.id, record]));
  const incomingIds = new Set(incoming.map((record) => record.id));

  for (const incomingRecord of incoming) {
    const currentRecord = currentById.get(incomingRecord.id);
    if (!currentRecord) {
      plan.inserts.push(incomingRecord);
    } else if (recordsEqual(currentRecord, incomingRecord)) {
      plan.unchanged.push(currentRecord);
    } else if (strategy === "replace") {
      plan.updates.push({ current: currentRecord, incoming: incomingRecord });
    } else if (strategy === "add-only") {
      plan.keptCurrent.push({ id: currentRecord.id, current: currentRecord, incoming: incomingRecord, reason: "add-only" });
    } else {
      plan.conflicts.push({ id: currentRecord.id, current: currentRecord, incoming: incomingRecord, reason: "immutable-id-collision" });
    }
  }

  if (strategy === "replace") plan.deletions = current.filter((record) => !incomingIds.has(record.id));
  return plan;
}

export function analyzeProductivityImport(
  current: ProductivityDataSet,
  incoming: ProductivityBackup,
  strategy: ImportStrategy
): ProductivityImportPlan {
  return {
    strategy,
    tasks: analyzeMutableRecords(current.tasks, incoming.tasks, strategy),
    projects: analyzeMutableRecords(current.projects, incoming.projects, strategy),
    sessions: analyzeSessionRecords(current.sessions, incoming.sessions, strategy)
  };
}

function applyStorePlan<T extends { id: string }>(
  current: T[],
  plan: StoreImportPlan<T>,
  conflictPreference: ConflictPreference
) {
  const result = new Map(current.map((record) => [record.id, record]));
  for (const record of plan.deletions) result.delete(record.id);
  for (const record of plan.inserts) result.set(record.id, record);
  for (const update of plan.updates) result.set(update.incoming.id, update.incoming);
  if (conflictPreference === "incoming") {
    for (const conflict of plan.conflicts) result.set(conflict.incoming.id, conflict.incoming);
  }
  return [...result.values()];
}

export function applyProductivityImportPlan(
  current: ProductivityDataSet,
  plan: ProductivityImportPlan,
  conflictPreference: ConflictPreference = "current"
): ProductivityDataSet {
  return {
    tasks: applyStorePlan(current.tasks, plan.tasks, conflictPreference),
    projects: applyStorePlan(current.projects, plan.projects, conflictPreference),
    sessions: applyStorePlan(current.sessions, plan.sessions, conflictPreference)
  };
}

export function getProductivityImportCounts(plan: ProductivityImportPlan): ProductivityImportCounts {
  const stores = [plan.tasks, plan.projects, plan.sessions];
  return stores.reduce<ProductivityImportCounts>((counts, store) => ({
    inserts: counts.inserts + store.inserts.length,
    updates: counts.updates + store.updates.length,
    unchanged: counts.unchanged + store.unchanged.length,
    keptCurrent: counts.keptCurrent + store.keptCurrent.length,
    conflicts: counts.conflicts + store.conflicts.length,
    deletions: counts.deletions + store.deletions.length
  }), { inserts: 0, updates: 0, unchanged: 0, keptCurrent: 0, conflicts: 0, deletions: 0 });
}

export function isValidProductivityDataSet(data: ProductivityDataSet) {
  const taskIds = new Set(data.tasks.map((task) => task.id));
  const projectIds = new Set(data.projects.map((project) => project.id));
  if (data.tasks.some((task) => task.parentTaskId !== null && !taskIds.has(task.parentTaskId))) return false;
  if (data.tasks.some((task) => task.projectId !== null && !projectIds.has(task.projectId))) return false;
  return !hasCyclicTaskParents(data.tasks);
}
