/**
 * Single-compound ingestion: resolve RxCUI, enrich, generate card, persist.
 */

import { getSupabase } from "database";
import * as rxnorm from "./rxnorm.js";
import * as dailymed from "./dailymed.js";
import * as pubchem from "./pubchem.js";

export interface IngestResult {
  rxcui: string;
  canonical_name: string;
  ok: boolean;
  error?: string;
}

export async function ingestCompound(inputName: string): Promise<IngestResult> {
  const supabase = getSupabase();

  const rxcui = await rxnorm.findRxcuiByString(inputName);
  if (!rxcui) {
    return { rxcui: "", canonical_name: inputName, ok: false, error: "RxCUI not found" };
  }

  const canonical_name = (await rxnorm.getConceptName(rxcui)) ?? inputName;
  const synonyms = await rxnorm.getSynonyms(rxcui);
  const [labelSnippets, pubchemResult] = await Promise.all([
    dailymed.fetchLabelSnippetsForRxcui(rxcui, canonical_name),
    pubchem.fetchPubChemForRxcui(rxcui, canonical_name),
  ]);

  const description =
    labelSnippets.length > 0
      ? labelSnippets.map((s) => s.text).join(" ").slice(0, 500)
      : null;

  const mechanismSummary = labelSnippets.find((s) =>
    /mechanism|pharmacology|clinical pharmacology/i.test(s.section)
  )?.text ?? null;
  const usesSummary = labelSnippets.find((s) =>
    /indication|use|disease/i.test(s.section)
  )?.text ?? null;
  const safetySummary = labelSnippets.find((s) =>
    /warning|precaution|adverse|contraindication/i.test(s.section)
  )?.text ?? null;
  const sourceLinks = ["https://dailymed.nlm.nih.gov/", "https://open.fda.gov/"];

  try {
    await supabase.from("compound").upsert(
      { rxcui, canonical_name, description },
      { onConflict: "rxcui" }
    );

    if (synonyms.length > 0) {
      await supabase.from("synonym").delete().eq("rxcui", rxcui);
      await supabase.from("synonym").insert(
        synonyms.slice(0, 50).map((term) => ({ rxcui, term }))
      );
    }

    if (labelSnippets.length > 0) {
      await supabase.from("label_snippet").delete().eq("rxcui", rxcui);
      await supabase.from("label_snippet").insert(
        labelSnippets.map((s) => ({
          rxcui,
          section: s.section,
          text: s.text,
          source: s.source,
        }))
      );
    }

    if (pubchemResult) {
      await supabase.from("pubchem").upsert(
        { rxcui, cid: pubchemResult.cid, formula: pubchemResult.formula },
        { onConflict: "rxcui" }
      );
    }

    await supabase.from("card").upsert(
      {
        rxcui,
        classification: null,
        mechanism_summary: mechanismSummary,
        uses_summary: usesSummary,
        safety_summary: safetySummary,
        source_links: sourceLinks,
      },
      { onConflict: "rxcui" }
    );

    return { rxcui, canonical_name, ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { rxcui, canonical_name, ok: false, error: message };
  }
}
