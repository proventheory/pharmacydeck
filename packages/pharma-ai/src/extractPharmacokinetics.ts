/**
 * AI extraction: convert FDA label / approval document text into structured
 * pharmacokinetic (and related) fields. Uses OpenAI when OPENAI_API_KEY is set;
 * otherwise falls back to regex-based extraction.
 */

import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

export const PharmacokineticsSchema = z.object({
  half_life_hours: z.number().nullable().describe("Elimination half-life in hours"),
  half_life_note: z.string().nullable().describe("Qualifier e.g. 'terminal' or 'effective'"),
  bioavailability_percent: z.number().nullable().describe("Oral bioavailability as percentage"),
  cmax: z.string().nullable().describe("Peak concentration (e.g. 'ng/mL' or 'μg/mL')"),
  tmax_hours: z.number().nullable().describe("Time to peak concentration in hours"),
  auc: z.string().nullable().describe("Area under curve (e.g. 'ng·h/mL')"),
  volume_of_distribution: z.string().nullable().describe("Vd (e.g. 'L' or 'L/kg')"),
  clearance: z.string().nullable().describe("Clearance (e.g. 'L/h')"),
  metabolism: z.string().nullable().describe("Primary metabolism pathway"),
  route_of_elimination: z.string().nullable().describe("Renal, hepatic, etc."),
  protein_binding_percent: z.number().nullable().describe("Plasma protein binding %"),
  blood_brain_barrier: z.string().nullable().describe("Crosses BBB: yes/no/minimal/unknown"),
  food_effect: z.string().nullable().describe("Effect of food on absorption"),
  other: z.record(z.unknown()).optional().describe("Other PK parameters"),
});

export type ExtractedPharmacokinetics = z.infer<typeof PharmacokineticsSchema>;

const SYSTEM = `You are a pharmaceutical data extractor. Given text from an FDA label or approval document (e.g. Clinical Pharmacology section), extract pharmacokinetic parameters into the structured schema. Use numbers only where the schema asks for a number (e.g. half_life_hours, bioavailability_percent). For string fields use the exact phrasing from the text when possible. If a value is not found, use null. Do not invent values.`;

/**
 * Extract structured PK fields from FDA document text using AI.
 * Returns an object suitable for compound_card.pharmacokinetics.
 */
export async function extractPharmacokineticsFromText(
  text: string
): Promise<ExtractedPharmacokinetics> {
  const trimmed = text.slice(0, 24000).trim();
  if (!trimmed) return emptyPK();

  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey) {
    try {
      const { object } = await generateObject({
        model: openai("gpt-4o-mini"),
        system: SYSTEM,
        prompt: `Extract pharmacokinetic parameters from this FDA/clinical pharmacology text.\n\n---\n${trimmed}\n---`,
        schema: PharmacokineticsSchema,
        maxTokens: 1024,
      });
      return object as ExtractedPharmacokinetics;
    } catch (err) {
      console.error("extractPharmacokineticsFromText AI error", err);
      return fallbackExtract(trimmed);
    }
  }

  return fallbackExtract(trimmed);
}

function emptyPK(): ExtractedPharmacokinetics {
  return {
    half_life_hours: null,
    half_life_note: null,
    bioavailability_percent: null,
    cmax: null,
    tmax_hours: null,
    auc: null,
    volume_of_distribution: null,
    clearance: null,
    metabolism: null,
    route_of_elimination: null,
    protein_binding_percent: null,
    blood_brain_barrier: null,
    food_effect: null,
  };
}

/**
 * Regex-based fallback when no API key or on error.
 */
function fallbackExtract(text: string): ExtractedPharmacokinetics {
  const pk = emptyPK();
  const full = text.replace(/\s+/g, " ");

  const halfLifeMatch = full.match(
    /(?:half[- ]?life|t\s*?½|t½|elimination half-life)\s*[:\s]*(\d+(?:\.\d+)?)\s*(?:(\w+)\s*)?(?:hours?|h|days?|d)/i
  );
  if (halfLifeMatch) {
    pk.half_life_hours = parseFloat(halfLifeMatch[1]);
    if (halfLifeMatch[0].toLowerCase().includes("day")) pk.half_life_hours! *= 24;
    if (halfLifeMatch[2] && /term|eff|apparent/i.test(halfLifeMatch[2])) pk.half_life_note = halfLifeMatch[2];
  }

  const bioMatch = full.match(/(?:bioavailability|absolute bioavailability)\s*[:\s]*(\d+(?:\.\d+)?)\s*%?/i);
  if (bioMatch) pk.bioavailability_percent = parseFloat(bioMatch[1]);

  if (/\bCYP\s*\d+[a-z]*/i.test(full)) pk.metabolism = full.match(/CYP\s*\d+[a-z]*/i)?.[0] ?? "hepatic";
  else if (/\bproteolytic\b/i.test(full)) pk.metabolism = "proteolytic degradation";
  else if (/\bhepatic|metabolized in the liver\b/i.test(full)) pk.metabolism = "hepatic";

  if (/\bblood[- ]?brain|BBB|CNS\s*penetr/i.test(full)) {
    const m = full.match(/minimal|limited|poor|low|yes|no|does not cross/i);
    pk.blood_brain_barrier = m?.[0]?.toLowerCase() ?? "unknown";
  }

  const vdMatch = full.match(/(?:volume of distribution|Vd?)\s*[:\s]*(\d+(?:\.\d+)?\s*(?:L\/kg|L)?)/i);
  if (vdMatch) pk.volume_of_distribution = vdMatch[1].trim();

  const clMatch = full.match(/(?:clearance|CL)\s*[:\s]*(\d+(?:\.\d+)?\s*(?:L\/h|mL\/min)?)/i);
  if (clMatch) pk.clearance = clMatch[1].trim();

  return pk;
}
