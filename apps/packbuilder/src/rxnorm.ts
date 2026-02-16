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
    rxaui?: string[];
  };
}

export async function findRxcuiByString(name: string): Promise<string | null> {
  const url = `${RXNAV_BASE}/rxcui.json?name=${encodeURIComponent(name)}&search=2`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = (await res.json()) as FindRxcuiResponse;
  const list = data.idGroup?.rxcui;
  if (!list || list.length === 0) return null;
  return list[0];
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
