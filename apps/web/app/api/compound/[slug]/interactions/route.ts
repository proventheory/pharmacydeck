/**
 * GET /api/compound/[slug]/interactions — structured DDI list for a compound.
 */

import { NextResponse } from "next/server";
import { getSupabase } from "database";
import { getCompoundBySlugFromSupabase } from "@/lib/data";

function slugFromName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  if (!slug?.trim()) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }

  const compound = await getCompoundBySlugFromSupabase(slug);
  if (!compound?.compound_id) {
    return NextResponse.json({ error: "Compound not found" }, { status: 404 });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const { data: rows } = await supabase
    .from("compound_interaction")
    .select("id, compound_id_a, compound_id_b, severity, description, mechanism, management, source")
    .or(`compound_id_a.eq.${compound.compound_id},compound_id_b.eq.${compound.compound_id}`);

  if (!rows?.length) {
    return NextResponse.json({ interactions: [] });
  }

  const otherIds = [...new Set(rows.map((r) => (r.compound_id_a === compound.compound_id ? r.compound_id_b : r.compound_id_a)))];
  const { data: compounds } = await supabase
    .from("compound")
    .select("id, canonical_name")
    .in("id", otherIds);
  const nameById = new Map((compounds ?? []).map((c) => [c.id, c.canonical_name]));

  const interactions = rows.map((r) => {
    const otherId = r.compound_id_a === compound.compound_id ? r.compound_id_b : r.compound_id_a;
    const otherName = nameById.get(otherId) ?? null;
    return {
      id: r.id,
      other_compound_id: otherId,
      other_canonical_name: otherName,
      other_slug: otherName ? slugFromName(otherName) : null,
      severity: r.severity,
      description: r.description,
      mechanism: r.mechanism,
      management: r.management,
      source: r.source,
    };
  });

  return NextResponse.json({ interactions });
}
