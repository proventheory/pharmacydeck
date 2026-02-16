/**
 * RxClass API: fetch ATC codes for an RxCUI.
 * https://rxnav.nlm.nih.gov/REST/rxclass/class/byRxcui.json
 */

import { fetchWithRetry } from "./fetchWithRetry.js";

const RXCLASS_BASE = "https://rxnav.nlm.nih.gov/REST/rxclass/class";

export interface AtcRow {
  atc_code: string;
  atc_name: string | null;
  level: number | null;
}

/**
 * Fetch ATC classifications for an RxCUI. Returns unique (atc_code, atc_name) with
 * level derived from code length (1–5). Filters to ATC/ATCPROD source.
 */
export async function fetchAtcForRxcui(rxcui: string): Promise<AtcRow[]> {
  const url = `${RXCLASS_BASE}/byRxcui.json?rxcui=${encodeURIComponent(rxcui)}`;
  const res = await fetchWithRetry(url, {}, { maxRetries: 2, initialMs: 500 });
  if (!res.ok) return [];

  const data = (await res.json()) as {
    rxclassDrugInfoList?: {
      rxclassDrugInfo?: Array<{
        minConcept?: { rxcui?: string };
        rxclassMinConceptItem?: { classId?: string; className?: string; classType?: string };
        relaSource?: string;
      }>;
    };
  };
  const list = data.rxclassDrugInfoList?.rxclassDrugInfo ?? [];
  const seen = new Set<string>();
  const out: AtcRow[] = [];
  for (const item of list) {
    const src = (item as { relaSource?: string }).relaSource;
    if (src !== "ATC" && src !== "ATCPROD") continue;
    const classId = item.rxclassMinConceptItem?.classId;
    const className = item.rxclassMinConceptItem?.className ?? null;
    if (!classId || seen.has(classId)) continue;
    seen.add(classId);
    const level = classId.length <= 1 ? 1 : classId.length <= 3 ? 2 : classId.length <= 4 ? 3 : classId.length <= 5 ? 4 : 5;
    out.push({ atc_code: classId, atc_name: className ?? null, level });
  }
  return out;
}
