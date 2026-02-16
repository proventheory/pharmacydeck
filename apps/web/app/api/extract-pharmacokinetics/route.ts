import { NextRequest } from "next/server";
import { extractPharmacokineticsFromText } from "pharma-ai";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/extract-pharmacokinetics
 * Body: { "text": "FDA clinical pharmacology or label text..." }
 * Returns structured pharmacokinetic fields extracted via AI (or regex fallback).
 */
export async function POST(request: NextRequest) {
  let body: { text?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text : "";
  if (!text.trim()) {
    return Response.json({ error: "Missing text" }, { status: 400 });
  }

  const pharmacokinetics = await extractPharmacokineticsFromText(text);
  return Response.json({ pharmacokinetics });
}
