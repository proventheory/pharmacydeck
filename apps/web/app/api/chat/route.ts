import { streamText, tool, createDataStreamResponse, formatDataStreamPart } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { NextRequest } from "next/server";
import { getCompoundBySlugFromSupabase } from "@/lib/data";
import { runIngest, slugFromCanonicalName } from "@/lib/run-ingest";
import { buildSystemPromptWithContext } from "@/lib/chat-prompts";

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

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const lastUser = messages.filter((m) => m.role === "user").pop();
    const query = (lastUser?.content ?? "").trim();
    if (!query) return Response.json({ error: "No message" }, { status: 400 });
    const result = await fetchOrGenerateCompound(query);
    if (result.type === "error")
      return Response.json({ error: result.error, compound: null }, { status: 404 });
    const data = result.data as { canonical_name?: string };
    const text = `**${data.canonical_name}** — loaded. Check the deck panel.\n\nSuggested follow-ups:\n- Compare with another GLP-1\n- See FDA label\n- What about half-life?`;
    const messageId = crypto.randomUUID();
    const toolCallId = crypto.randomUUID();
    const query = (messages.filter((m) => m.role === "user").pop()?.content ?? "").trim();
    return createDataStreamResponse({
      execute: (writer) => {
        writer.write(formatDataStreamPart("start_step", { messageId }));
        writer.write(formatDataStreamPart("tool_call", { toolCallId, toolName: "generateCompound", args: { query } }));
        writer.write(formatDataStreamPart("tool_result", { toolCallId, result: { type: "compound", data: result.data } }));
        writer.write(formatDataStreamPart("text", text));
        writer.write(formatDataStreamPart("finish_step", { finishReason: "stop" }));
        writer.write(formatDataStreamPart("finish_message", { finishReason: "stop" }));
      },
    });
  }

  const systemPrompt = buildSystemPromptWithContext(context);

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
    },
  });

  return result.toDataStreamResponse();
}
