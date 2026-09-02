import type { FocusSessionRecord } from "../types/focusSession";
import type { ProjectRecord } from "../types/project";
import type { TaskRecord } from "../types/task";
import { isRecord, validateFocusSessionRecord, validateProjectRecord, validateTaskRecord } from "./taskValidation";

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
  repairedRecordCount: number;
};

function isLegacyFocusSession(value: unknown): boolean {
  return isRecord(value) && value.version === 1;
}

function createIndexes(store: IDBObjectStore, indexes: { name: string; keyPath: string | string[] }[]) {
  for (const index of indexes) {
    if (!store.indexNames.contains(index.name)) store.createIndex(index.name, index.keyPath);
  }
}

function collectCyclicTaskIds(tasks: TaskRecord[]) {
  const parentById = new Map(tasks.map((task) => [task.id, task.parentTaskId]));
  const cyclicIds = new Set<string>();

  for (const task of tasks) {
    const path: string[] = [];
    const visitedInPath = new Map<string, number>();
    let currentId: string | null = task.id;

    while (currentId !== null) {
      const repeatedIndex = visitedInPath.get(currentId);
      if (repeatedIndex !== undefined) {
        for (const cyclicId of path.slice(repeatedIndex)) cyclicIds.add(cyclicId);
        break;
      }
      visitedInPath.set(currentId, path.length);
      path.push(currentId);
      const parentId: string | null = parentById.get(currentId) ?? null;
      currentId = parentId !== null && parentById.has(parentId) ? parentId : null;
    }
  }

  return cyclicIds;
}

function repairTaskRelationships(tasks: TaskRecord[], projects: ProjectRecord[]) {
  const projectIds = new Set(projects.map((project) => project.id));
  const taskIds = new Set(tasks.map((task) => task.id));
  const cyclicIds = collectCyclicTaskIds(tasks);
  const repairedTaskIds = new Set<string>();

  const repairedTasks = tasks.map((task) => {
    let nextTask = task;

    if (task.projectId !== null && !projectIds.has(task.projectId)) {
      nextTask = { ...nextTask, projectId: null, bucket: "inbox" };
      repairedTaskIds.add(task.id);
    }

    if (nextTask.parentTaskId !== null && !taskIds.has(nextTask.parentTaskId)) {
      nextTask = { ...nextTask, parentTaskId: null };
      repairedTaskIds.add(task.id);
    }

    if (cyclicIds.has(task.id) && nextTask.parentTaskId !== null) {
      nextTask = { ...nextTask, parentTaskId: null };
      repairedTaskIds.add(task.id);
    }

    return nextTask;
  });

  return { repairedTasks, repairedTaskIds };
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

async function finishTransaction<T>(done: Promise<void>, work: Promise<T>) {
  try {
    const result = await work;
    await done;
    return result;
  } catch (error) {
    await done.catch(() => undefined);
    throw error;
  }
}

async function saveRecord(storeName: string, value: TaskRecord | ProjectRecord | FocusSessionRecord) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(storeName, "readwrite");
    const done = transactionDone(transaction);
    await finishTransaction(done, requestResult(transaction.objectStore(storeName).put(value)));
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
    await finishTransaction(done, Promise.all(requests));
  } finally {
    database.close();
  }
}

export async function deleteProductivityRecords(records: { taskIds?: string[] }) {
  const taskIds = records.taskIds ?? [];
  if (taskIds.length === 0) return;
  const database = await openDatabase();
  try {
    const transaction = database.transaction(TASK_STORE, "readwrite");
    const done = transactionDone(transaction);
    const requests = taskIds.map((id) => requestResult(transaction.objectStore(TASK_STORE).delete(id)));
    await finishTransaction(done, Promise.all(requests));
  } finally {
    database.close();
  }
}

export async function replaceProductivityData(records: { tasks: TaskRecord[]; projects: ProjectRecord[]; sessions: FocusSessionRecord[] }) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction([TASK_STORE, PROJECT_STORE, SESSION_STORE], "readwrite");
    const done = transactionDone(transaction);
    const taskStore = transaction.objectStore(TASK_STORE);
    const projectStore = transaction.objectStore(PROJECT_STORE);
    const sessionStore = transaction.objectStore(SESSION_STORE);
    const requests: Promise<unknown>[] = [
      requestResult(taskStore.clear()),
      requestResult(projectStore.clear()),
      requestResult(sessionStore.clear())
    ];
    for (const task of records.tasks) requests.push(requestResult(taskStore.put(task)));
    for (const project of records.projects) requests.push(requestResult(projectStore.put(project)));
    for (const session of records.sessions) requests.push(requestResult(sessionStore.put(session)));
    await finishTransaction(done, Promise.all(requests));
  } finally {
    database.close();
  }
}

export async function loadProductivityData(): Promise<ProductivityData> {
  let repairedTasksToSave: TaskRecord[];
  let migratedSessionsToSave: FocusSessionRecord[];
  let result: ProductivityData;
  const database = await openDatabase();
  try {
    const transaction = database.transaction([TASK_STORE, PROJECT_STORE, SESSION_STORE], "readonly");
    const done = transactionDone(transaction);
    const [rawTasks, rawProjects, rawSessions] = await finishTransaction(done, Promise.all([
      requestResult<unknown[]>(transaction.objectStore(TASK_STORE).getAll()),
      requestResult<unknown[]>(transaction.objectStore(PROJECT_STORE).getAll()),
      requestResult<unknown[]>(transaction.objectStore(SESSION_STORE).getAll())
    ]));

    const tasks = rawTasks.map(validateTaskRecord).filter((task): task is TaskRecord => task !== null);
    const projects = rawProjects.map(validateProjectRecord).filter((project): project is ProjectRecord => project !== null);
    migratedSessionsToSave = [];
    const sessions = rawSessions.map((rawSession) => {
      const session = validateFocusSessionRecord(rawSession);
      if (session && isLegacyFocusSession(rawSession)) migratedSessionsToSave.push(session);
      return session;
    }).filter((session): session is FocusSessionRecord => session !== null);
    const { repairedTasks, repairedTaskIds } = repairTaskRelationships(tasks, projects);
    repairedTasksToSave = repairedTasks.filter((task) => repairedTaskIds.has(task.id));
    result = {
      tasks: repairedTasks,
      projects,
      sessions,
      invalidRecordCount: rawTasks.length + rawProjects.length + rawSessions.length - tasks.length - projects.length - sessions.length,
      repairedRecordCount: repairedTaskIds.size
    };
  } finally {
    database.close();
  }
  if (repairedTasksToSave.length > 0) {
    await saveProductivityRecords({ tasks: repairedTasksToSave }).catch(() => undefined);
  }
  if (migratedSessionsToSave.length > 0) {
    await saveProductivityRecords({ sessions: migratedSessionsToSave }).catch(() => undefined);
  }
  return result;
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
