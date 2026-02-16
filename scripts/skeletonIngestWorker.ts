/**
 * Skeleton ingest worker: claim pending rows from ingest_queue, upsert compound + compound_card (minimal), mark done.
 * Idempotent; safe to retry. Run outside Vercel (local, Fly, Render, or GitHub Actions).
 *
 * Usage: npx tsx scripts/skeletonIngestWorker.ts [--batch 50] [--once]
 *   --batch N   claim N rows per round (default 50)
 *   --once      run one round then exit (for cron); default is loop until queue empty
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv(): void {
  for (const p of [
    join(__dirname, "..", ".env"),
    join(__dirname, "..", "apps", "packbuilder", ".env"),
  ]) {
    if (existsSync(p)) {
      const content = readFileSync(p, "utf8");
      for (const line of content.split("\n")) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
      }
      break;
    }
  }
}

function slugFromCanonicalName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

type QueueRow = { id: number; rxcui: string; canonical_name: string | null; priority_score: number | null; category: string | null; attempts: number };

async function main() {
  loadEnv();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");

  const args = process.argv.slice(2);
  const batchIdx = args.indexOf("--batch");
  const batchSize = batchIdx >= 0 && args[batchIdx + 1] ? parseInt(args[batchIdx + 1], 10) : 50;
  const runOnce = args.includes("--once");

  const supabase = createClient(url, key);
  let totalProcessed = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    // Claim: select N pending, then mark them processing (no LIMIT on update in Supabase)
    const { data: pending, error: selErr } = await supabase
      .from("ingest_queue")
      .select("id, rxcui, canonical_name, priority_score, category, attempts")
      .eq("status", "pending")
      .order("id", { ascending: true })
      .limit(batchSize);

    if (selErr) {
      console.error("Select pending error:", selErr.message);
      throw selErr;
    }
    const toProcess = (pending ?? []) as QueueRow[];
    if (toProcess.length === 0) {
      console.log("No pending rows left.");
      break;
    }

    const ids = toProcess.map((r) => r.id);
    await supabase.from("ingest_queue").update({ status: "processing", updated_at: new Date().toISOString() }).in("id", ids);

    const maxAttempts = 3;
    const batchJobPayload = {
      job_type: "compound_ingest",
      rxcui: toProcess.map((r) => r.rxcui).join(","),
      status: "running" as const,
      started_at: new Date().toISOString(),
    };
    const { data: jobRow } = await supabase.from("ingest_job").insert(batchJobPayload).select("id").single();
    const jobId = jobRow != null ? (jobRow as { id: string }).id : null;

    for (const row of toProcess) {
      const canonical_name = (row.canonical_name ?? row.rxcui).trim() || row.rxcui;
      const slug = slugFromCanonicalName(canonical_name);
      try {
        const { data: compound, error: compoundErr } = await supabase
          .from("compound")
          .upsert(
            { rxcui: row.rxcui, canonical_name, normalized_name: canonical_name.toLowerCase(), status: "active" },
            { onConflict: "rxcui" }
          )
          .select("id")
          .single();

        if (compoundErr) {
          const nextAttempts = (row.attempts ?? 0) + 1;
          const status = nextAttempts >= maxAttempts ? "dead_letter" : "error";
          await supabase
            .from("ingest_queue")
            .update({ status, last_error: compoundErr.message, attempts: nextAttempts, updated_at: new Date().toISOString() })
            .eq("id", row.id);
          continue;
        }
        const compound_id = (compound as { id: string }).id;

        const { error: cardErr } = await supabase.from("compound_card").upsert(
          {
            compound_id,
            version: 1,
            slug,
            canonical_name,
            rxcui: row.rxcui,
            published: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "compound_id,version" }
        );

        if (cardErr) {
          const nextAttempts = (row.attempts ?? 0) + 1;
          const status = nextAttempts >= maxAttempts ? "dead_letter" : "error";
          await supabase
            .from("ingest_queue")
            .update({ status, last_error: cardErr.message, attempts: nextAttempts, updated_at: new Date().toISOString() })
            .eq("id", row.id);
          continue;
        }

        await supabase.from("ingest_queue").update({ status: "done", updated_at: new Date().toISOString() }).eq("id", row.id);
        totalProcessed++;
      } catch (e) {
        const msg = (e as Error).message;
        const nextAttempts = (row.attempts ?? 0) + 1;
        const status = nextAttempts >= maxAttempts ? "dead_letter" : "error";
        await supabase
          .from("ingest_queue")
          .update({ status, last_error: msg, attempts: nextAttempts, updated_at: new Date().toISOString() })
          .eq("id", row.id);
      }
    }

    if (jobId) {
      const allDone = totalProcessed === toProcess.length;
      await supabase
        .from("ingest_job")
        .update({
          status: allDone ? "done" : "failed",
          finished_at: new Date().toISOString(),
          last_error: allDone ? null : "One or more rows failed or dead_letter",
        })
        .eq("id", jobId);
    }

    console.log(`Processed batch of ${toProcess.length}; total this run: ${totalProcessed}`);

    if (runOnce) break;
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log(`Skeleton ingest done. Processed ${totalProcessed} rows.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
