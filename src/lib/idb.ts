const DB_NAME = "logchopper-db";
const DB_VERSION = 1;
const STORE_LOGS = "logs";
const STORE_META = "meta";

export type IdbLogLine = {
  id: string;
  fileName: string;
  lineNumber: number;
  content: string;
  level: string;
};

export type IdbState = {
  allLines: IdbLogLine[];
  pinnedIds: string[];
  files: { fileName: string; totalLines: number }[];
  maxLines: number;
};

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_LOGS)) {
        db.createObjectStore(STORE_LOGS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function txStore<T extends "readonly" | "readwrite">(store: string, mode: T) {
  const db = await openDB();
  const tx = db.transaction(store, mode);
  const obj = tx.objectStore(store);
  return { db, tx, obj };
}

export async function idbClearAll() {
  const db = await openDB();
  await Promise.all(
    [STORE_LOGS, STORE_META].map(
      (name) =>
        new Promise<void>((resolve, reject) => {
          const tx = db.transaction(name, "readwrite");
          const req = tx.objectStore(name).clear();
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        })
    )
  );
}

export async function idbSaveState(state: IdbState) {
  // Pulisci e salva atomico abbastanza (due transazioni separate per semplicità)
  await idbClearAll();

  // Salva logs
  {
    const db = await openDB();
    const tx = db.transaction(STORE_LOGS, "readwrite");
    const store = tx.objectStore(STORE_LOGS);
    for (const l of state.allLines) {
      store.put(l);
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  // Salva meta (pinned, files, maxLines) in singola chiave
  {
    const { db, tx, obj } = await txStore(STORE_META, "readwrite");
    obj.put(state.pinnedIds, "pinnedIds");
    obj.put(state.files, "files");
    obj.put(state.maxLines, "maxLines");
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
}

export async function idbLoadState(): Promise<IdbState | null> {
  const db = await openDB();

  // carica logs
  const allLines: IdbLogLine[] = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_LOGS, "readonly");
    const store = tx.objectStore(STORE_LOGS);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as IdbLogLine[]);
    req.onerror = () => reject(req.error);
  });

  // se vuoto, niente stato
  if (!allLines || allLines.length === 0) return null;

  // carica meta
  const [pinnedIds, files, maxLines] = await Promise.all([
    new Promise<string[]>((resolve) => {
      const tx = db.transaction(STORE_META, "readonly");
      const store = tx.objectStore(STORE_META);
      const req = store.get("pinnedIds");
      req.onsuccess = () => resolve((req.result as string[]) || []);
      req.onerror = () => resolve([]);
    }),
    new Promise<{ fileName: string; totalLines: number }[]>((resolve) => {
      const tx = db.transaction(STORE_META, "readonly");
      const store = tx.objectStore(STORE_META);
      const req = store.get("files");
      req.onsuccess = () => resolve((req.result as { fileName: string; totalLines: number }[]) || []);
      req.onerror = () => resolve([]);
    }),
    new Promise<number>((resolve) => {
      const tx = db.transaction(STORE_META, "readonly");
      const store = tx.objectStore(STORE_META);
      const req = store.get("maxLines");
      req.onsuccess = () => resolve((req.result as number) || 50000);
      req.onerror = () => resolve(50000);
    }),
  ]);

  return { allLines, pinnedIds, files, maxLines };
}

export async function idbUpdatePinned(pinnedIds: string[]) {
  const { tx, obj } = await txStore(STORE_META, "readwrite");
  obj.put(pinnedIds, "pinnedIds");
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}