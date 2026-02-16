import { NextRequest } from "next/server";
import { getSupabase } from "database";
import { getCompoundBySlugFromSupabase } from "@/lib/data";
import { extractPharmacokineticsFromText } from "@/lib/ai/extractPharmacokinetics";
import { fetchPharmacyTimes } from "@/lib/sources/fetchPharmacyTimes";
import { runIngest, slugFromCanonicalName } from "@/lib/run-ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function send(controller: ReadableStreamDefaultController<Uint8Array>, event: string, data: unknown) {
  controller.enqueue(
    new TextEncoder().encode(`data: ${JSON.stringify({ event, data })}\n\n`)
  );
}

/**
 * POST { "query": "semaglutide" } → SSE stream: resolving_identity, identity_ready, chemistry_ready, studies_ready, card_ready (or error).
 */
export async function POST(request: NextRequest) {
  let body: { query?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) {
    return Response.json({ error: "Missing query" }, { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const slug = slugFromCanonicalName(query);
        const existing = await getCompoundBySlugFromSupabase(slug);
        if (existing) {
          let editorial: Array<{ title: string; url: string | null; summary: string; source: string; published_date: Date | null }> = [];
          try {
            const supabase = getSupabase();
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
          } catch {
            // table may not exist yet
          }
          send(controller, "card_ready", { ...existing, editorial });
          controller.close();
          return;
        }

        send(controller, "resolving_identity", { query });

        const rxnormRes = await fetch(
          `https://rxnav.nlm.nih.gov/REST/rxcui.json?name=${encodeURIComponent(query)}&search=2`
        );
        const rxnormData = (await rxnormRes.json()) as { idGroup?: { rxnormId?: string[]; rxcui?: string[] } };
        const rxcui = rxnormData?.idGroup?.rxnormId?.[0] ?? rxnormData?.idGroup?.rxcui?.[0];
        if (!rxcui) {
          send(controller, "error", { message: "RxCUI not found" });
          controller.close();
          return;
        }
        const nameRes = await fetch(`https://rxnav.nlm.nih.gov/REST/rxcui/${rxcui}/properties.json`);
        const nameData = (await nameRes.json()) as { properties?: { name?: string } };
        const canonical_name = nameData?.properties?.name ?? query;
        send(controller, "identity_ready", { rxcui, canonical_name });

        const nameForPubchem = canonical_name.split(/\s+/)[0] || query;
        const cidRes = await fetch(
          `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(nameForPubchem)}/cids/JSON`
        );
        let chemistry: Record<string, unknown> = {};
        if (cidRes.ok) {
          const cidJson = (await cidRes.json()) as { IdentifierList?: { CID?: number[] } };
          const cid = cidJson?.IdentifierList?.CID?.[0];
          if (cid) {
            const propRes = await fetch(
              `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/property/MolecularWeight,MolecularFormula,CanonicalSMILES/JSON`
            );
            if (propRes.ok) {
              const prop = (await propRes.json()) as { PropertyTable?: { Properties?: Array<Record<string, unknown>> } };
              const p = prop?.PropertyTable?.Properties?.[0];
              if (p) {
                chemistry = {
                  molecular_weight: p.MolecularWeight,
                  formula: p.MolecularFormula,
                  smiles: p.CanonicalSMILES,
                };
              }
            }
          }
        }
        send(controller, "chemistry_ready", chemistry);

        const pubmedRes = await fetch(
          `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(canonical_name)}&retmode=json&retmax=15&tool=PharmacyDeck&email=contact@pharmacydeck.com`
        );
        let studyCount = 0;
        if (pubmedRes.ok) {
          const pm = (await pubmedRes.json()) as { esearchresult?: { idlist?: string[] } };
          studyCount = pm?.esearchresult?.idlist?.length ?? 0;
        }
        send(controller, "studies_ready", { count: studyCount });

        const [result, editorial] = await Promise.all([
          runIngest(query),
          fetchPharmacyTimes(canonical_name),
        ]);
        if (!result.ok) {
          send(controller, "error", { message: result.error ?? "Ingestion failed" });
          controller.close();
          return;
        }
        const compoundSlug = slugFromCanonicalName(result.canonical_name);
        const compound = await getCompoundBySlugFromSupabase(compoundSlug);
        if (!compound) {
          send(controller, "error", { message: "Saved but could not load card" });
          controller.close();
          return;
        }
        const compoundId = compound.compound_id;
        if (compoundId && editorial.length > 0) {
          const supabase = getSupabase();
          for (const article of editorial) {
            await supabase.from("compound_editorial_reference").insert({
              compound_id: compoundId,
              title: article.title,
              summary: article.summary || null,
              source: article.source,
              source_url: article.url || null,
              published_date: article.published_date?.toISOString() ?? null,
            });
          }
        }
        send(controller, "editorial_ready", editorial);

        const supabase = getSupabase();
        const { data: labelSection } = await supabase
          .from("compound_fda_label_section")
          .select("content")
          .eq("compound_id", compoundId ?? "")
          .eq("section", "clinical_pharmacology")
          .limit(1)
          .maybeSingle();
        if (labelSection?.content) {
          try {
            const extracted = await extractPharmacokineticsFromText(labelSection.content);
            const hasAny = Object.values(extracted).some((v) => v != null && v !== "");
            if (hasAny) {
              const { data: cardRow } = await supabase
                .from("compound_card")
                .select("id, pharmacokinetics")
                .eq("compound_id", compoundId)
                .order("version", { ascending: false })
                .limit(1)
                .single();
              if (cardRow) {
                const current = (cardRow.pharmacokinetics ?? {}) as Record<string, unknown>;
                const merged = { ...current, ...extracted };
                await supabase.from("compound_card").update({ pharmacokinetics: merged }).eq("id", cardRow.id);
              }
            }
          } catch {
            // non-fatal
          }
        }

        const compoundFinal = await getCompoundBySlugFromSupabase(compoundSlug);
        send(controller, "card_ready", { ...(compoundFinal ?? compound), editorial });
      } catch (err) {
        send(controller, "error", { message: err instanceof Error ? err.message : "Unknown error" });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
