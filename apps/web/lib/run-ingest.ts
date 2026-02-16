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
  // Resolved at runtime so Next build does not need to resolve workspace package
  const mod = await import(/* webpackIgnore: true */ "packbuilder");
  return mod.ingestCompound(inputName);
}

export function slugFromCanonicalName(canonicalName: string): string {
  return canonicalName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}
