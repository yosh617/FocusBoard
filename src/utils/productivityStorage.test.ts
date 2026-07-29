import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FocusSessionRecord } from "../types/focusSession";
import type { ProjectRecord } from "../types/project";
import type { TaskRecord } from "../types/task";
import {
  PRODUCTIVITY_DB_NAME,
  PRODUCTIVITY_DB_VERSION,
  loadProductivityData,
  replaceProductivityData,
  saveProductivityRecords
} from "./productivityStorage";

class FakeStringList {
  private values: string[] = [];

  add(value: string) {
    if (!this.values.includes(value)) this.values.push(value);
  }

  contains(value: string) {
    return this.values.includes(value);
  }

  item(index: number) {
    return this.values[index] ?? null;
  }

  [Symbol.iterator]() {
    return this.values[Symbol.iterator]();
  }
}

type RequestHandler = (() => void) | null;

class FakeRequest<T> {
  result!: T;
  error: Error | null = null;
  onsuccess: RequestHandler = null;
  onerror: RequestHandler = null;

  succeed(result: T) {
    this.result = result;
    queueMicrotask(() => this.onsuccess?.());
  }

  fail(error: Error) {
    this.error = error;
    queueMicrotask(() => this.onerror?.());
  }
}

class FakeObjectStore {
  readonly indexNames = new FakeStringList();
  readonly data = new Map<string, unknown>();

  constructor(private readonly keyPath: string) {}

  createIndex(name: string, _keyPath?: string | string[]) {
    this.indexNames.add(name);
  }

  put(value: unknown, transaction: FakeTransaction) {
    const request = new FakeRequest<IDBValidKey>();
    transaction.start();
    queueMicrotask(() => {
      if (transaction.aborted) return;
      const record = value as Record<string, unknown>;
      const key = record[this.keyPath];
      if (typeof key !== "string" || key.length === 0) {
        const error = new Error("DataError");
        request.fail(error);
        transaction.abort(error);
        return;
      }
      this.data.set(key, structuredClone(value));
      request.succeed(key);
      transaction.finish();
    });
    return request as unknown as IDBRequest<IDBValidKey>;
  }

  clear(transaction: FakeTransaction) {
    const request = new FakeRequest<undefined>();
    transaction.start();
    queueMicrotask(() => {
      if (transaction.aborted) return;
      this.data.clear();
      request.succeed(undefined);
      transaction.finish();
    });
    return request as unknown as IDBRequest<undefined>;
  }

  getAll(transaction: FakeTransaction) {
    const request = new FakeRequest<unknown[]>();
    transaction.start();
    queueMicrotask(() => {
      if (transaction.aborted) return;
      request.succeed([...this.data.values()].map((value) => structuredClone(value)));
      transaction.finish();
    });
    return request as unknown as IDBRequest<unknown[]>;
  }
}

class FakeDatabase {
  readonly objectStoreNames = new FakeStringList();
  readonly stores = new Map<string, FakeObjectStore>();

  constructor(public readonly name: string, public version: number) {}

  createObjectStore(name: string, options: { keyPath: string }) {
    const store = new FakeObjectStore(options.keyPath);
    this.stores.set(name, store);
    this.objectStoreNames.add(name);
    return store as unknown as IDBObjectStore;
  }

  transaction(names: string | string[], mode: IDBTransactionMode) {
    return new FakeTransaction(this, Array.isArray(names) ? names : [names], mode) as unknown as IDBTransaction;
  }

  close() {}
}

class FakeTransaction {
  oncomplete: RequestHandler = null;
  onerror: RequestHandler = null;
  onabort: RequestHandler = null;
  error: Error | null = null;
  aborted = false;
  private pending = 0;
  private completed = false;
  private readonly snapshots: Map<string, Map<string, unknown>>;

  constructor(private readonly database: FakeDatabase, private readonly storeNames: string[], mode: IDBTransactionMode) {
    this.snapshots = mode === "readwrite"
      ? new Map(storeNames.map((name) => [name, new Map(database.stores.get(name)?.data ?? new Map<string, unknown>())]))
      : new Map();
  }

  objectStore(name: string) {
    const store = this.database.stores.get(name);
    if (!store) throw new Error(`missing store: ${name}`);
    return {
      put: (value: unknown) => store.put(value, this),
      clear: () => store.clear(this),
      getAll: () => store.getAll(this),
      createIndex: (indexName: string, keyPath: string | string[]) => {
        store.createIndex(indexName, keyPath);
        return {} as IDBIndex;
      },
      indexNames: store.indexNames
    } as unknown as IDBObjectStore;
  }

  start() {
    this.pending += 1;
  }

  finish() {
    if (this.aborted) return;
    this.pending -= 1;
    if (this.pending === 0 && !this.completed) {
      this.completed = true;
      queueMicrotask(() => this.oncomplete?.());
    }
  }

  abort(error: Error) {
    if (this.aborted) return;
    this.aborted = true;
    this.error = error;
    for (const [name, snapshot] of this.snapshots) {
      const store = this.database.stores.get(name);
      if (!store) continue;
      store.data.clear();
      snapshot.forEach((value, key) => store.data.set(key, structuredClone(value)));
    }
    queueMicrotask(() => {
      this.onerror?.();
      this.onabort?.();
    });
  }
}

class FakeOpenRequest<T> extends FakeRequest<T> {
  onupgradeneeded: RequestHandler = null;
  onblocked: RequestHandler = null;
  transaction: IDBTransaction | null = null;
}

class FakeIndexedDbFactory {
  private databases = new Map<string, FakeDatabase>();

  open(name: string, version: number) {
    const request = new FakeOpenRequest<IDBDatabase>();
    queueMicrotask(() => {
      let database = this.databases.get(name);
      const needsUpgrade = !database || version > database.version;
      if (!database) {
        database = new FakeDatabase(name, version);
        this.databases.set(name, database);
      } else if (version > database.version) {
        database.version = version;
      }

      if (needsUpgrade) {
        request.result = database as unknown as IDBDatabase;
        request.transaction = new FakeTransaction(database, [...database.objectStoreNames], "readwrite") as unknown as IDBTransaction;
        request.onupgradeneeded?.();
      }

      request.succeed(database as unknown as IDBDatabase);
    });
    return request as unknown as IDBOpenDBRequest;
  }

  deleteDatabase(name: string) {
    const request = new FakeRequest<undefined>();
    queueMicrotask(() => {
      this.databases.delete(name);
      request.succeed(undefined);
    });
    return request as unknown as IDBOpenDBRequest;
  }
}

const task: TaskRecord = {
  version: 1,
  id: "task-1",
  title: "数学の復習",
  status: "open",
  bucket: "inbox",
  projectId: "project-1",
  parentTaskId: null,
  note: "",
  dueDate: "2026-07-29",
  reminderAt: null,
  repeatRule: null,
  repeatSeriesId: null,
  estimatedPomodoros: 2,
  order: 0,
  createdAt: 1,
  updatedAt: 1,
  completedAt: null
};

const project: ProjectRecord = {
  version: 1,
  id: "project-1",
  name: "勉強",
  color: "#3f6fab",
  order: 0,
  archivedAt: null,
  createdAt: 1,
  updatedAt: 1
};

const session: FocusSessionRecord = {
  version: 1,
  id: "session-1",
  taskId: task.id,
  taskTitleSnapshot: task.title,
  projectIdSnapshot: project.id,
  projectNameSnapshot: project.name,
  program: "pomodoro",
  mode: "work",
  result: "completed",
  startedAt: 10,
  endedAt: 20,
  plannedDurationMs: 10,
  focusedDurationMs: 10
};

async function deleteProductivityDb() {
  if (!("indexedDB" in window)) return;
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(PRODUCTIVITY_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

async function openProductivityDb() {
  return await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(PRODUCTIVITY_DB_NAME, PRODUCTIVITY_DB_VERSION);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("db open failed"));
  });
}

beforeEach(async () => {
  Object.defineProperty(window, "indexedDB", {
    configurable: true,
    value: new FakeIndexedDbFactory()
  });
  Object.defineProperty(globalThis, "indexedDB", {
    configurable: true,
    value: window.indexedDB
  });
  await deleteProductivityDb();
});

afterEach(async () => {
  await deleteProductivityDb();
});

describe("productivityStorage", () => {
  it("creates the expected stores and indexes", async () => {
    await saveProductivityRecords({ tasks: [task], projects: [project], sessions: [session] });

    const database = await openProductivityDb();
    try {
      expect([...database.objectStoreNames]).toEqual(["tasks", "projects", "focusSessions"]);

      const transaction = database.transaction(["tasks", "projects", "focusSessions"], "readonly");
      expect([...transaction.objectStore("tasks").indexNames]).toEqual(["status", "projectId", "dueDate", "completedAt", "parentTaskId"]);
      expect([...transaction.objectStore("projects").indexNames]).toEqual(["order", "archivedAt"]);
      expect([...transaction.objectStore("focusSessions").indexNames]).toEqual(["taskId", "startedAt", "projectIdSnapshot", "taskAndStart"]);
    } finally {
      database.close();
    }
  });

  it("loads only validated records and reports invalid entries", async () => {
    await saveProductivityRecords({ tasks: [task], projects: [project], sessions: [session] });
    const database = await openProductivityDb();
    try {
      const transaction = database.transaction(["tasks", "projects", "focusSessions"], "readwrite");
      transaction.objectStore("tasks").put({ version: 1, id: "broken-task" });
      transaction.objectStore("projects").put({ version: 1, id: "broken-project", name: "", color: "red" });
      await new Promise<void>((resolve) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => resolve();
        transaction.onabort = () => resolve();
      });
    } finally {
      database.close();
    }

    const loaded = await loadProductivityData();
    expect(loaded.tasks).toEqual([task]);
    expect(loaded.projects).toEqual([project]);
    expect(loaded.sessions).toEqual([session]);
    expect(loaded.invalidRecordCount).toBe(2);
    expect(loaded.repairedRecordCount).toBe(0);
  });

  it("repairs orphaned project or parent references and persists the repaired tasks", async () => {
    const orphanProjectTask: TaskRecord = {
      ...task,
      id: "task-2",
      title: "参照切れプロジェクト",
      projectId: "missing-project",
      updatedAt: 2
    };
    const orphanParentTask: TaskRecord = {
      ...task,
      id: "task-3",
      title: "参照切れ親タスク",
      parentTaskId: "missing-task",
      updatedAt: 3
    };

    await saveProductivityRecords({ tasks: [orphanProjectTask, orphanParentTask], projects: [project] });

    const loaded = await loadProductivityData();
    expect(loaded.repairedRecordCount).toBe(2);
    expect(loaded.tasks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "task-2", projectId: null, bucket: "inbox" }),
      expect.objectContaining({ id: "task-3", parentTaskId: null })
    ]));

    const loadedAgain = await loadProductivityData();
    expect(loadedAgain.repairedRecordCount).toBe(0);
    expect(loadedAgain.tasks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "task-2", projectId: null, bucket: "inbox" }),
      expect.objectContaining({ id: "task-3", parentTaskId: null })
    ]));
  });

  it("breaks cyclic task parents by lifting the affected tasks to the top level", async () => {
    const cyclicA: TaskRecord = {
      ...task,
      id: "task-2",
      title: "循環A",
      parentTaskId: "task-3",
      updatedAt: 2
    };
    const cyclicB: TaskRecord = {
      ...task,
      id: "task-3",
      title: "循環B",
      parentTaskId: "task-2",
      updatedAt: 3
    };

    await saveProductivityRecords({ tasks: [cyclicA, cyclicB], projects: [project] });

    const loaded = await loadProductivityData();
    expect(loaded.repairedRecordCount).toBe(2);
    expect(loaded.tasks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "task-2", parentTaskId: null }),
      expect.objectContaining({ id: "task-3", parentTaskId: null })
    ]));
  });

  it("replaces missing data during a full import", async () => {
    await saveProductivityRecords({ tasks: [task], projects: [project], sessions: [session] });
    await replaceProductivityData({ tasks: [], projects: [project], sessions: [] });

    const loaded = await loadProductivityData();
    expect(loaded.tasks).toEqual([]);
    expect(loaded.projects).toEqual([project]);
    expect(loaded.sessions).toEqual([]);
  });

  it("keeps the original data when a replacement transaction aborts", async () => {
    await saveProductivityRecords({ tasks: [task], projects: [project], sessions: [session] });

    await expect(replaceProductivityData({
      tasks: [task],
      projects: [{ version: 1 } as ProjectRecord],
      sessions: []
    })).rejects.toBeTruthy();

    const loaded = await loadProductivityData();
    expect(loaded.tasks).toEqual([task]);
    expect(loaded.projects).toEqual([project]);
    expect(loaded.sessions).toEqual([session]);
  });
});
