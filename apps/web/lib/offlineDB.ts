/**
 * Load offline SQLite pack in the browser (sql.js).
 * Prefer pack from IndexedDB if synced; otherwise fetch from /packs/pharmacydeck.db.
 *
 * Cyberdeck hardware mode: on device you can store the pack at e.g. /data/pharmacydeck.db
 * and have your host (Electron, native wrapper, or static server) serve it at /packs/pharmacydeck.db
 * so the app loads it with no internet.
 */

import initSqlJs, { Database } from "sql.js";

const IDB_NAME = "pharmacydeck-offline";
const IDB_STORE = "pack";
const PACK_KEY = "pharmacydeck.db";
const PACK_URL = "/packs/pharmacydeck.db";

let sqlJs: Awaited<ReturnType<typeof initSqlJs>> | null = null;

async function getSqlJs() {
  if (sqlJs) return sqlJs;
  sqlJs = await initSqlJs({
    locateFile: (file) => `https://sql.js.org/dist/${file}`,
  });
  return sqlJs;
}

async function getCachedPackBuffer(): Promise<ArrayBuffer | null> {
  if (typeof indexedDB === "undefined") return null;
  return new Promise((resolve) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onerror = () => resolve(null);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.close();
        return resolve(null);
      }
      const tx = db.transaction(IDB_STORE, "readonly");
      const getReq = tx.objectStore(IDB_STORE).get(PACK_KEY);
      getReq.onsuccess = () => resolve(getReq.result ?? null);
      getReq.onerror = () => resolve(null);
      tx.oncomplete = () => db.close();
    };
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE);
    };
  });
}

function idbSavePack(buffer: ArrayBuffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(buffer, PACK_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE);
    };
  });
}

/**
 * Load the offline SQLite database. Uses cached pack from IndexedDB if present, else fetches from PACK_URL.
 */
export async function loadOfflineDB(): Promise<Database> {
  const SQL = await getSqlJs();
  const cached = await getCachedPackBuffer();
  const buffer = cached ?? await (await fetch(PACK_URL)).arrayBuffer();
  return new SQL.Database(new Uint8Array(buffer));
}

/**
 * Save pack buffer to IndexedDB (used after sync download). Returns the DB instance from that buffer.
 */
export async function savePackAndLoad(buffer: ArrayBuffer): Promise<Database> {
  await idbSavePack(buffer);
  const SQL = await getSqlJs();
  return new SQL.Database(new Uint8Array(buffer));
}

/**
 * Get pack version from SQLite (requires loading the DB). Use /api/latestPack for a quick version check without loading the full pack.
 */
export function getPackVersionFromDB(db: Database): string | null {
  try {
    const r = db.exec("SELECT value FROM _meta WHERE key = 'version'");
    if (r?.[0]?.values?.[0]?.[0]) return r[0].values[0][0] as string;
  } catch {
    // no _meta table
  }
  return null;
}
