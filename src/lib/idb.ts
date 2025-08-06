const DB_NAME = "logchopper-db";
const DB_VERSION = 2;
const STORE_LOGS = "logs";
const STORE_META = "meta";

export type IdbLogLine = {
  id: string; // fileName:lineNumber
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
        const store = db.createObjectStore(STORE_LOGS, { keyPath: "id" });
        store.createIndex("by_file_line", ["fileName", "lineNumber"], { unique: true });
        store.createIndex("by_file", "fileName", { unique: false });
      } else {
        const store = req.transaction?.objectStore(STORE_LOGS);
        if (store) {
          if (!store.indexNames.contains("by_file_line")) {
            store.createIndex("by_file_line", ["fileName", "lineNumber"], { unique: true });
          }
          if (!store.indexNames.contains("by_file")) {
            store.createIndex("by_file", "fileName", { unique: false });
          }
        }
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
  // Per retrocompat: manteniamo questa API, ma ora preferiamo append/get per range.
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

  // Salva meta
  {
    const { tx, obj } = await txStore(STORE_META, "readwrite");
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

  // Recupera meta
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

  // Per compat, restituiamo allLines vuoto (d’ora in poi useremo letture per range)
  return { allLines: [], pinnedIds, files, maxLines };
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

export async function idbSetFilesMeta(files: { fileName: string; totalLines: number }[]) {
  const { tx, obj } = await txStore(STORE_META, "readwrite");
  obj.put(files, "files");
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function idbGetFilesMeta(): Promise<{ fileName: string; totalLines: number }[]> {
  const { tx, obj } = await txStore(STORE_META, "readonly");
  return await new Promise((resolve) => {
    const req = obj.get("files");
    req.onsuccess = () => resolve((req.result as { fileName: string; totalLines: number }[]) || []);
    req.onerror = () => resolve([]);
  });
}

// Append batch di log
export async function idbAppendLogs(lines: IdbLogLine[]) {
  if (!lines.length) return;
  const { tx, obj } = await txStore(STORE_LOGS, "readwrite");
  for (const l of lines) obj.put(l);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// Legge un range per fileName e intervallo di lineNumber [from, to] inclusivo
export async function idbGetLogsByRange(fileName: string, from: number, to: number): Promise<IdbLogLine[]> {
  if (to < from) return [];
  const db = await openDB();
  const tx = db.transaction(STORE_LOGS, "readonly");
  const store = tx.objectStore(STORE_LOGS);
  const idx = store.index("by_file_line");
  const keyRange = IDBKeyRange.bound([fileName, from], [fileName, to]);
  const req = idx.getAll(keyRange);
  return await new Promise((resolve, reject) => {
    req.onsuccess = () => resolve((req.result as IdbLogLine[]) || []);
    req.onerror = () => reject(req.error);
  });
}

// Ultime N righe di un file (per anteprima tail-first)
export async function idbGetLastN(fileName: string, n: number): Promise<IdbLogLine[]> {
  const meta = await idbGetFilesMeta();
  const info = meta.find((m) => m.fileName === fileName);
  if (!info || info.totalLines <= 0) return [];
  const to = info.totalLines;
  const from = Math.max(1, to - n + 1);
  return idbGetLogsByRange(fileName, from, to);
}

// Aggiorna totale righe per file
export async function idbUpdateFileTotal(fileName: string, totalLines: number) {
  const list = await idbGetFilesMeta();
  const idx = list.findIndex((f) => f.fileName === fileName);
  if (idx >= 0) list[idx] = { fileName, totalLines };
  else list.push({ fileName, totalLines });
  await idbSetFilesMeta(list);
}