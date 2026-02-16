/**
 * Data layer: fetch compounds and cards from Supabase.
 * Used by server components. Falls back to mock data when DB is empty or unavailable.
 */

import { getSupabase } from "database";

export interface CompoundWithCard {
  rxcui: string;
  canonical_name: string;
  description: string | null;
  card: {
    classification: string | null;
    mechanism_summary: string | null;
    uses_summary: string | null;
    safety_summary: string | null;
    source_links: string[] | null;
  };
}

function slugFromName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-");
}

function compoundWithCardFromRows(compound: { rxcui: string; canonical_name: string; description: string | null }, card: { classification: string | null; mechanism_summary: string | null; uses_summary: string | null; safety_summary: string | null; source_links: unknown } | null): CompoundWithCard {
  return {
    rxcui: compound.rxcui,
    canonical_name: compound.canonical_name,
    description: compound.description,
    card: card
      ? {
          classification: card.classification,
          mechanism_summary: card.mechanism_summary,
          uses_summary: card.uses_summary,
          safety_summary: card.safety_summary,
          source_links: Array.isArray(card.source_links) ? card.source_links : card.source_links ? [String(card.source_links)] : null,
        }
      : {
          classification: null,
          mechanism_summary: null,
          uses_summary: null,
          safety_summary: null,
          source_links: null,
        },
  };
}

export async function getCompoundsFromSupabase(): Promise<CompoundWithCard[]> {
  try {
    const supabase = getSupabase();
    const { data: compounds, error: compoundsError } = await supabase
      .from("compound")
      .select("rxcui, canonical_name, description")
      .order("canonical_name");

    if (compoundsError || !compounds?.length) return [];

    const { data: cards, error: cardsError } = await supabase
      .from("card")
      .select("rxcui, classification, mechanism_summary, uses_summary, safety_summary, source_links");

    if (cardsError) return compounds.map((c) => compoundWithCardFromRows(c, null));

    const cardByRxcui = new Map(
      (cards ?? []).map((c) => [c.rxcui, c])
    );
    return compounds.map((c) => compoundWithCardFromRows(c, cardByRxcui.get(c.rxcui) ?? null));
  } catch {
    return [];
  }
}

export async function getCompoundBySlugFromSupabase(slug: string): Promise<CompoundWithCard | null> {
  try {
    const supabase = getSupabase();
    const { data: compounds, error: compoundsError } = await supabase
      .from("compound")
      .select("rxcui, canonical_name, description");

    if (compoundsError || !compounds?.length) return null;

    const normalized = slug.toLowerCase();
    const compound = compounds.find(
      (c) => slugFromName(c.canonical_name) === normalized
    );
    if (!compound) return null;

    const { data: cardRow } = await supabase
      .from("card")
      .select("classification, mechanism_summary, uses_summary, safety_summary, source_links")
      .eq("rxcui", compound.rxcui)
      .single();

    return compoundWithCardFromRows(compound, cardRow);
  } catch {
    return null;
  }
}

export async function getCompoundByRxcuiFromSupabase(rxcui: string): Promise<CompoundWithCard | null> {
  try {
    const supabase = getSupabase();
    const { data: compound, error: compoundError } = await supabase
      .from("compound")
      .select("rxcui, canonical_name, description")
      .eq("rxcui", rxcui)
      .single();

    if (compoundError || !compound) return null;

    const { data: cardRow } = await supabase
      .from("card")
      .select("classification, mechanism_summary, uses_summary, safety_summary, source_links")
      .eq("rxcui", rxcui)
      .single();

    return compoundWithCardFromRows(compound, cardRow);
  } catch {
    return null;
  }
}
