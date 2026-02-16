/**
 * PubChem resolution and chemistry properties.
 * PUG REST: https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/...
 */

import { fetchWithRetry } from "./fetchWithRetry.js";

export interface PubChemResult {
  cid: string;
  formula: string | null;
  molecular_weight: number | null;
  molecular_formula: string | null;
  inchi_key: string | null;
  smiles: string | null;
  chemistry_profile: Record<string, unknown>;
}

export async function fetchPubChemForRxcui(
  _rxcui: string,
  canonicalName: string
): Promise<PubChemResult | null> {
  try {
    const name = canonicalName.split(/\s+/)[0];
    if (!name) return null;
    const cidRes = await fetchWithRetry(
      `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(name)}/cids/JSON`,
      {},
      { maxRetries: 3, initialMs: 500 }
    );
    if (!cidRes.ok) return null;
    const cidData = (await cidRes.json()) as { IdentifierList?: { CID?: number[] } };
    const cids = cidData.IdentifierList?.CID;
    if (!cids || cids.length === 0) return null;
    const cid = String(cids[0]);

    const propRes = await fetchWithRetry(
      `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/property/MolecularWeight,MolecularFormula,InChIKey,CanonicalSMILES/JSON`,
      {},
      { maxRetries: 2, initialMs: 500 }
    );
    let molecular_weight: number | null = null;
    let molecular_formula: string | null = null;
    let inchi_key: string | null = null;
    let smiles: string | null = null;
    if (propRes.ok) {
      const propData = (await propRes.json()) as {
        PropertyTable?: {
          Properties?: Array<{
            MolecularWeight?: number;
            MolecularFormula?: string;
            InChIKey?: string;
            CanonicalSMILES?: string;
          }>;
        }
      };
      const p = propData.PropertyTable?.Properties?.[0];
      if (p) {
        molecular_weight = p.MolecularWeight ?? null;
        molecular_formula = p.MolecularFormula ?? null;
        inchi_key = p.InChIKey ?? null;
        smiles = p.CanonicalSMILES ?? null;
      }
    }

    const chemistry_profile: Record<string, unknown> = {};
    if (molecular_weight != null) chemistry_profile.molecular_weight = molecular_weight;
    if (molecular_formula) chemistry_profile.formula = molecular_formula;
    if (inchi_key) chemistry_profile.inchi_key = inchi_key;
    if (smiles) chemistry_profile.smiles = smiles;

    return {
      cid,
      formula: molecular_formula,
      molecular_weight,
      molecular_formula,
      inchi_key,
      smiles,
      chemistry_profile: Object.keys(chemistry_profile).length ? chemistry_profile : {},
    };
  } catch {
    return null;
  }
}
