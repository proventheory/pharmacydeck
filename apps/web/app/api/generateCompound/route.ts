import { NextRequest } from "next/server";
import { getSupabase } from "database";
import { getCompoundBySlugFromSupabase } from "@/lib/data";
import { fetchPharmacyTimes } from "@/lib/sources/fetchPharmacyTimes";
import { runIngest, slugFromCanonicalName } from "@/lib/run-ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST { "query": "semaglutide" }
 * If compound exists (by slug), returns full compound+card.
 * Otherwise runs full pipeline (RxNorm, PubChem, FDA, PubMed), saves to Supabase, returns compound+card.
 */
export async function POST(request: NextRequest) {
  let body: { query?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) {
    return Response.json({ error: "Missing query" }, { status: 400 });
  }

  const slug = slugFromCanonicalName(query);

  try {
    const existing = await getCompoundBySlugFromSupabase(slug);
    if (existing) {
      const supabase = getSupabase();
      let editorial: Array<{ title: string; url: string | null; summary: string; source: string; published_date: Date | null }> = [];
      if (supabase) {
        const { data: editorialRows } = await supabase
        .from("compound_editorial_reference")
        .select("title, summary, source, source_url, published_date")
        .eq("compound_id", existing.compound_id ?? "")
        .order("published_date", { ascending: false })
        .limit(5);
        editorial = (editorialRows ?? []).map((r) => ({
          title: r.title,
          url: r.source_url,
          summary: r.summary ?? "",
          source: r.source ?? "pharmacytimes",
          published_date: r.published_date ? new Date(r.published_date) : null,
        }));
      }
      return Response.json({
        compound: { ...existing, editorial },
        generated: false,
      });
    }

    const [result, editorial] = await Promise.all([
      runIngest(query),
      fetchPharmacyTimes(query),
    ]);
    if (!result.ok) {
      return Response.json(
        { error: result.error ?? "Compound not found or ingestion failed" },
        { status: 404 }
      );
    }

    const compoundSlug = slugFromCanonicalName(result.canonical_name);
    const compound = await getCompoundBySlugFromSupabase(compoundSlug);
    if (!compound) {
      return Response.json(
        { error: "Compound was saved but could not be loaded" },
        { status: 500 }
      );
    }
    const compoundId = compound.compound_id;
    const supabaseForWrite = getSupabase();
    if (compoundId && editorial.length > 0 && supabaseForWrite) {
      for (const article of editorial) {
        await supabaseForWrite.from("compound_editorial_reference").insert({
          compound_id: compoundId,
          title: article.title,
          summary: article.summary || null,
          source: article.source,
          source_url: article.url || null,
          published_date: article.published_date?.toISOString() ?? null,
        });
      }
    }
    return Response.json({
      compound: { ...compound, editorial },
      generated: true,
    });
  } catch (err) {
    console.error("generateCompound error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Generation failed" },
      { status: 500 }
    );
  }
}
