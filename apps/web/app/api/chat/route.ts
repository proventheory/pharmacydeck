import { streamText, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { NextRequest } from "next/server";
import { getCompoundBySlugFromSupabase } from "@/lib/data";
import { runIngest, slugFromCanonicalName } from "@/lib/run-ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function fetchOrGenerateCompound(query: string): Promise<{ type: "compound"; data: unknown } | { type: "error"; error: string }> {
  const slug = slugFromCanonicalName(query);
  let compound = await getCompoundBySlugFromSupabase(slug);
  if (!compound) {
    const result = await runIngest(query);
    if (!result.ok) return { type: "error", error: result.error ?? "Not found" };
    const compoundSlug = slugFromCanonicalName(result.canonical_name);
    compound = await getCompoundBySlugFromSupabase(compoundSlug) ?? null;
  }
  if (!compound) return { type: "error", error: "Could not load compound" };
  return { type: "compound", data: compound };
}

/**
 * POST /api/chat — AI with tool: generateCompound. When the model calls the tool, we resolve/generate and return compound for the deck.
 */
export async function POST(request: NextRequest) {
  let body: { messages?: Array<{ role: string; content: string }> };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const messages = body.messages ?? [];

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // Free path: no LLM; still resolve/generate compound and return for the deck
    const lastUser = messages.filter((m) => m.role === "user").pop();
    const query = (lastUser?.content ?? "").trim();
    if (!query) return Response.json({ error: "No message" }, { status: 400 });
    const result = await fetchOrGenerateCompound(query);
    if (result.type === "error")
      return Response.json({ error: result.error, compound: null }, { status: 404 });
    const text = `**${(result.data as { canonical_name?: string }).canonical_name}** — loaded. Check the deck panel.`;
    return Response.json({ message: text, compound: result.data });
  }

  const result = streamText({
    model: openai("gpt-4o-mini"),
    system: `You are PharmacyDeck, a pharmaceutical intelligence assistant.
When the user asks about a drug or compound (by name or comparison), use the generateCompound tool for each compound mentioned.
Examples: "semaglutide" → call generateCompound("semaglutide"); "compare semaglutide and tirzepatide" → call generateCompound for each.
Respond briefly and professionally; the deck panel will show the cards.`,
    messages: messages.map((m) => ({ role: m.role as "user" | "assistant" | "system", content: m.content })),
    maxSteps: 5,
    tools: {
      generateCompound: tool({
        description: "Fetch or generate full compound intelligence (identity, chemistry, FDA, studies). Call this for each drug the user mentions.",
        parameters: z.object({ query: z.string().describe("Compound or drug name, e.g. semaglutide") }),
        execute: async ({ query }) => {
          const out = await fetchOrGenerateCompound(query.trim());
          if (out.type === "error") return { type: "error", error: out.error };
          return { type: "compound", data: out.data };
        },
      }),
    },
  });

  return result.toDataStreamResponse();
}
