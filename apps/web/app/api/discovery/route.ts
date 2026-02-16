/**
 * GET /api/discovery — discovery search: filter compounds by drug_group and/or target type.
 * Query params: drug_group, target_type (target|enzyme|transporter|carrier), limit.
 */

import { NextResponse } from "next/server";
import { getSupabase } from "database";

function slugFromName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const drugGroup = searchParams.get("drug_group")?.trim() || null;
  const targetType = searchParams.get("target_type")?.trim() || null;
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 100);

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  let compoundQuery = supabase
    .from("compound")
    .select("id, canonical_name, rxcui, drug_group")
    .eq("status", "active");

  if (drugGroup) {
    compoundQuery = compoundQuery.eq("drug_group", drugGroup);
  }

  const { data: compounds, error: compoundsError } = await compoundQuery.order("canonical_name").limit(limit * 2);

  if (compoundsError) {
    return NextResponse.json({ error: compoundsError.message }, { status: 500 });
  }
  if (!compounds?.length) {
    return NextResponse.json({ compounds: [], total: 0 });
  }

  const compoundIds = compounds.map((c) => c.id);
  const idToCompound = new Map(compounds.map((c) => [c.id, c]));

  let filteredIds = compoundIds;
  if (targetType) {
    const { data: ctData } = await supabase
      .from("compound_target")
      .select("compound_id, target_id")
      .in("compound_id", compoundIds);
    const targetIds = [...new Set((ctData ?? []).map((r: { target_id: string }) => r.target_id))];
    if (targetIds.length === 0) {
      return NextResponse.json({ compounds: [], total: 0 });
    }
    const { data: targetData } = await supabase
      .from("target")
      .select("id")
      .eq("type", targetType)
      .in("id", targetIds);
    const targetIdSet = new Set((targetData ?? []).map((t: { id: string }) => t.id));
    const compoundIdsWithTarget = new Set(
      (ctData ?? [])
        .filter((r: { target_id: string }) => targetIdSet.has(r.target_id))
        .map((r: { compound_id: string }) => r.compound_id)
    );
    filteredIds = compoundIds.filter((id) => compoundIdsWithTarget.has(id));
  }

  const take = filteredIds.slice(0, limit);
  const { data: cards } = await supabase
    .from("compound_card")
    .select("compound_id, slug, mechanism_targets")
    .in("compound_id", take)
    .order("version", { ascending: false });
  const latestCardByCompound = new Map<string, { slug: string | null; mechanism_targets: string[] | null }>();
  for (const c of cards ?? []) {
    const key = (c as { compound_id: string }).compound_id;
    if (!latestCardByCompound.has(key)) {
      latestCardByCompound.set(key, {
        slug: (c as { slug?: string }).slug ?? null,
        mechanism_targets: (c as { mechanism_targets?: string[] }).mechanism_targets ?? null,
      });
    }
  }

  const compoundsOut = take.map((id) => {
    const c = idToCompound.get(id)!;
    const card = latestCardByCompound.get(id);
    return {
      compound_id: id,
      canonical_name: c.canonical_name,
      rxcui: c.rxcui,
      slug: card?.slug ?? slugFromName(c.canonical_name ?? ""),
      drug_group: c.drug_group,
      mechanism_targets: card?.mechanism_targets ?? [],
    };
  });

  return NextResponse.json({ compounds: compoundsOut, total: compoundsOut.length });
}
