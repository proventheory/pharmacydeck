/**
 * FDA regulatory data from openFDA drug label API.
 * https://api.fda.gov/drug/label.json
 */

import { fetchWithRetry } from "./fetchWithRetry.js";

const OPENFDA_LABEL = "https://api.fda.gov/drug/label.json";

export interface FdaRegulatoryResult {
  fda_application_number: string | null;
  fda_label_url: string | null;
  boxed_warning: boolean;
  approval_type: string | null;
  approval_status: "approved" | null;
}

export interface FdaLabelSectionInput {
  section: string;
  content: string;
  source_url: string | null;
}

export interface FdaResult {
  regulatory: FdaRegulatoryResult;
  label_sections: FdaLabelSectionInput[];
}

function parseOpenFda(obj: Record<string, unknown>): FdaRegulatoryResult {
  const openfda = obj.openfda as Record<string, unknown> | undefined;
  const appNum = openfda?.application_number;
  const appNumber =
    Array.isArray(appNum) && appNum.length > 0 && typeof appNum[0] === "string"
      ? appNum[0]
      : null;
  const productType = openfda?.product_type;
  const approvalType =
    Array.isArray(productType) && productType.length > 0 && typeof productType[0] === "string"
      ? (productType[0] as string).toUpperCase()
      : null;
  const boxed = obj.boxed_warning;
  const hasBoxed =
    Array.isArray(boxed) && boxed.length > 0 && boxed.some((s) => String(s).trim().length > 0);

  return {
    fda_application_number: appNumber,
    fda_label_url: null,
    boxed_warning: hasBoxed,
    approval_type: approvalType,
    approval_status: "approved",
  };
}

const LABEL_SECTION_KEYS = [
  "boxed_warning",
  "indications_and_usage",
  "contraindications",
  "warnings",
  "adverse_reactions",
  "clinical_pharmacology",
  "mechanism_of_action",
  "dosage_and_administration",
] as const;

function parseLabelSections(results: unknown[], sourceUrl: string | null): FdaLabelSectionInput[] {
  const out: FdaLabelSectionInput[] = [];
  if (!Array.isArray(results) || results.length === 0) return out;
  const row = results[0] as Record<string, unknown>;
  for (const key of LABEL_SECTION_KEYS) {
    const val = row[key];
    if (Array.isArray(val) && val.length > 0) {
      const content = val.map((v) => (typeof v === "string" ? v : String(v))).join("\n\n");
      if (content.trim()) out.push({ section: key, content: content.slice(0, 15000), source_url: sourceUrl });
    } else if (typeof val === "string" && val.trim()) {
      out.push({ section: key, content: val.slice(0, 15000), source_url: sourceUrl });
    }
  }
  return out;
}

export async function fetchFdaForRxcui(
  rxcui: string,
  canonicalName: string
): Promise<FdaResult | null> {
  try {
    const byRxcui = await fetchWithRetry(
      `${OPENFDA_LABEL}?search=openfda.rxcui:${encodeURIComponent(rxcui)}&limit=1`,
      {},
      { maxRetries: 2, initialMs: 500 }
    );
    if (byRxcui.ok) {
      const data = (await byRxcui.json()) as { results?: unknown[] };
      if (data.results?.length) {
        const first = data.results[0] as Record<string, unknown>;
        const regulatory = parseOpenFda(first);
        const label_sections = parseLabelSections(data.results, "https://api.fda.gov/drug/label.json");
        return { regulatory, label_sections };
      }
    }

    const name = canonicalName.split(/\s+/)[0];
    if (!name) return null;
    const byName = await fetchWithRetry(
      `${OPENFDA_LABEL}?search=openfda.substance_name:${encodeURIComponent(name)}&limit=1`,
      {},
      { maxRetries: 2, initialMs: 500 }
    );
    if (!byName.ok) return null;
    const data2 = (await byName.json()) as { results?: unknown[] };
    if (!data2.results?.length) return null;
    const first = data2.results[0] as Record<string, unknown>;
    const regulatory = parseOpenFda(first);
    const label_sections = parseLabelSections(data2.results, "https://api.fda.gov/drug/label.json");
    return { regulatory, label_sections };
  } catch {
    return null;
  }
}
