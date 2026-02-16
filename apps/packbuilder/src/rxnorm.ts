/**
 * RxNorm API client. Base: https://rxnav.nlm.nih.gov
 * No API key required.
 */

const RXNAV_BASE = "https://rxnav.nlm.nih.gov/REST";

export interface RxNormIdGroup {
  rxcui: string;
  rxaui?: string;
  name?: string;
}

export interface FindRxcuiResponse {
  idGroup?: {
    name?: string;
    rxcui?: string[];
    rxnormId?: string[];
    rxaui?: string[];
  };
}

/** Resolve drug name to RxCUI. Tries exact/normalized (search=2) then approximate (search=9). */
export async function findRxcuiByString(name: string): Promise<string | null> {
  const ids = (data: FindRxcuiResponse) =>
    data.idGroup?.rxcui ?? data.idGroup?.rxnormId;

  const url2 = `${RXNAV_BASE}/rxcui.json?name=${encodeURIComponent(name)}&search=2`;
  const res2 = await fetch(url2);
  if (res2.ok) {
    const data = (await res2.json()) as FindRxcuiResponse;
    const list = ids(data);
    if (list?.length) return String(list[0]);
  }

  const url9 = `${RXNAV_BASE}/rxcui.json?name=${encodeURIComponent(name)}&search=9`;
  const res9 = await fetch(url9);
  if (!res9.ok) return null;
  const data9 = (await res9.json()) as FindRxcuiResponse;
  const list9 = ids(data9);
  if (!list9?.length) return null;
  return String(list9[0]);
}

export interface RxNormConcept {
  rxcui: string;
  name: string;
  tty: string;
}

export interface RelatedResponse {
  relatedGroup?: {
    conceptGroup?: Array<{
      tty?: string;
      conceptProperties?: Array<{ rxcui: string; name: string }>;
    }>;
  };
}

export async function getRelatedConcepts(rxcui: string): Promise<RxNormConcept[]> {
  const url = `${RXNAV_BASE}/rxcui/${rxcui}/related.json?tty=SCD+SCDC+SBD+SBDF+GPCK+SBDC`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = (await res.json()) as RelatedResponse;
  const out: RxNormConcept[] = [];
  const groups = data.relatedGroup?.conceptGroup ?? [];
  for (const g of groups) {
    for (const p of g.conceptProperties ?? []) {
      out.push({ rxcui: p.rxcui, name: p.name, tty: g.tty ?? "" });
    }
  }
  return out;
}

export async function getSynonyms(rxcui: string): Promise<string[]> {
  const url = `${RXNAV_BASE}/rxcui/${rxcui}/properties.json`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = (await res.json()) as { properties?: { name?: string; synonym?: string } };
  const name = data.properties?.name;
  const synonym = data.properties?.synonym;
  const set = new Set<string>();
  if (name) set.add(name);
  if (synonym) set.add(synonym);
  const related = await getRelatedConcepts(rxcui);
  for (const c of related) {
    if (c.name) set.add(c.name);
  }
  return Array.from(set);
}

export async function getConceptName(rxcui: string): Promise<string | null> {
  const url = `${RXNAV_BASE}/rxcui/${rxcui}/properties.json`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = (await res.json()) as { properties?: { name?: string } };
  return data.properties?.name ?? null;
}
