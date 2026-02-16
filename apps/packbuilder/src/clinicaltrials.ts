/**
 * ClinicalTrials.gov API: search by drug/intervention name, map to compound_trial.
 * Uses Data API v2 where available.
 */

import { fetchWithRetry } from "./fetchWithRetry.js";

const CT_BASE = "https://clinicaltrials.gov/api/v2/studies";

export interface CompoundTrialRow {
  nct_id: string;
  title: string | null;
  phase: string | null;
  status: string | null;
  conditions: string | null;
  source_url: string | null;
}

/**
 * Search ClinicalTrials.gov for studies mentioning the drug name; return up to limit trials.
 */
export async function fetchTrialsForDrug(
  drugName: string,
  limit = 20
): Promise<CompoundTrialRow[]> {
  const params = new URLSearchParams({
    query: drugName.trim(),
    format: "json",
    pageSize: String(Math.min(limit, 50)),
  });
  const url = `${CT_BASE}?${params.toString()}`;
  try {
    const res = await fetchWithRetry(url, {}, { maxRetries: 2, initialMs: 800 });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      studies?: Array<{
        protocolSection?: {
          identificationModule?: { nctId?: string; briefTitle?: string };
          designModule?: { phases?: string[] };
          statusModule?: { overallStatus?: string };
          conditionsModule?: { conditions?: string[] };
        };
      }>;
    };
    const studies = data.studies ?? [];
    const out: CompoundTrialRow[] = [];
    for (const s of studies) {
      const ident = s.protocolSection?.identificationModule;
      const nctId = ident?.nctId;
      if (!nctId) continue;
      const title = ident?.briefTitle ?? null;
      const phases = s.protocolSection?.designModule?.phases;
      const phase = phases?.length ? phases.join(", ") : null;
      const status = s.protocolSection?.statusModule?.overallStatus ?? null;
      const conditionsList = s.protocolSection?.conditionsModule?.conditions;
      const conditions = conditionsList?.length ? conditionsList.join("; ") : null;
      out.push({
        nct_id: nctId,
        title,
        phase,
        status,
        conditions,
        source_url: `https://clinicaltrials.gov/study/${nctId}`,
      });
    }
    return out;
  } catch {
    return [];
  }
}
