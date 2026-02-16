/**
 * PubMed evidence via NCBI E-utilities.
 * https://eutils.ncbi.nlm.nih.gov/entrez/eutils/
 * Required: tool, email (and optional api_key for >3 req/s).
 */

import { fetchWithRetry } from "./fetchWithRetry.js";

const EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const TOOL = "PharmacyDeck";
const EMAIL = "contact@pharmacydeck.com";

export interface PubmedStudyResult {
  pubmed_id: string;
  title: string | null;
  journal: string | null;
  publication_date: string | null;
  study_type: string | null;
  population_size: number | null;
  summary: string | null;
  doi: string | null;
  pubmed_url: string;
}

function parsePubDate(dp: unknown): string | null {
  if (typeof dp === "string" && dp.length >= 4) return dp.slice(0, 10).replace(/\s+/g, "-");
  return null;
}

function inferStudyType(title: string | null, summary: string | null): string | null {
  const t = `${title ?? ""} ${summary ?? ""}`.toLowerCase();
  if (/\bmeta[- ]?analysis|metaanalysis\b/.test(t)) return "meta_analysis";
  if (/\bsystematic review\b/.test(t)) return "systematic_review";
  if (/\brandomized|RCT|double[- ]blind|placebo[- ]controlled\b/.test(t)) return "randomized_controlled_trial";
  if (/\bobservational|cohort|case[- ]control\b/.test(t)) return "observational";
  return null;
}

export async function fetchPubmedStudiesForCompound(
  compoundName: string,
  maxStudies: number = 15
): Promise<PubmedStudyResult[]> {
  try {
    const searchUrl = `${EUTILS_BASE}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(compoundName)}&retmax=${maxStudies}&retmode=json&tool=${TOOL}&email=${EMAIL}`;
    const searchRes = await fetchWithRetry(searchUrl, {}, { maxRetries: 2, initialMs: 600 });
    if (!searchRes.ok) return [];
    const searchData = (await searchRes.json()) as { esearchresult?: { idlist?: string[] } };
    const idlist = searchData.esearchresult?.idlist ?? [];
    if (idlist.length === 0) return [];

    const idParam = idlist.join(",");
    const summaryUrl = `${EUTILS_BASE}/esummary.fcgi?db=pubmed&id=${idParam}&retmode=json&tool=${TOOL}&email=${EMAIL}`;
    const summaryRes = await fetchWithRetry(summaryUrl, {}, { maxRetries: 2, initialMs: 600 });
    if (!summaryRes.ok) return [];
    const summaryData = (await summaryRes.json()) as {
      result?: Record<string, { title?: string; source?: string; pubdate?: string; elocationid?: string; pmid?: string }>;
    };
    const result = summaryData.result ?? {};
    const studies: PubmedStudyResult[] = [];
    for (const id of idlist) {
      const item = result[id];
      if (!item) continue;
      const title = typeof item.title === "string" ? item.title : null;
      const journal = typeof item.source === "string" ? item.source : null;
      const pubdate = parsePubDate(item.pubdate);
      const doi = typeof item.elocationid === "string" && item.elocationid.startsWith("doi:") ? item.elocationid.slice(4) : null;
      const pmid = item.pmid ?? id;
      studies.push({
        pubmed_id: String(pmid),
        title,
        journal,
        publication_date: pubdate,
        study_type: null,
        population_size: null,
        summary: null,
        doi,
        pubmed_url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      });
    }

    return studies;
  } catch {
    return [];
  }
}
