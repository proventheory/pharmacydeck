/**
 * DailyMed / openFDA labeling.
 * openFDA: https://api.fda.gov/drug/label.json
 */

import { fetchWithRetry } from "./fetchWithRetry.js";

export interface LabelSnippetInput {
  section: string;
  text: string;
  source: string;
}

const OPENFDA_BASE = "https://api.fda.gov/drug/label.json";

function parseLabelResults(results: unknown): LabelSnippetInput[] {
  const out: LabelSnippetInput[] = [];
  if (!Array.isArray(results)) return out;
  for (const row of results) {
    if (!row || typeof row !== "object") continue;
    const obj = row as Record<string, unknown>;
    const sectionKeys = [
      "description",
      "indications_and_usage",
      "warnings",
      "contraindications",
      "adverse_reactions",
      "clinical_pharmacology",
      "mechanism_of_action",
      "dosage_and_administration",
      "drug_interactions",
      "pregnancy",
      "purpose",
    ];
    for (const key of sectionKeys) {
      const val = obj[key];
      if (Array.isArray(val) && val.length > 0) {
        const text = val.map((v) => (typeof v === "string" ? v : String(v))).join("\n\n");
        if (text.trim()) out.push({ section: key, text: text.slice(0, 10000), source: "openFDA" });
      } else if (typeof val === "string" && val.trim()) {
        out.push({ section: key, text: val.slice(0, 10000), source: "openFDA" });
      }
    }
  }
  return out;
}

export async function fetchLabelSnippetsForRxcui(
  rxcui: string,
  canonicalName: string
): Promise<LabelSnippetInput[]> {
  try {
    const res = await fetchWithRetry(
      `${OPENFDA_BASE}?search=openfda.rxcui:${encodeURIComponent(rxcui)}&limit=5`,
      {},
      { maxRetries: 2, initialMs: 500 }
    );
    if (!res.ok) throw new Error(`openFDA ${res.status}`);
    const data = (await res.json()) as { results?: unknown[] };
    if (data.results?.length) return parseLabelResults(data.results);

    const name = canonicalName.split(/\s+/)[0];
    if (!name) return [];
    const res2 = await fetchWithRetry(
      `${OPENFDA_BASE}?search=openfda.substance_name:${encodeURIComponent(name)}&limit=3`,
      {},
      { maxRetries: 2, initialMs: 500 }
    );
    if (!res2.ok) return [];
    const data2 = (await res2.json()) as { results?: unknown[] };
    return parseLabelResults(data2.results ?? []);
  } catch {
    return [];
  }
}
