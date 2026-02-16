import { NextRequest } from "next/server";
import { getSupabase } from "database";

export const dynamic = "force-dynamic";

/**
 * GET /api/search?q=semaglutide
 * Returns existing compounds matching the query (by slug or canonical_name).
 * Does not trigger generation; use /api/resolve for that.
 */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q");
  const query = (q ?? "").trim().toLowerCase();
  if (!query) {
    return Response.json({ compounds: [] });
  }

  try {
    const supabase = getSupabase();
    if (!supabase) return Response.json({ compounds: [] });
    const { data: compounds } = await supabase
      .from("compound")
      .select("id, rxcui, canonical_name")
      .eq("status", "active")
      .or(`canonical_name.ilike.%${query}%,normalized_name.ilike.%${query}%`)
      .limit(20);

    if (!compounds?.length) return Response.json({ compounds: [] });

    const ids = compounds.map((c) => c.id);
    const { data: cards } = await supabase
      .from("compound_card")
      .select("compound_id, version, slug, canonical_name, rxcui, primary_class, mechanism_summary")
      .in("compound_id", ids)
      .order("version", { ascending: false });

    type CardRow = { compound_id: string; version: number; slug: string | null; canonical_name: string | null; rxcui: string | null; primary_class: string | null; mechanism_summary: string | null };
    const bestCard = new Map<string, CardRow>();
    for (const c of cards ?? []) {
      if (!bestCard.has(c.compound_id)) bestCard.set(c.compound_id, c);
    }

    const results = compounds.map((c) => {
      const card = bestCard.get(c.id);
      return {
        slug: card?.slug ?? null,
        canonical_name: c.canonical_name,
        rxcui: c.rxcui,
        primary_class: card?.primary_class ?? null,
        mechanism_summary: card?.mechanism_summary?.slice(0, 200) ?? null,
      };
    });

    return Response.json({ compounds: results });
  } catch (err) {
    console.error("search error:", err);
    return Response.json({ compounds: [] });
  }
}
