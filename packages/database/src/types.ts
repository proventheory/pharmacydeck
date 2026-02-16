/**
 * Canonical identity: compound.id (uuid). RxCUI lives on compound; everything else FKs to compound.id.
 */

export interface Compound {
  id: string;
  rxcui: string;
  canonical_name: string;
  normalized_name: string | null;
  status: "active" | "obsolete";
  created_at?: string;
  updated_at?: string;
}

export interface CompoundSynonym {
  id: string;
  compound_id: string;
  synonym: string;
  source: string;
  is_preferred: boolean;
  created_at?: string;
}

export interface CompoundRelation {
  id: string;
  compound_id_from: string;
  compound_id_to: string;
  relation_type: string;
  created_at?: string;
}

export interface CompoundPubchem {
  id: string;
  compound_id: string;
  pubchem_cid: string;
  molecular_formula: string | null;
  molecular_weight: string | null;
  smiles: string | null;
  inchi_key: string | null;
  created_at?: string;
}

export interface CompoundLabelSnippet {
  id: string;
  compound_id: string;
  section_type: string;
  snippet_text: string;
  source: string;
  source_url: string | null;
  source_version: string | null;
  created_at?: string;
}

/** Card Schema v1 JSON shapes (presentation layer) */
export interface PharmacokineticsProfile {
  half_life_hours?: number;
  bioavailability_percent?: number;
  time_to_peak_hours?: number;
  steady_state_days?: number;
  clearance?: string;
  metabolism?: string;
  blood_brain_barrier?: string;
}

export interface PharmacodynamicsProfile {
  primary_effect?: string;
  secondary_effects?: string[];
  dose_response?: string;
}

export interface ClinicalProfile {
  approved_indications?: string[];
  common_off_label?: string[];
  onset_days?: number | null;
  monitoring?: string[];
  contraindications?: string[];
}

export interface ChemistryProfile {
  molecular_weight?: number;
  formula?: string;
  inchi_key?: string;
  smiles?: string;
  hydrogen_bond_donors?: number;
  hydrogen_bond_acceptors?: number;
}

export interface DeckStats {
  rarity_score?: number;
  metabolic_score?: number;
  cns_activity_score?: number;
  adoption_score?: number;
  trend_score?: number;
}

export interface AvailabilityProfile {
  available?: boolean;
  requires_compounding?: boolean;
  forms?: string[];
}

export interface CompoundCard {
  id: string;
  compound_id: string;
  version: number;
  slug: string | null;
  canonical_name: string | null;
  rxcui: string | null;
  molecule_type: string | null;
  primary_class: string | null;
  secondary_classes: string[] | null;
  route_forms: string[] | null;
  mechanism_summary: string | null;
  mechanism_targets: string[] | null;
  mechanism_type: string | null;
  uses_summary: string | null;
  safety_summary: string | null;
  pharmacokinetics: PharmacokineticsProfile | Record<string, unknown>;
  pharmacodynamics: PharmacodynamicsProfile | Record<string, unknown>;
  clinical_profile: ClinicalProfile | Record<string, unknown>;
  adverse_effect_frequency: Record<string, string> | Record<string, unknown>;
  chemistry_profile: ChemistryProfile | Record<string, unknown>;
  interaction_summary: string | null;
  interactions_count: number | null;
  deck_stats: DeckStats | Record<string, unknown>;
  deck_tags: string[] | null;
  approval_year: number | null;
  patent_expiration_year: number | null;
  availability_profile: AvailabilityProfile | Record<string, unknown>;
  source_links: unknown;
  source_refs: unknown;
  published: boolean | null;
  published_at: string | null;
  created_at?: string;
  updated_at?: string;
  /** Legacy (002) */
  classification: string | null;
  rarity_score: number | null;
  power_score: number | null;
  vibe_tags: unknown;
  /** Regulatory + evidence (004) */
  regulatory_summary: string | null;
  evidence_summary: string | null;
  study_count: number | null;
  guideline_count: number | null;
}

export interface CompoundRegulatory {
  id: string;
  compound_id: string;
  approval_date: string | null;
  approval_type: string | null;
  approval_status: string | null;
  fda_application_number: string | null;
  fda_label_url: string | null;
  boxed_warning: boolean;
  rems_required: boolean;
  controlled_substance_schedule: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CompoundFdaLabelSection {
  id: string;
  compound_id: string;
  section: string;
  content: string;
  source_url: string | null;
  version_date: string | null;
  created_at?: string;
}

export interface CompoundStudy {
  id: string;
  compound_id: string;
  pubmed_id: string;
  title: string | null;
  journal: string | null;
  publication_date: string | null;
  study_type: string | null;
  population_size: number | null;
  summary: string | null;
  doi: string | null;
  pubmed_url: string | null;
  created_at?: string;
}

export interface CompoundStudyFinding {
  id: string;
  study_id: string;
  finding_type: string | null;
  finding_summary: string;
  confidence_level: string | null;
  created_at?: string;
}

export interface CompoundGuidelineReference {
  id: string;
  compound_id: string;
  organization: string;
  recommendation: string | null;
  source_url: string | null;
  recommendation_date: string | null;
  created_at?: string;
}

export interface CompoundSourceReference {
  id: string;
  compound_id: string;
  source_type: string;
  source_url: string | null;
  last_checked_at: string | null;
  created_at?: string;
}

export interface DataPack {
  id: string;
  version: string;
  checksum: string;
  created_at?: string;
  download_url: string | null;
}

export interface UserDeck {
  id: string;
  user_id: string | null;
  name: string;
  created_at?: string;
}

export interface UserDeckItem {
  id: string;
  deck_id: string;
  compound_id: string;
  created_at?: string;
}

export interface CompoundAiCache {
  id: string;
  compound_id: string;
  query_hash: string;
  response: string;
  created_at?: string;
}
