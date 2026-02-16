/**
 * Server-only: run the packbuilder ingest pipeline for a compound name.
 * Used by /api/generateCompound and /api/resolve.
 * Requires SUPABASE_SERVICE_ROLE_KEY for writes.
 */

export interface IngestResult {
  rxcui: string;
  canonical_name: string;
  ok: boolean;
  error?: string;
}

export async function runIngest(inputName: string): Promise<IngestResult> {
  try {
    // Bundled via transpilePackages so ingest runs on Vercel; fallback if package missing at runtime
    const mod = await import("packbuilder");
    return mod.ingestCompound(inputName);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Cannot find package") || msg.includes("packbuilder")) {
      return {
        rxcui: "",
        canonical_name: inputName,
        ok: false,
        error: "Compound ingestion is unavailable in this environment. Search will use cached/mock data.",
      };
    }
    throw err;
  }
}

export function slugFromCanonicalName(canonicalName: string): string {
  return canonicalName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}
