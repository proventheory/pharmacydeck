/**
 * Run full ingest for a compound by slug. Use when the compound page shows "Not yet available"
 * so the DB gets mechanism, uses, safety, PK, regulatory, and studies. Call from "Load full data" button.
 */

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getCompoundBySlugFromSupabase } from "@/lib/data";
import { runIngest } from "@/lib/run-ingest";

export const maxDuration = 60;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  if (!slug?.trim()) {
    return NextResponse.json({ ok: false, error: "Missing slug" }, { status: 400 });
  }

  const compound = await getCompoundBySlugFromSupabase(slug);
  if (!compound) {
    return NextResponse.json({ ok: false, error: "Compound not found" }, { status: 404 });
  }

  const result = await runIngest(compound.canonical_name);
  revalidatePath(`/compound/${slug}`);

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error ?? "Ingest failed" },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, canonical_name: result.canonical_name });
}
