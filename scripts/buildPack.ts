/**
 * Build offline SQLite pack from Supabase.
 * Run from repo root: pnpm --filter pharmacydeck-scripts buildPack:tsx
 * Or: cd scripts && pnpm install && pnpm run buildPack:tsx
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (e.g. from apps/packbuilder/.env)
 */
import Database from "better-sqlite3";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, copyFileSync, mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load env from repo root or apps/packbuilder
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

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const CARD_SELECT =
  "id, compound_id, version, slug, canonical_name, rxcui, molecule_type, primary_class, secondary_classes, route_forms, mechanism_summary, mechanism_targets, mechanism_type, uses_summary, safety_summary, pharmacokinetics, pharmacodynamics, clinical_profile, adverse_effect_frequency, chemistry_profile, interaction_summary, interactions_count, deck_stats, deck_tags, approval_year, patent_expiration_year, availability_profile, source_links, source_refs, published, classification, regulatory_summary, evidence_summary, study_count, guideline_count";

async function buildPack() {
  console.log("Building offline pack...");

  const { data: cards, error: cardsError } = await supabase
    .from("compound_card")
    .select(CARD_SELECT)
    .eq("published", true);

  if (cardsError) {
    throw new Error(`compound_card: ${cardsError.message}`);
  }
  const cardList = cards ?? [];
  const compoundIds = [...new Set(cardList.map((c: { compound_id: string }) => c.compound_id))];

  let regulatory: Record<string, unknown>[] = [];
  let studies: Record<string, unknown>[] = [];
  let editorial: Record<string, unknown>[] = [];
  if (compoundIds.length > 0) {
    const [regRes, studRes, editorialRes] = await Promise.all([
      supabase.from("compound_regulatory").select("*").in("compound_id", compoundIds),
      supabase.from("compound_study").select("id, compound_id, pubmed_id, title, journal, publication_date, study_type, summary, pubmed_url").in("compound_id", compoundIds),
      supabase.from("compound_editorial_reference").select("compound_id, title, summary, source, source_url, published_date").in("compound_id", compoundIds),
    ]);
    regulatory = (regRes.data ?? []) as Record<string, unknown>[];
    studies = (studRes.data ?? []) as Record<string, unknown>[];
    editorial = (editorialRes.data ?? []) as Record<string, unknown>[];
  }

  const regulatoryByCompound = new Map<string, unknown>();
  for (const r of regulatory) {
    const cid = r.compound_id as string;
    if (!regulatoryByCompound.has(cid)) regulatoryByCompound.set(cid, r);
  }
  const studiesByCompound = new Map<string, unknown[]>();
  for (const s of studies) {
    const cid = s.compound_id as string;
    if (!studiesByCompound.has(cid)) studiesByCompound.set(cid, []);
    studiesByCompound.get(cid)!.push(s);
  }
  const editorialByCompound = new Map<string, unknown[]>();
  for (const e of editorial) {
    const cid = e.compound_id as string;
    if (!editorialByCompound.has(cid)) editorialByCompound.set(cid, []);
    editorialByCompound.get(cid)!.push(e);
  }

  const outPath = join(__dirname, "..", "pharmacydeck.db");
  const db = new Database(outPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS _meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    DROP TABLE IF EXISTS compound_card;
    CREATE TABLE compound_card (
      id TEXT PRIMARY KEY,
      compound_id TEXT NOT NULL,
      slug TEXT,
      canonical_name TEXT,
      rxcui TEXT,
      chemistry_profile TEXT,
      study_count INTEGER,
      deck_stats TEXT,
      card_json TEXT NOT NULL,
      regulatory_json TEXT,
      studies_json TEXT,
      editorial_json TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_compound_card_slug ON compound_card(slug);
    CREATE INDEX IF NOT EXISTS idx_compound_card_rxcui ON compound_card(rxcui);
  `);

  const version = new Date().toISOString().replace(/[-:]/g, "").slice(0, 14);
  db.prepare("INSERT OR REPLACE INTO _meta (key, value) VALUES (?, ?)").run("version", version);

  const insert = db.prepare(`
    INSERT OR REPLACE INTO compound_card
    (id, compound_id, slug, canonical_name, rxcui, chemistry_profile, study_count, deck_stats, card_json, regulatory_json, studies_json, editorial_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const card of cardList) {
    const c = card as Record<string, unknown>;
    const compoundId = c.compound_id as string;
    insert.run(
      c.id,
      compoundId,
      c.slug ?? null,
      c.canonical_name ?? null,
      c.rxcui ?? null,
      JSON.stringify(c.chemistry_profile ?? {}),
      c.study_count ?? null,
      JSON.stringify(c.deck_stats ?? {}),
      JSON.stringify(card),
      regulatoryByCompound.has(compoundId) ? JSON.stringify(regulatoryByCompound.get(compoundId)) : null,
      studiesByCompound.has(compoundId) ? JSON.stringify(studiesByCompound.get(compoundId)) : null,
      editorialByCompound.has(compoundId) ? JSON.stringify(editorialByCompound.get(compoundId)) : null
    );
  }

  db.close();

  const publicPacks = join(__dirname, "..", "apps", "web", "public", "packs");
  mkdirSync(publicPacks, { recursive: true });
  copyFileSync(outPath, join(publicPacks, "pharmacydeck.db"));
  writeFileSync(join(publicPacks, "manifest.json"), JSON.stringify({ version }));
  console.log("Pack complete:", outPath, "| cards:", cardList.length, "| version:", version);
  console.log("Copied to", join(publicPacks, "pharmacydeck.db"));
}

buildPack().catch((err) => {
  console.error(err);
  process.exit(1);
});
