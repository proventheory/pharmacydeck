/**
 * ChEMBL REST API: resolve drug by name, fetch target activities, map to target (enzyme/transporter/carrier).
 * Used in ingest to populate target and compound_target.
 */

import { fetchWithRetry } from "./fetchWithRetry.js";

const CHEMBL_BASE = "https://www.ebi.ac.uk/chembl/api/data";

export type TargetType = "target" | "enzyme" | "transporter" | "carrier";
export type CompoundTargetAction = "agonist" | "antagonist" | "inhibitor" | "substrate" | null;

export interface ChEMBLTargetRow {
  chembl_id: string;
  uniprot_id: string | null;
  name: string;
  gene_symbol: string | null;
  species: string | null;
  organism: string | null;
  aliases: string[];
  type: TargetType;
  source: "chembl";
}

export interface ChEMBLCompoundTargetRow {
  target: ChEMBLTargetRow;
  action: CompoundTargetAction;
  source_url: string | null;
}

/** Map ChEMBL target_type / component type to our target.type */
function mapTargetType(chemblTargetType: string | null, prefName: string): TargetType {
  const lower = `${chemblTargetType ?? ""} ${prefName ?? ""}`.toLowerCase();
  if (/\btransporter\b/.test(lower)) return "transporter";
  if (/\benzyme\b/.test(lower)) return "enzyme";
  if (/\bcarrier\b/.test(lower)) return "carrier";
  return "target";
}

/** Infer action from ChEMBL activity type (e.g. IC50 -> inhibitor, EC50 -> agonist) */
function inferAction(standardType: string | null): CompoundTargetAction {
  if (!standardType) return null;
  const t = standardType.toLowerCase();
  if (/\bic50|ki|kd|inhibition\b/.test(t)) return "inhibitor";
  if (/\bec50|agonist|activation\b/.test(t)) return "agonist";
  if (/\bantagonist\b/.test(t)) return "antagonist";
  if (/\bsubstrate\b/.test(t)) return "substrate";
  return null;
}

/**
 * Search ChEMBL for molecules by name; returns first match molecule_chembl_id or null.
 */
export async function searchMoleculeByName(name: string): Promise<string | null> {
  const q = encodeURIComponent(name.trim());
  const url = `${CHEMBL_BASE}/molecule/search?q=${q}&format=json`;
  const res = await fetchWithRetry(url, {}, { maxRetries: 2, initialMs: 800 });
  if (!res.ok) return null;
  const data = (await res.json()) as { molecules?: { molecule_chembl_id?: string }[] };
  const id = data.molecules?.[0]?.molecule_chembl_id ?? null;
  return id;
}

/**
 * Fetch activities for a molecule; returns list of { target_chembl_id, standard_type }.
 */
async function getActivities(moleculeChemblId: string): Promise<{ target_chembl_id: string; standard_type: string | null }[]> {
  const url = `${CHEMBL_BASE}/activity.json?molecule_chembl_id=${encodeURIComponent(moleculeChemblId)}&limit=500`;
  const res = await fetchWithRetry(url, {}, { maxRetries: 2, initialMs: 800 });
  if (!res.ok) return [];
  const data = (await res.json()) as { activities?: { target_chembl_id?: string; standard_type?: string }[] };
  const activities = data.activities ?? [];
  const seen = new Set<string>();
  return activities
    .filter((a) => a.target_chembl_id && !seen.has(a.target_chembl_id) && seen.add(a.target_chembl_id))
    .map((a) => ({ target_chembl_id: a.target_chembl_id!, standard_type: a.standard_type ?? null }));
}

/**
 * Fetch target details by ChEMBL target ID (type, name, UniProt from components).
 */
async function getTarget(targetChemblId: string): Promise<{
  target_chembl_id: string;
  target_type: string | null;
  pref_name: string;
  organism?: string | null;
  components?: { accessions?: string[]; gene_name?: string }[];
} | null> {
  const url = `${CHEMBL_BASE}/target/${encodeURIComponent(targetChemblId)}.json`;
  const res = await fetchWithRetry(url, {}, { maxRetries: 2, initialMs: 800 });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    target_chembl_id?: string;
    target_type?: string;
    pref_name?: string;
    organism?: string | null;
    target_components?: { accessions?: string[]; gene_name?: string }[];
  };
  const components = data.target_components ?? (data as { components?: { accessions?: string[]; gene_name?: string }[] }).components;
  return {
    target_chembl_id: data.target_chembl_id ?? targetChemblId,
    target_type: data.target_type ?? null,
    pref_name: data.pref_name ?? targetChemblId,
    organism: data.organism ?? null,
    components,
  };
}

/**
 * Fetch drug–target links for a compound by canonical name (and optionally rxcui).
 * Returns list of targets and actions for upsert into target + compound_target.
 */
export async function fetchCompoundTargets(
  canonicalName: string,
  _rxcui?: string | null
): Promise<ChEMBLCompoundTargetRow[]> {
  const moleculeId = await searchMoleculeByName(canonicalName);
  if (!moleculeId) return [];

  const activities = await getActivities(moleculeId);
  if (activities.length === 0) return [];

  const results: ChEMBLCompoundTargetRow[] = [];
  const seenTargets = new Set<string>();

  for (const { target_chembl_id, standard_type } of activities) {
    if (seenTargets.has(target_chembl_id)) continue;
    seenTargets.add(target_chembl_id);

    const targetData = await getTarget(target_chembl_id);
    if (!targetData) continue;

    const uniprotId = targetData.components?.[0]?.accessions?.[0] ?? null;
    const geneSymbol = targetData.components?.[0]?.gene_name ?? null;
    const name = targetData.pref_name || target_chembl_id;
    const type = mapTargetType(targetData.target_type, name);
    const action = inferAction(standard_type);
    const sourceUrl = `https://www.ebi.ac.uk/chembl/target_report_card/${target_chembl_id}/`;
    const organism = targetData.organism ?? null;
    const aliases: string[] = [];
    if (geneSymbol) aliases.push(geneSymbol);
    if (targetData.components?.length) {
      for (const c of targetData.components) {
        if (c.gene_name && !aliases.includes(c.gene_name)) aliases.push(c.gene_name);
      }
    }

    results.push({
      target: {
        chembl_id: target_chembl_id,
        uniprot_id: uniprotId,
        name,
        gene_symbol: geneSymbol,
        species: organism,
        organism,
        aliases,
        type,
        source: "chembl",
      },
      action,
      source_url: sourceUrl,
    });
  }

  return results;
}
