import { NextRequest } from "next/server";
import { getCompoundByRxcuiFromSupabase, getCompoundBySlugFromSupabase } from "@/lib/data";

export const dynamic = "force-dynamic";

function slugFromCanonicalName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

/** GET /api/compound/full?rxcui=84815 — returns full compound (card + regulatory + studies) for compare page. */
export async function GET(request: NextRequest) {
  const rxcui = request.nextUrl.searchParams.get("rxcui")?.trim();
  if (!rxcui) return Response.json({ error: "Missing rxcui" }, { status: 400 });

  const byRxcui = await getCompoundByRxcuiFromSupabase(rxcui);
  if (!byRxcui) return Response.json({ error: "Compound not found" }, { status: 404 });

  const slug = byRxcui.card?.slug ?? slugFromCanonicalName(byRxcui.canonical_name);
  const full = await getCompoundBySlugFromSupabase(slug);
  if (!full) return Response.json(byRxcui);

  return Response.json(full);
}
