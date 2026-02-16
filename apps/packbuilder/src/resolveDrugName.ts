/**
 * Resolve drug name string to compound (rxcui + compound_id). Used for DDI ingest
 * so we can store resolved pairs or unresolved rows with other_drug_raw_name.
 * Cache is in-memory keyed by normalized name; best-effort resolution via RxNorm.
 */

import * as rxnorm from "./rxnorm.js";
import { getSupabaseServiceRole } from "database";

const cache = new Map<string, { rxcui: string; compound_id: string } | null>();

function normalize(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/**
 * Resolve a drug name to rxcui and compound_id. Returns null if not found in RxNorm
 * or compound not in our DB. Results are cached by normalized name.
 */
export async function resolveDrugName(
  name: string,
  supabase: ReturnType<typeof getSupabaseServiceRole> | null
): Promise<{ rxcui: string; compound_id: string } | null> {
  const key = normalize(name);
  if (!key || key.length < 2) return null;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const rxcui = await rxnorm.findRxcuiByString(name);
  if (!rxcui || !supabase) {
    cache.set(key, null);
    return null;
  }

  const { data: compound } = await supabase
    .from("compound")
    .select("id")
    .eq("rxcui", rxcui)
    .limit(1)
    .maybeSingle();

  const result = compound?.id ? { rxcui, compound_id: compound.id } : null;
  cache.set(key, result);
  return result;
}

/** Clear in-memory cache (e.g. for tests). */
export function clearResolutionCache(): void {
  cache.clear();
}
