import type { FocusSessionRecord } from "../types/focusSession";
import type { ProjectRecord } from "../types/project";
import type { TaskRecord } from "../types/task";
import { validateFocusSessionRecord, validateProjectRecord, validateTaskRecord } from "./taskValidation";

export const PRODUCTIVITY_DB_NAME = "focusboard-productivity";
export const PRODUCTIVITY_DB_VERSION = 1;

const TASK_STORE = "tasks";
const PROJECT_STORE = "projects";
const SESSION_STORE = "focusSessions";

type ProductivityData = {
  tasks: TaskRecord[];
  projects: ProjectRecord[];
  sessions: FocusSessionRecord[];
  invalidRecordCount: number;
};

function createIndexes(store: IDBObjectStore, indexes: { name: string; keyPath: string | string[] }[]) {
  for (const index of indexes) {
    if (!store.indexNames.contains(index.name)) store.createIndex(index.name, index.keyPath);
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in globalThis)) {
      reject(new Error("このブラウザはタスク保存に対応していません。"));
      return;
    }
    const request = indexedDB.open(PRODUCTIVITY_DB_NAME, PRODUCTIVITY_DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      const tasks = database.objectStoreNames.contains(TASK_STORE)
        ? request.transaction!.objectStore(TASK_STORE)
        : database.createObjectStore(TASK_STORE, { keyPath: "id" });
      createIndexes(tasks, [
        { name: "status", keyPath: "status" },
        { name: "projectId", keyPath: "projectId" },
        { name: "dueDate", keyPath: "dueDate" },
        { name: "completedAt", keyPath: "completedAt" },
        { name: "parentTaskId", keyPath: "parentTaskId" }
      ]);

      const projects = database.objectStoreNames.contains(PROJECT_STORE)
        ? request.transaction!.objectStore(PROJECT_STORE)
        : database.createObjectStore(PROJECT_STORE, { keyPath: "id" });
      createIndexes(projects, [
        { name: "order", keyPath: "order" },
        { name: "archivedAt", keyPath: "archivedAt" }
      ]);

      const sessions = database.objectStoreNames.contains(SESSION_STORE)
        ? request.transaction!.objectStore(SESSION_STORE)
        : database.createObjectStore(SESSION_STORE, { keyPath: "id" });
      createIndexes(sessions, [
        { name: "taskId", keyPath: "taskId" },
        { name: "startedAt", keyPath: "startedAt" },
        { name: "projectIdSnapshot", keyPath: "projectIdSnapshot" },
        { name: "taskAndStart", keyPath: ["taskId", "startedAt"] }
      ]);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("タスクデータベースを開けませんでした。"));
    request.onblocked = () => reject(new Error("別の画面がタスクデータベースを使用しています。"));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("タスクデータを読み書きできませんでした。"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("タスクデータを保存できませんでした。"));
    transaction.onabort = () => reject(transaction.error ?? new Error("タスクデータの保存が中断されました。"));
  });
}

async function saveRecord(storeName: string, value: TaskRecord | ProjectRecord | FocusSessionRecord) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(storeName, "readwrite");
    const done = transactionDone(transaction);
    await requestResult(transaction.objectStore(storeName).put(value));
    await done;
  } finally {
    database.close();
  }
}

export async function saveProductivityRecords(records: { tasks?: TaskRecord[]; projects?: ProjectRecord[]; sessions?: FocusSessionRecord[] }) {
  const storeNames: string[] = [];
  if (records.tasks?.length) storeNames.push(TASK_STORE);
  if (records.projects?.length) storeNames.push(PROJECT_STORE);
  if (records.sessions?.length) storeNames.push(SESSION_STORE);
  if (storeNames.length === 0) return;
  const database = await openDatabase();
  try {
    const transaction = database.transaction(storeNames, "readwrite");
    const done = transactionDone(transaction);
    const requests: Promise<IDBValidKey>[] = [];
    for (const task of records.tasks ?? []) requests.push(requestResult(transaction.objectStore(TASK_STORE).put(task)));
    for (const project of records.projects ?? []) requests.push(requestResult(transaction.objectStore(PROJECT_STORE).put(project)));
    for (const session of records.sessions ?? []) requests.push(requestResult(transaction.objectStore(SESSION_STORE).put(session)));
    await Promise.all(requests);
    await done;
  } finally {
    database.close();
  }
}

export async function loadProductivityData(): Promise<ProductivityData> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction([TASK_STORE, PROJECT_STORE, SESSION_STORE], "readonly");
    const done = transactionDone(transaction);
    const [rawTasks, rawProjects, rawSessions] = await Promise.all([
      requestResult<unknown[]>(transaction.objectStore(TASK_STORE).getAll()),
      requestResult<unknown[]>(transaction.objectStore(PROJECT_STORE).getAll()),
      requestResult<unknown[]>(transaction.objectStore(SESSION_STORE).getAll())
    ]);
    await done;

    const tasks = rawTasks.map(validateTaskRecord).filter((task): task is TaskRecord => task !== null);
    const projects = rawProjects.map(validateProjectRecord).filter((project): project is ProjectRecord => project !== null);
    const sessions = rawSessions.map(validateFocusSessionRecord).filter((session): session is FocusSessionRecord => session !== null);
    return {
      tasks,
      projects,
      sessions,
      invalidRecordCount: rawTasks.length + rawProjects.length + rawSessions.length - tasks.length - projects.length - sessions.length
    };
  } finally {
    database.close();
  }
}

export function saveTaskRecord(task: TaskRecord) {
  return saveRecord(TASK_STORE, task);
}

export function saveProjectRecord(project: ProjectRecord) {
  return saveRecord(PROJECT_STORE, project);
}

export function saveFocusSessionRecord(session: FocusSessionRecord) {
  return saveRecord(SESSION_STORE, session);
}
