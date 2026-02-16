/**
 * Unified data source: online (Supabase) vs offline (SQLite pack).
 * Cyberdeck uses this to work offline from the local pack.
 */

import type { Database } from "sql.js";
import {
  getCompoundBySlugFromSupabase,
  getCompoundsFromSupabase,
  type CompoundWithCard,
  type CompoundCardPresentation,
  type CompoundEditorialPresentation,
  type CompoundRegulatoryPresentation,
  type CompoundStudyPresentation,
} from "./data";
import { loadOfflineDB } from "./offlineDB";

let offlineDb: Database | null = null;

async function getOfflineDb(): Promise<Database> {
  if (offlineDb) return offlineDb;
  offlineDb = await loadOfflineDB();
  return offlineDb;
}

function normalizeSourceLinks(v: unknown): string[] | null {
  if (Array.isArray(v)) return v.map((x) => (typeof x === "string" ? x : String(x)));
  if (v != null) return [String(v)];
  return null;
}

function rowToCard(cardJson: string): CompoundCardPresentation {
  const c = JSON.parse(cardJson) as Record<string, unknown>;
  return {
    classification: (c.classification as string) ?? null,
    mechanism_summary: (c.mechanism_summary as string) ?? null,
    uses_summary: (c.uses_summary as string) ?? null,
    safety_summary: (c.safety_summary as string) ?? null,
    source_links: normalizeSourceLinks(c.source_links),
    slug: (c.slug as string) ?? null,
    primary_class: (c.primary_class as string) ?? null,
    molecule_type: (c.molecule_type as string) ?? null,
    pharmacokinetics: c.pharmacokinetics ?? null,
    pharmacodynamics: c.pharmacodynamics ?? null,
    clinical_profile: c.clinical_profile ?? null,
    adverse_effect_frequency: c.adverse_effect_frequency ?? null,
    chemistry_profile: c.chemistry_profile ?? null,
    deck_stats: c.deck_stats ?? null,
    deck_tags: Array.isArray(c.deck_tags) ? c.deck_tags : null,
    availability_profile: c.availability_profile ?? null,
    regulatory_summary: (c.regulatory_summary as string) ?? null,
    evidence_summary: (c.evidence_summary as string) ?? null,
    study_count: (c.study_count as number) ?? null,
    guideline_count: (c.guideline_count as number) ?? null,
  };
}

function fetchOfflineBySlug(db: Database, slug: string): CompoundWithCard | null {
  const normalized = slug.toLowerCase().replace(/[^a-z0-9-]/g, "");
  const stmt = db.prepare(
    "SELECT card_json, regulatory_json, studies_json, editorial_json, canonical_name, rxcui, compound_id FROM compound_card WHERE slug = ? LIMIT 1"
  );
  stmt.bind([normalized]);
  if (!stmt.step()) {
    stmt.free();
    return null;
  }
  const row = stmt.getAsObject() as Record<string, string | null>;
  stmt.free();
  const cardJson = row.card_json ?? "";
  const regulatoryJson = row.regulatory_json ?? null;
  const studiesJson = row.studies_json ?? null;
  const editorialJson = row.editorial_json ?? null;
  const canonical_name = row.canonical_name ?? null;
  const rxcui = row.rxcui ?? null;
  const compound_id = row.compound_id ?? null;
  const card = rowToCard(cardJson);
  let regulatory: CompoundRegulatoryPresentation | null = null;
  if (regulatoryJson) {
    try {
      const reg = JSON.parse(regulatoryJson) as Record<string, unknown>;
      regulatory = {
        approval_date: (reg.approval_date as string) ?? null,
        approval_type: (reg.approval_type as string) ?? null,
        approval_status: (reg.approval_status as string) ?? null,
        fda_application_number: (reg.fda_application_number as string) ?? null,
        fda_label_url: (reg.fda_label_url as string) ?? null,
        boxed_warning: (reg.boxed_warning as boolean) ?? false,
        rems_required: (reg.rems_required as boolean) ?? false,
        controlled_substance_schedule: (reg.controlled_substance_schedule as string) ?? null,
      };
    } catch {
      // ignore
    }
  }
  let studies: CompoundStudyPresentation[] = [];
  if (studiesJson) {
    try {
      const arr = JSON.parse(studiesJson) as Record<string, unknown>[];
      studies = arr.map((s) => ({
        id: String(s.id),
        pubmed_id: String(s.pubmed_id ?? ""),
        title: (s.title as string) ?? null,
        journal: (s.journal as string) ?? null,
        publication_date: (s.publication_date as string) ?? null,
        study_type: (s.study_type as string) ?? null,
        summary: (s.summary as string) ?? null,
        pubmed_url: (s.pubmed_url as string) ?? null,
      }));
    } catch {
      // ignore
    }
  }
  let editorial: CompoundEditorialPresentation[] = [];
  if (editorialJson) {
    try {
      const arr = JSON.parse(editorialJson) as Record<string, unknown>[];
      editorial = arr.map((e) => ({
        title: String(e.title ?? ""),
        url: (e.source_url as string) ?? null,
        summary: (e.summary as string) ?? null,
        source: String(e.source ?? "pharmacytimes"),
        published_date: (e.published_date as string) ?? null,
      }));
    } catch {
      // ignore
    }
  }
  return {
    compound_id: compound_id ?? undefined,
    rxcui: rxcui ?? "",
    canonical_name: canonical_name ?? "",
    description: card.mechanism_summary ?? null,
    card,
    regulatory,
    studies,
    editorial,
  };
}

function fetchOfflineList(db: Database): CompoundWithCard[] {
  const r = db.exec("SELECT card_json, regulatory_json, studies_json, editorial_json, canonical_name, rxcui, compound_id FROM compound_card ORDER BY canonical_name");
  if (!r?.[0]?.values?.length) return [];
  const out: CompoundWithCard[] = [];
  for (const row of r[0].values) {
    const [cardJson, regulatoryJson, studiesJson, editorialJson, canonical_name, rxcui, compound_id] = row as [
      string,
      string | null,
      string | null,
      string | null,
      string | null,
      string | null,
      string | null,
    ];
    const card = rowToCard(cardJson);
    let regulatory: CompoundRegulatoryPresentation | null = null;
    if (regulatoryJson) {
      try {
        const reg = JSON.parse(regulatoryJson) as Record<string, unknown>;
        regulatory = {
          approval_date: (reg.approval_date as string) ?? null,
          approval_type: (reg.approval_type as string) ?? null,
          approval_status: (reg.approval_status as string) ?? null,
          fda_application_number: (reg.fda_application_number as string) ?? null,
          fda_label_url: (reg.fda_label_url as string) ?? null,
          boxed_warning: (reg.boxed_warning as boolean) ?? false,
          rems_required: (reg.rems_required as boolean) ?? false,
          controlled_substance_schedule: (reg.controlled_substance_schedule as string) ?? null,
        };
      } catch {
        // ignore
      }
    }
    let studies: CompoundStudyPresentation[] = [];
    if (studiesJson) {
      try {
        const arr = JSON.parse(studiesJson) as Record<string, unknown>[];
        studies = arr.map((s) => ({
          id: String(s.id),
          pubmed_id: String(s.pubmed_id ?? ""),
          title: (s.title as string) ?? null,
          journal: (s.journal as string) ?? null,
          publication_date: (s.publication_date as string) ?? null,
          study_type: (s.study_type as string) ?? null,
          summary: (s.summary as string) ?? null,
          pubmed_url: (s.pubmed_url as string) ?? null,
        }));
      } catch {
        // ignore
      }
    }
    let editorial: CompoundEditorialPresentation[] = [];
    if (editorialJson) {
      try {
        const arr = JSON.parse(editorialJson) as Record<string, unknown>[];
        editorial = arr.map((e) => ({
          title: String(e.title ?? ""),
          url: (e.source_url as string) ?? null,
          summary: (e.summary as string) ?? null,
          source: String(e.source ?? "pharmacytimes"),
          published_date: (e.published_date as string) ?? null,
        }));
      } catch {
        // ignore
      }
    }
    out.push({
      compound_id: compound_id ?? undefined,
      rxcui: rxcui ?? "",
      canonical_name: canonical_name ?? "",
      description: card.mechanism_summary ?? null,
      card,
      regulatory,
      studies,
      editorial,
    });
  }
  return out;
}

/** Get compound by slug: online (Supabase) when onLine, else offline (SQLite pack). */
export async function getCompound(slug: string): Promise<CompoundWithCard | null> {
  if (typeof navigator !== "undefined" && navigator.onLine) {
    return getCompoundBySlugFromSupabase(slug);
  }
  const db = await getOfflineDb();
  return fetchOfflineBySlug(db, slug);
}

/** Get all compounds: online when onLine, else from pack. */
export async function getCompounds(): Promise<CompoundWithCard[]> {
  if (typeof navigator !== "undefined" && navigator.onLine) {
    return getCompoundsFromSupabase();
  }
  const db = await getOfflineDb();
  return fetchOfflineList(db);
}

/** Clear cached offline DB (e.g. after syncing a new pack). */
export function clearOfflineDBCache(): void {
  offlineDb?.close();
  offlineDb = null;
}
