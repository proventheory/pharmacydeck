import { NextRequest } from "next/server";
import { getSupabase } from "database";

export const dynamic = "force-dynamic";

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

function cardToResponse(card: CardRow | undefined) {
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

export async function GET(request: NextRequest) {
  const rxcuis = request.nextUrl.searchParams.get("rxcuis");
  if (!rxcuis) return Response.json({ compounds: [] });
  const list = rxcuis.split(",").map((s) => s.trim()).filter(Boolean);
  if (list.length === 0 || list.length > 50) return Response.json({ compounds: [] });

  try {
    const supabase = getSupabase();
    const { data: compounds, error: compoundsError } = await supabase
      .from("compound")
      .select("id, rxcui, canonical_name")
      .in("rxcui", list)
      .eq("status", "active");

    if (compoundsError || !compounds?.length) return Response.json({ compounds: [] });

    const ids = compounds.map((c) => c.id);
    const { data: cards } = await supabase.from("compound_card").select(CARD_SELECT).in("compound_id", ids);

    const cardByCompoundId = latestCardPerCompound(cards ?? []);
    const compoundsWithCards = compounds.map((c) => {
      const card = cardByCompoundId.get(c.id);
      return {
        rxcui: c.rxcui,
        canonical_name: c.canonical_name,
        description: card?.mechanism_summary ?? null,
        card: cardToResponse(card),
      };
    });

    return Response.json({ compounds: compoundsWithCards });
  } catch {
    return Response.json({ compounds: [] });
  }
}
