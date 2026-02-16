import { NextRequest } from "next/server";
import { getCompoundBySlugFromSupabase } from "@/lib/data";
import { getMockCompoundBySlug } from "@/lib/mock-compounds";
import { runIngest, slugFromCanonicalName } from "@/lib/run-ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/resolve?q=semaglutide
 * Returns full compound+card. Tries Supabase, then ingest pipeline, then mock data so search works without a DB.
 */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q");
  const query = (q ?? "").trim();
  if (!query) {
    return Response.json({ error: "Missing q" }, { status: 400 });
  }

  const slug = slugFromCanonicalName(query);

  try {
    let compound = await getCompoundBySlugFromSupabase(slug);
    if (compound) {
      return Response.json({ compound, generated: false });
    }

    const result = await runIngest(query);
    if (result.ok) {
      const compoundSlug = slugFromCanonicalName(result.canonical_name);
      compound = await getCompoundBySlugFromSupabase(compoundSlug);
      if (compound) {
        return Response.json({ compound, generated: true });
      }
    }

    const mock = getMockCompoundBySlug(slug);
    if (mock) {
      return Response.json({ compound: mock, generated: false });
    }

    return Response.json(
      { error: result?.ok === false ? result.error ?? "Compound not found" : "Compound not found" },
      { status: 404 }
    );
  } catch (err) {
    console.error("resolve error:", err);
    const mock = getMockCompoundBySlug(slug);
    if (mock) {
      return Response.json({ compound: mock, generated: false });
    }
    return Response.json(
      { error: err instanceof Error ? err.message : "Resolve failed" },
      { status: 500 }
    );
  }
}
