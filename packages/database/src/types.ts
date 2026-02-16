/**
 * Canonical identity: RxCUI. All entities key off RxCUI.
 */

export interface Compound {
  id: string;
  rxcui: string;
  canonical_name: string;
  description: string | null;
}

export interface Synonym {
  id: string;
  rxcui: string;
  term: string;
}

export interface Relationship {
  id: string;
  rxcui_from: string;
  relationship: string;
  rxcui_to: string;
}

export interface LabelSnippet {
  id: string;
  rxcui: string;
  section: string;
  text: string;
  source: string;
}

export interface PubChem {
  id: string;
  rxcui: string;
  cid: string;
  formula: string | null;
}

export interface Card {
  id: string;
  rxcui: string;
  classification: string | null;
  mechanism_summary: string | null;
  uses_summary: string | null;
  safety_summary: string | null;
  source_links: string[] | null;
}
