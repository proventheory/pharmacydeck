import { streamText, generateText, tool, createDataStreamResponse, formatDataStreamPart } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { NextRequest } from "next/server";
import { getCompoundBySlugFromSupabase } from "@/lib/data";
import { runIngest, slugFromCanonicalName } from "@/lib/run-ingest";
import { buildSystemPromptWithContext } from "@/lib/chat-prompts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Topic words that are not compound names — avoid treating "X mechanism and indications" as compare. */
const TOPIC_WORDS = new Set(
  "mechanism indications safety pharmacology dosing half-life interactions contraindications side effects uses summary".split(/\s+/)
);

/** If the query asks to compare two drugs, return [name1, name2]; otherwise null. */
function parseCompareQuery(query: string): string[] | null {
  const q = query.trim();
  if (q.length > 120) return null;
  const andMatch = q.match(/compare\s+(.+?)\s+and\s+(.+)/i) ?? q.match(/^(.+?)\s+and\s+(.+)\s*$/i);
  if (andMatch) {
    const a = andMatch[1].trim();
    const b = andMatch[2].trim();
    if (b.length > 0 && TOPIC_WORDS.has(b.toLowerCase())) return null;
    if (a.length > 0 && b.length > 0 && a.length < 50 && b.length < 50) return [a, b];
  }
  const vsMatch = q.match(/compare\s+(.+?)\s+vs\.?\s+(.+)/i) ?? q.match(/compare\s+(.+?)\s+versus\s+(.+)/i) ?? q.match(/^(.+?)\s+vs\.?\s+(.+)$/i);
  if (vsMatch) {
    const a = vsMatch[1].trim();
    const b = vsMatch[2].trim();
    if (a.length > 0 && b.length > 0 && a.length < 50 && b.length < 50) return [a, b];
  }
  return null;
}

/** Extract a single compound name from a question so we can look it up and add a card. */
function extractCompoundNameFromQuery(query: string): string | null {
  const q = query.trim();
  if (q.length > 100) return null;
  const lower = q.toLowerCase();
  let name: string | null = null;
  if (/^what(?:'s| is)\s+(?:the\s+)?(?:drug\s+)?(.+?)\??\s*$/i.test(q)) {
    name = q.replace(/^what(?:'s| is)\s+(?:the\s+)?(?:drug\s+)?/i, "").replace(/\??\s*$/, "").trim();
  } else if (/^tell me about\s+(.+?)(?:\.|\?)?\s*$/i.test(q)) {
    name = q.replace(/^tell me about\s+/i, "").replace(/[.?]\s*$/, "").trim();
  } else if (/^what do you know about\s+(.+?)\??\s*$/i.test(q)) {
    name = q.replace(/^what do you know about\s+/i, "").replace(/\??\s*$/, "").trim();
  } else if (/^(.+?)\s+(?:mechanism|indications|safety|pharmacology|dosing|side effects|interactions)/i.test(q)) {
    const m = q.match(/^(.+?)\s+(?:mechanism|indications|safety|pharmacology|dosing|side effects|interactions)/i);
    name = m ? m[1].trim() : null;
  }
  if (name && name.length >= 2 && name.length <= 60) return name;
  return null;
}

/** True if card is a skeleton (e.g. from ingest_queue worker) with no real content to show. */
function isCardEmpty(card: { mechanism_summary?: string | null; uses_summary?: string | null; safety_summary?: string | null } | null | undefined): boolean {
  if (!card) return true;
  const hasContent =
    (card.mechanism_summary?.trim().length ?? 0) > 0 ||
    (card.uses_summary?.trim().length ?? 0) > 0 ||
    (card.safety_summary?.trim().length ?? 0) > 0;
  return !hasContent;
}

async function fetchOrGenerateCompound(query: string): Promise<{ type: "compound"; data: unknown } | { type: "error"; error: string }> {
  const slug = slugFromCanonicalName(query);
  let compound = await getCompoundBySlugFromSupabase(slug);
  const needsIngest = !compound || isCardEmpty(compound?.card);
  if (needsIngest) {
    const ingestName = compound?.canonical_name ?? query;
    const result = await runIngest(ingestName.trim());
    if (!result.ok) {
      if (!compound) return { type: "error", error: result.error ?? "Not found" };
      return { type: "compound", data: compound };
    }
    const compoundSlug = slugFromCanonicalName(result.canonical_name);
    const after = await getCompoundBySlugFromSupabase(compoundSlug) ?? compound ?? null;
    if (after) compound = after;
  }
  if (!compound) return { type: "error", error: "Could not load compound" };
  return { type: "compound", data: compound };
}

/** Minimal compound fields for AI comparison (avoids sending huge payloads). */
function summarizeForCompare(c: unknown): Record<string, unknown> {
  const o = c as Record<string, unknown>;
  const card = o?.card as Record<string, unknown> | undefined;
  const reg = o?.regulatory as Record<string, unknown> | undefined;
  const studies = o?.studies;
  return {
    name: o?.canonical_name,
    mechanism: card?.mechanism_summary ?? null,
    uses: card?.uses_summary ?? null,
    safety: card?.safety_summary ?? null,
    pk: typeof card?.pharmacokinetics === "object" && card?.pharmacokinetics ? card.pharmacokinetics : null,
    class: card?.primary_class ?? null,
    regulatory_summary: card?.regulatory_summary ?? null,
    approval_date: reg?.approval_date ?? null,
    fda_app: reg?.fda_application_number ?? null,
    boxed_warning: reg?.boxed_warning ?? false,
    study_count: Array.isArray(studies) ? studies.length : 0,
  };
}

/**
 * POST /api/chat — AI with tool generateCompound. Schema-aware system prompt and follow-up instructions.
 * Body may include context for Phase 3: { messages, context?: { lastCompoundNames?, hasRegulatory?, hasStudies? } }.
 */
export async function POST(request: NextRequest) {
  let body: {
    messages?: Array<{ role: string; content: string }>;
    context?: { lastCompoundNames?: string[]; hasRegulatory?: boolean; hasStudies?: boolean };
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const messages = body.messages ?? [];
  const context = body.context;

  const lastUser = messages.filter((m) => m.role === "user").pop();
  const query = (lastUser?.content ?? "").trim();
  const compareNames = query ? parseCompareQuery(query) : null;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    if (!query) return Response.json({ error: "No message" }, { status: 400 });

    // Compare: load both compounds and show both cards + short message.
    if (compareNames && compareNames.length >= 2) {
      const [name1, name2] = compareNames;
      const [r1, r2] = await Promise.all([fetchOrGenerateCompound(name1), fetchOrGenerateCompound(name2)]);
      const failed = [r1.type === "error" ? name1 : null, r2.type === "error" ? name2 : null].filter(Boolean);
      if (failed.length === 2)
        return Response.json({ error: `Could not load ${name1} or ${name2}` }, { status: 404 });
      const messageId = crypto.randomUUID();
      const c1 = r1.type === "compound" ? r1.data : null;
      const c2 = r2.type === "compound" ? r2.data : null;
      const names = [c1, c2].map((c) => (c as { canonical_name?: string })?.canonical_name ?? "").filter(Boolean);
      const text =
        failed.length > 0
          ? `**${names.join(" and ")}** loaded. Could not load: ${failed.join(", ")}. Click the card(s) in the deck to open full pages.`
          : `**${names.join(" and ")}** — both loaded. **Click each card in the deck** to open the full page and compare mechanism, indications, safety, and FDA info.`;
      return createDataStreamResponse({
        execute: (writer) => {
          writer.write(formatDataStreamPart("start_step", { messageId }));
          if (c1) {
            const id1 = crypto.randomUUID();
            writer.write(formatDataStreamPart("tool_call", { toolCallId: id1, toolName: "generateCompound", args: { query: name1 } }));
            writer.write(formatDataStreamPart("tool_result", { toolCallId: id1, result: { type: "compound", data: c1 } }));
          }
          if (c2) {
            const id2 = crypto.randomUUID();
            writer.write(formatDataStreamPart("tool_call", { toolCallId: id2, toolName: "generateCompound", args: { query: name2 } }));
            writer.write(formatDataStreamPart("tool_result", { toolCallId: id2, result: { type: "compound", data: c2 } }));
          }
          writer.write(formatDataStreamPart("text", text));
          writer.write(formatDataStreamPart("finish_step", { finishReason: "stop", isContinued: false }));
          writer.write(formatDataStreamPart("finish_message", { finishReason: "stop" }));
        },
      });
    }

    // Without an API key we look up compounds by name. Accept bare names or extract from "What is X?", "Tell me about X", "X mechanism and indications".
    const looksLikeCompoundName =
      query.length <= 80 &&
      !/^(what|where|when|why|how|see|show|compare|tell me about|is|does|can)\b/i.test(query) &&
      !query.includes("?");
    const extractedName = extractCompoundNameFromQuery(query);
    const compoundNameToFetch = looksLikeCompoundName ? query : extractedName ?? null;

    if (!compoundNameToFetch) {
      const text =
        "I can only look up **compounds by name** in this mode. To see FDA label, half-life, mechanism, and studies, **click a card in the deck** — that opens the full compound page.\n\nOr ask for another compound by name:\n- Try tirzepatide\n- Try metformin\n- Try ozempic";
      return createDataStreamResponse({
        execute: (writer) => {
          writer.write(formatDataStreamPart("text", text));
          writer.write(formatDataStreamPart("finish_message", { finishReason: "stop" }));
        },
      });
    }

    const result = await fetchOrGenerateCompound(compoundNameToFetch);
    if (result.type === "error")
      return Response.json({ error: result.error, compound: null }, { status: 404 });
    const data = result.data as { canonical_name?: string };
    const text =
      `**${data.canonical_name}** — loaded. **Click the card in the deck** (on the right) to open the full page with mechanism, FDA label, half-life, and studies.\n\nTry another compound:\n- Tirzepatide\n- Metformin\n- Ozempic`;
    const messageId = crypto.randomUUID();
    const toolCallId = crypto.randomUUID();
    return createDataStreamResponse({
      execute: (writer) => {
        writer.write(formatDataStreamPart("start_step", { messageId }));
        writer.write(formatDataStreamPart("tool_call", { toolCallId, toolName: "generateCompound", args: { query: compoundNameToFetch } }));
        writer.write(formatDataStreamPart("tool_result", { toolCallId, result: { type: "compound", data: result.data } }));
        writer.write(formatDataStreamPart("text", text));
        writer.write(formatDataStreamPart("finish_step", { finishReason: "stop", isContinued: false }));
        writer.write(formatDataStreamPart("finish_message", { finishReason: "stop" }));
      },
    });
  }

  // With API key: if user asked to compare two drugs, load both and stream comparison text (or partial result).
  if (compareNames && compareNames.length >= 2 && query) {
    const [name1, name2] = compareNames;
    const [r1, r2] = await Promise.all([fetchOrGenerateCompound(name1), fetchOrGenerateCompound(name2)]);
    const c1 = r1.type === "compound" ? r1.data : null;
    const c2 = r2.type === "compound" ? r2.data : null;
    if (c1 || c2) {
      let comparisonText: string;
      if (c1 && c2) {
        const res = await generateText({
          model: openai("gpt-4o-mini"),
          system: `You are PharmacyDeck. The user asked to compare two drugs. Both compounds are already loaded to the deck. Provide a concise comparison (2–4 short paragraphs) covering: mechanism / class, key indications, notable safety or PK differences, and FDA/approval if relevant. Use only the data provided; do not invent. End with "Suggested follow-ups:" and 2–4 short bullet prompts (e.g. "See FDA label", "What about half-life?").`,
          messages: [
            { role: "user" as const, content: query },
            {
              role: "user" as const,
              content: `Compound 1 (${name1}): ${JSON.stringify(summarizeForCompare(c1))}. Compound 2 (${name2}): ${JSON.stringify(summarizeForCompare(c2))}.`,
            },
          ],
        });
        comparisonText = res.text;
      } else {
        const loaded = [c1 ? (c1 as { canonical_name?: string }).canonical_name : null, c2 ? (c2 as { canonical_name?: string }).canonical_name : null].filter(Boolean);
        const failed = [c1 ? null : name1, c2 ? null : name2].filter(Boolean);
        comparisonText = `**${loaded.join(" and ")}** loaded to the deck. Could not load: ${failed.join(", ")}. Click the card(s) on the right to open the full page.`;
      }
      const messageId = crypto.randomUUID();
      return createDataStreamResponse({
        execute: (writer) => {
          writer.write(formatDataStreamPart("start_step", { messageId }));
          if (c1) {
            const id1 = crypto.randomUUID();
            writer.write(formatDataStreamPart("tool_call", { toolCallId: id1, toolName: "generateCompound", args: { query: name1 } }));
            writer.write(formatDataStreamPart("tool_result", { toolCallId: id1, result: { type: "compound", data: c1 } }));
          }
          if (c2) {
            const id2 = crypto.randomUUID();
            writer.write(formatDataStreamPart("tool_call", { toolCallId: id2, toolName: "generateCompound", args: { query: name2 } }));
            writer.write(formatDataStreamPart("tool_result", { toolCallId: id2, result: { type: "compound", data: c2 } }));
          }
          writer.write(formatDataStreamPart("text", comparisonText));
          writer.write(formatDataStreamPart("finish_step", { finishReason: "stop", isContinued: false }));
          writer.write(formatDataStreamPart("finish_message", { finishReason: "stop" }));
        },
      });
    }
  }

  const systemPrompt = buildSystemPromptWithContext(context);

  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const result = streamText({
    model: openai("gpt-4o-mini"),
    system: systemPrompt,
    messages: messages.map((m) => ({ role: m.role as "user" | "assistant" | "system", content: m.content })),
    maxSteps: 5,
    tools: {
      generateCompound: tool({
        description:
          "Fetch or generate full compound intelligence for a drug name: identity (RxCUI), card (mechanism, indications, safety, PK/PD, clinical profile, deck stats), FDA/regulatory when available, and studies/editorial when present. Call once per compound. Adds the compound to the user's deck.",
        parameters: z.object({ query: z.string().describe("Compound or drug name, e.g. semaglutide") }),
        execute: async ({ query }) => {
          const out = await fetchOrGenerateCompound(query.trim());
          if (out.type === "error") return { type: "error", error: out.error };
          return { type: "compound", data: out.data };
        },
      }),
      discoverySearch: tool({
        description:
          "Search/browse compounds by drug group (e.g. approved, investigational, experimental) and/or target type (target, enzyme, transporter, carrier). Use when the user asks for lists like 'approved drugs that target enzymes', 'drugs in development', 'which compounds target transporters'.",
        parameters: z.object({
          drug_group: z
            .string()
            .optional()
            .describe("Filter by drug_group: approved, experimental, nutraceutical, illicit, withdrawn, investigational, vet_approved"),
          target_type: z
            .string()
            .optional()
            .describe("Filter by target type: target, enzyme, transporter, carrier"),
          limit: z.number().min(1).max(100).optional().describe("Max number of compounds to return (default 20)"),
        }),
        execute: async ({ drug_group, target_type, limit }) => {
          const params = new URLSearchParams();
          if (drug_group) params.set("drug_group", drug_group);
          if (target_type) params.set("target_type", target_type);
          if (limit != null) params.set("limit", String(limit));
          const res = await fetch(`${baseUrl}/api/discovery?${params.toString()}`);
          if (!res.ok) return { error: "Discovery API failed", compounds: [] };
          const data = (await res.json()) as { compounds?: unknown[]; total?: number };
          return { compounds: data.compounds ?? [], total: data.total ?? 0 };
        },
      }),
    },
  });

  return result.toDataStreamResponse();
}
