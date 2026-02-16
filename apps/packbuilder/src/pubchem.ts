/**
 * PubChem resolution from RxNorm or name. Stub; expand with PUG REST or E-utilities.
 * https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/{name}/cids/JSON
 */

export interface PubChemResult {
  cid: string;
  formula: string | null;
}

export async function fetchPubChemForRxcui(
  _rxcui: string,
  canonicalName: string
): Promise<PubChemResult | null> {
  try {
    const name = canonicalName.split(/\s+/)[0];
    if (!name) return null;
    const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(name)}/cids/JSON`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as { IdentifierList?: { CID?: number[] } };
    const cids = data.IdentifierList?.CID;
    if (!cids || cids.length === 0) return null;
    return { cid: String(cids[0]), formula: null };
  } catch {
    return null;
  }
}
