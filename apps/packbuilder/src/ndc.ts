/**
 * openFDA NDC API: fetch products by substance name for compound_product.
 * https://api.fda.gov/drug/ndc.json
 */

import { fetchWithRetry } from "./fetchWithRetry.js";

const NDC_URL = "https://api.fda.gov/drug/ndc.json";

export interface CompoundProductRow {
  ndc: string | null;
  product_ndc: string | null;
  dosage_form: string | null;
  strength: string | null;
  manufacturer: string | null;
}

/**
 * Fetch NDC products for a substance name (e.g. canonical drug name); return up to limit.
 */
export async function fetchNdcProductsForSubstance(
  substanceName: string,
  limit = 30
): Promise<CompoundProductRow[]> {
  const name = substanceName.trim().split(/\s+/)[0];
  if (!name) return [];
  const search = `openfda.substance_name:${encodeURIComponent(name)}`;
  const url = `${NDC_URL}?search=${search}&limit=${Math.min(limit, 100)}`;
  try {
    const res = await fetchWithRetry(url, {}, { maxRetries: 2, initialMs: 500 });
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: Array<Record<string, unknown>> };
    const results = data.results ?? [];
    const out: CompoundProductRow[] = [];
    const seen = new Set<string>();
    for (const row of results) {
      const openfda = row.openfda as Record<string, unknown> | undefined;
      const productNdc = openfda?.product_ndc;
      const ndc = Array.isArray(productNdc) ? productNdc[0] : productNdc;
      const ndcStr = ndc != null ? String(ndc) : (row.product_ndc != null ? String(row.product_ndc) : null);
      if (ndcStr && seen.has(ndcStr)) continue;
      if (ndcStr) seen.add(ndcStr);
      const dosageForm = row.dosage_form;
      const strength = row.active_ingredients ?? row.strength;
      const strengthStr = Array.isArray(strength) ? strength.map(String).join("; ") : strength != null ? String(strength) : null;
      const manufacturer = row.manufacturer_name ?? row.labeler_name;
      out.push({
        ndc: ndcStr ?? null,
        product_ndc: ndcStr ?? null,
        dosage_form: dosageForm != null ? String(dosageForm) : null,
        strength: strengthStr,
        manufacturer: manufacturer != null ? String(manufacturer) : null,
      });
    }
    return out;
  } catch {
    return [];
  }
}
