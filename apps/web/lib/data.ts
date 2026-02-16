/**
 * Data layer: fetch compounds and latest card from Supabase (Card Schema v1).
 * compound + compound_card (latest version per compound).
 */

import { getSupabase } from "database";

export interface CompoundCardPresentation {
  classification: string | null;
  mechanism_summary: string | null;
  uses_summary: string | null;
  safety_summary: string | null;
  source_links: string[] | null;
  slug: string | null;
  primary_class: string | null;
  molecule_type: string | null;
  pharmacokinetics: unknown;
  pharmacodynamics: unknown;
  clinical_profile: unknown;
  adverse_effect_frequency: unknown;
  chemistry_profile: unknown;
  deck_stats: unknown;
  deck_tags: string[] | null;
  availability_profile: unknown;
  regulatory_summary: string | null;
  evidence_summary: string | null;
  study_count: number | null;
  guideline_count: number | null;
}

export interface CompoundRegulatoryPresentation {
  approval_date: string | null;
  approval_type: string | null;
  approval_status: string | null;
  fda_application_number: string | null;
  fda_label_url: string | null;
  boxed_warning: boolean;
  rems_required: boolean;
  controlled_substance_schedule: string | null;
}

export interface CompoundStudyPresentation {
  id: string;
  pubmed_id: string;
  title: string | null;
  journal: string | null;
  publication_date: string | null;
  study_type: string | null;
  summary: string | null;
  pubmed_url: string | null;
}

export interface CompoundEditorialPresentation {
  title: string;
  url: string | null;
  summary: string | null;
  source: string;
  published_date: string | null;
}

export interface CompoundWithCard {
  compound_id?: string;
  rxcui: string;
  canonical_name: string;
  description: string | null;
  card: CompoundCardPresentation;
  regulatory?: CompoundRegulatoryPresentation | null;
  studies?: CompoundStudyPresentation[];
  editorial?: CompoundEditorialPresentation[];
}

function slugFromName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

const CARD_SELECT =
  "compound_id, version, slug, canonical_name, rxcui, molecule_type, primary_class, secondary_classes, route_forms, mechanism_summary, mechanism_targets, mechanism_type, uses_summary, safety_summary, pharmacokinetics, pharmacodynamics, clinical_profile, adverse_effect_frequency, chemistry_profile, interaction_summary, interactions_count, deck_stats, deck_tags, approval_year, patent_expiration_year, availability_profile, source_links, source_refs, published, classification, regulatory_summary, evidence_summary, study_count, guideline_count";

type CardRow = {
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
  pharmacokinetics: unknown;
  pharmacodynamics: unknown;
  clinical_profile: unknown;
  adverse_effect_frequency: unknown;
  chemistry_profile: unknown;
  interaction_summary: string | null;
  interactions_count: number | null;
  deck_stats: unknown;
  deck_tags: string[] | null;
  approval_year: number | null;
  patent_expiration_year: number | null;
  availability_profile: unknown;
  source_links: unknown;
  source_refs: unknown;
  published: boolean | null;
  classification: string | null;
  regulatory_summary?: string | null;
  evidence_summary?: string | null;
  study_count?: number | null;
  guideline_count?: number | null;
};

function latestCardPerCompound(cards: CardRow[]): Map<string, CardRow> {
  const map = new Map<string, CardRow>();
  for (const c of cards) {
    const existing = map.get(c.compound_id);
    if (!existing || c.version > existing.version) map.set(c.compound_id, c);
  }
  return map;
}

function normalizeSourceLinks(v: unknown): string[] | null {
  if (Array.isArray(v)) return v.map((x) => (typeof x === "string" ? x : String(x)));
  if (v != null) return [String(v)];
  return null;
}

function cardToPresentation(card: CardRow | null): CompoundCardPresentation {
  if (!card)
    return {
      classification: null,
      mechanism_summary: null,
      uses_summary: null,
      safety_summary: null,
      source_links: null,
      slug: null,
      primary_class: null,
      molecule_type: null,
      pharmacokinetics: null,
      pharmacodynamics: null,
      clinical_profile: null,
      adverse_effect_frequency: null,
      chemistry_profile: null,
      deck_stats: null,
      deck_tags: null,
      availability_profile: null,
      regulatory_summary: null,
      evidence_summary: null,
      study_count: null,
      guideline_count: null,
    };
  return {
    classification: card.classification,
    mechanism_summary: card.mechanism_summary,
    uses_summary: card.uses_summary,
    safety_summary: card.safety_summary,
    source_links: normalizeSourceLinks(card.source_links),
    slug: card.slug,
    primary_class: card.primary_class,
    molecule_type: card.molecule_type,
    pharmacokinetics: card.pharmacokinetics ?? null,
    pharmacodynamics: card.pharmacodynamics ?? null,
    clinical_profile: card.clinical_profile ?? null,
    adverse_effect_frequency: card.adverse_effect_frequency ?? null,
    chemistry_profile: card.chemistry_profile ?? null,
    deck_stats: card.deck_stats ?? null,
    deck_tags: card.deck_tags ?? null,
    availability_profile: card.availability_profile ?? null,
    regulatory_summary: card.regulatory_summary ?? null,
    evidence_summary: card.evidence_summary ?? null,
    study_count: card.study_count ?? null,
    guideline_count: card.guideline_count ?? null,
  };
}

function compoundWithCardFromRows(
  compound: { id: string; rxcui: string; canonical_name: string },
  card: CardRow | null,
  extra?: {
    regulatory?: CompoundRegulatoryPresentation | null;
    studies?: CompoundStudyPresentation[];
    editorial?: CompoundEditorialPresentation[];
  }
): CompoundWithCard {
  return {
    compound_id: compound.id,
    rxcui: compound.rxcui,
    canonical_name: compound.canonical_name,
    description: card?.mechanism_summary ?? null,
    card: cardToPresentation(card),
    regulatory: extra?.regulatory ?? null,
    studies: extra?.studies ?? [],
    editorial: extra?.editorial ?? [],
  };
}

export async function getCompoundsFromSupabase(): Promise<CompoundWithCard[]> {
  try {
    const supabase = getSupabase();
    if (!supabase) return [];
    const { data: compounds, error: compoundsError } = await supabase
      .from("compound")
      .select("id, rxcui, canonical_name")
      .eq("status", "active")
      .order("canonical_name");

    if (compoundsError || !compounds?.length) return [];

    const ids = compounds.map((c) => c.id);
    const { data: cards, error: cardsError } = await supabase
      .from("compound_card")
      .select(CARD_SELECT)
      .in("compound_id", ids);

    if (cardsError) return compounds.map((c) => compoundWithCardFromRows(c, null));
    const cardByCompoundId = latestCardPerCompound(cards ?? []);
    return compounds.map((c) => compoundWithCardFromRows(c, cardByCompoundId.get(c.id) ?? null));
  } catch {
    return [];
  }
}

export async function getCompoundBySlugFromSupabase(slug: string): Promise<CompoundWithCard | null> {
  try {
    const supabase = getSupabase();
    if (!supabase) return null;
    const normalized = slug.toLowerCase().replace(/[^a-z0-9-]/g, "");

    const { data: cardBySlug } = await supabase
      .from("compound_card")
      .select("compound_id")
      .eq("slug", normalized)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    let compound: { id: string; rxcui: string; canonical_name: string } | null = null;
    if (cardBySlug?.compound_id) {
      const { data: c } = await supabase
        .from("compound")
        .select("id, rxcui, canonical_name")
        .eq("id", cardBySlug.compound_id)
        .eq("status", "active")
        .single();
      compound = c ?? null;
    }
    if (!compound) {
      const { data: compounds } = await supabase
        .from("compound")
        .select("id, rxcui, canonical_name")
        .eq("status", "active");
      compound =
        compounds?.find(
          (c) => slugFromName(c.canonical_name) === normalized || (c.canonical_name && slugFromName(c.canonical_name) === normalized)
        ) ?? null;
    }
    if (!compound) return null;

    const [cardsRes, regulatoryRes, studiesRes] = await Promise.all([
      supabase.from("compound_card").select(CARD_SELECT).eq("compound_id", compound.id).order("version", { ascending: false }).limit(1),
      supabase.from("compound_regulatory").select("*").eq("compound_id", compound.id).limit(1).maybeSingle(),
      supabase.from("compound_study").select("id, pubmed_id, title, journal, publication_date, study_type, summary, pubmed_url").eq("compound_id", compound.id).order("publication_date", { ascending: false }).limit(10),
    ]);
    const editorialRes = await supabase.from("compound_editorial_reference").select("title, summary, source, source_url, published_date").eq("compound_id", compound.id).order("published_date", { ascending: false }).limit(5);
    const cardRow = cardsRes.data?.[0] ?? null;
    const regRow = regulatoryRes.data;
    const regulatory: CompoundRegulatoryPresentation | null =
      regRow != null
        ? {
            approval_date: regRow.approval_date ?? null,
            approval_type: regRow.approval_type ?? null,
            approval_status: regRow.approval_status ?? null,
            fda_application_number: regRow.fda_application_number ?? null,
            fda_label_url: regRow.fda_label_url ?? null,
            boxed_warning: regRow.boxed_warning ?? false,
            rems_required: regRow.rems_required ?? false,
            controlled_substance_schedule: regRow.controlled_substance_schedule ?? null,
          }
        : null;
    const studies: CompoundStudyPresentation[] = (studiesRes.data ?? []).map((s) => ({
      id: s.id,
      pubmed_id: s.pubmed_id,
      title: s.title ?? null,
      journal: s.journal ?? null,
      publication_date: s.publication_date ?? null,
      study_type: s.study_type ?? null,
      summary: s.summary ?? null,
      pubmed_url: s.pubmed_url ?? null,
    }));
    const editorial: CompoundEditorialPresentation[] = (editorialRes.error ? [] : editorialRes.data ?? []).map((e) => ({
      title: e.title,
      url: e.source_url ?? null,
      summary: e.summary ?? null,
      source: e.source ?? "pharmacytimes",
      published_date: e.published_date ?? null,
    }));
    return compoundWithCardFromRows(compound, cardRow, { regulatory, studies, editorial });
  } catch {
    return null;
  }
}

export async function getCompoundByRxcuiFromSupabase(rxcui: string): Promise<CompoundWithCard | null> {
  try {
    const supabase = getSupabase();
    if (!supabase) return null;
    const { data: compound, error: compoundError } = await supabase
      .from("compound")
      .select("id, rxcui, canonical_name")
      .eq("rxcui", rxcui)
      .single();

    if (compoundError || !compound) return null;

    const { data: cards } = await supabase
      .from("compound_card")
      .select(CARD_SELECT)
      .eq("compound_id", compound.id)
      .order("version", { ascending: false })
      .limit(1);
    const cardRow = cards?.[0] ?? null;
    return compoundWithCardFromRows(compound, cardRow);
  } catch {
    return null;
  }
}
