export const BACKGROUND_DB_NAME = "focusboard-backgrounds";
const STORE_NAME = "backgrounds";
export const MAX_CUSTOM_BACKGROUNDS = 8;
export const MAX_BACKGROUND_FILE_SIZE = 10 * 1024 * 1024;

export type StoredBackground = {
  id: string;
  name: string;
  type: string;
  blob: Blob;
  createdAt: number;
};

export type CustomBackground = StoredBackground & { url: string };

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) return reject(new Error("このブラウザは画像保存に対応していません。"));
    const request = indexedDB.open(BACKGROUND_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("画像データベースを開けませんでした。"));
  });
}

function runTransaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDatabase().then((database) => new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = action(transaction.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("画像データを更新できませんでした。"));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error("画像データを更新できませんでした。")); };
  }));
}

export function loadStoredBackgrounds() {
  return runTransaction<StoredBackground[]>("readonly", (store) => store.getAll());
}

export function saveStoredBackground(background: StoredBackground) {
  return runTransaction<IDBValidKey>("readwrite", (store) => store.put(background));
}

export function deleteStoredBackground(id: string) {
  return runTransaction<undefined>("readwrite", (store) => store.delete(id) as IDBRequest<undefined>);
}

export function validateBackgroundFiles(files: File[], currentCount: number) {
  if (currentCount + files.length > MAX_CUSTOM_BACKGROUNDS) {
    throw new Error(`背景画像は最大${MAX_CUSTOM_BACKGROUNDS}枚まで保存できます。`);
  }
  for (const file of files) {
    if (!file.type.startsWith("image/")) throw new Error(`${file.name}は画像ファイルではありません。`);
    if (file.size > MAX_BACKGROUND_FILE_SIZE) throw new Error(`${file.name}は10MB以下にしてください。`);
  }
}
