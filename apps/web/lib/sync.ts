/**
 * Sync offline pack: check latest version and download if newer.
 * Call when online to refresh the local SQLite pack (IndexedDB + pack_version in localStorage).
 */
import { clearOfflineDBCache } from "./dataSource";

const PACK_VERSION_KEY = "pack_version";
const PACK_URL = "/packs/pharmacydeck.db";
const IDB_NAME = "pharmacydeck-offline";
const IDB_STORE = "pack";
const PACK_KEY = "pharmacydeck.db";

export interface LatestPackResponse {
  version: string;
  url?: string;
}

/**
 * Fetch current pack version from the API (or from the pack URL if no API).
 */
export async function getLatestPackVersion(): Promise<string | null> {
  try {
    const res = await fetch("/api/latestPack");
    if (!res.ok) return null;
    const data = (await res.json()) as LatestPackResponse;
    return data.version ?? null;
  } catch {
    return null;
  }
}

/**
 * Get the version we have stored (localStorage). After downloading a pack we set this from the new pack's _meta.version.
 */
export function getStoredPackVersion(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(PACK_VERSION_KEY);
}

/**
 * Save pack version to localStorage (call after successfully loading or saving a new pack).
 */
export function setStoredPackVersion(version: string): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(PACK_VERSION_KEY, version);
}

/**
 * Download pack from PACK_URL and store in IndexedDB. Returns the new pack version (from response or "unknown").
 */
async function downloadAndStorePack(): Promise<string> {
  const res = await fetch(PACK_URL);
  if (!res.ok) throw new Error(`Pack download failed: ${res.status}`);
  const buffer = await res.arrayBuffer();
  if (typeof indexedDB === "undefined") throw new Error("IndexedDB not available");
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(buffer, PACK_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve("downloaded");
      };
      tx.onerror = () => reject(tx.error);
    };
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE);
    };
  });
}

/**
 * Sync pack: if latest version from API is different from stored version, download pack and update stored version.
 * Optionally pass the version from the newly loaded DB (from _meta) to set stored version accurately.
 */
export async function syncPack(options?: {
  onProgress?: (message: string) => void;
  onVersion?: (version: string) => void;
}): Promise<{ updated: boolean; version: string | null }> {
  const stored = getStoredPackVersion();
  const latest = await getLatestPackVersion();
  if (latest == null) {
    options?.onProgress?.("Could not get latest pack version.");
    return { updated: false, version: stored };
  }
  if (stored === latest) {
    options?.onProgress?.("Pack is up to date.");
    return { updated: false, version: stored };
  }
  options?.onProgress?.("Downloading new pack...");
  await downloadAndStorePack();
  setStoredPackVersion(latest);
  clearOfflineDBCache();
  options?.onVersion?.(latest);
  options?.onProgress?.("Pack updated.");
  return { updated: true, version: latest };
}
