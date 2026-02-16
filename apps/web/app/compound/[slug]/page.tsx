import { notFound } from "next/navigation";
import Link from "next/link";
import { getCompoundBySlugFromSupabase } from "@/lib/data";
import { getMockCompoundBySlug } from "@/lib/mock-compounds";
import { fetchFDAPackages } from "@/lib/sources/fetchFDAPackages";
import { DeckButton } from "./DeckButton";
import { LoadFullDataButton } from "./LoadFullDataButton";

function isRecord(x: unknown): x is Record<string, unknown> {
  return x != null && typeof x === "object" && !Array.isArray(x);
}

function isCardEmpty(card: { mechanism_summary?: string | null; uses_summary?: string | null; safety_summary?: string | null } | null | undefined): boolean {
  if (!card) return true;
  return (
    (card.mechanism_summary?.trim().length ?? 0) === 0 &&
    (card.uses_summary?.trim().length ?? 0) === 0 &&
    (card.safety_summary?.trim().length ?? 0) === 0
  );
}

export default async function CompoundPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const compound =
    (await getCompoundBySlugFromSupabase(slug)) ?? getMockCompoundBySlug(slug);
  if (!compound) notFound();
  const cardEmpty = isCardEmpty(compound.card);

  const fdaPackages = await fetchFDAPackages({
    application_number: compound.regulatory?.fda_application_number ?? null,
    rxcui: compound.rxcui ?? null,
    substance_name: compound.canonical_name ?? null,
  });

  const { card } = compound;
  const pk = isRecord(card.pharmacokinetics) ? card.pharmacokinetics : {};
  const clinical = isRecord(card.clinical_profile) ? card.clinical_profile : {};
  const chemistry = isRecord(card.chemistry_profile) ? card.chemistry_profile : {};
  const deckStats = isRecord(card.deck_stats) ? card.deck_stats : {};
  const adverseFreq = isRecord(card.adverse_effect_frequency) ? card.adverse_effect_frequency : {};

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Link href="/" className="text-sm text-blue-600 hover:underline">
          ← Back to Home
        </Link>
        <h1 className="mt-4 text-3xl font-bold text-gray-900">
          {compound.canonical_name}
        </h1>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
          <span>RxCUI {compound.rxcui}</span>
          {card.molecule_type && (
            <span className="rounded bg-gray-200 px-1.5 py-0.5 capitalize">{card.molecule_type.replace("_", " ")}</span>
          )}
          {card.primary_class && <span>{card.primary_class}</span>}
        </div>
        <DeckButton rxcui={compound.rxcui} />
        {compound.description && (
          <p className="mt-2 text-gray-600">{compound.description}</p>
        )}
        {cardEmpty && (
          <LoadFullDataButton slug={slug} />
        )}

        <div className="mt-8 space-y-6">
          {/* Core card content first: mechanism, indications, uses, safety, PK */}
          {card.mechanism_summary ? (
            <section>
              <h2 className="text-lg font-semibold text-gray-900">Mechanism</h2>
              <p className="mt-1 text-gray-700">{card.mechanism_summary}</p>
            </section>
          ) : (
            <section>
              <h2 className="text-lg font-semibold text-gray-900">Mechanism</h2>
              <p className="mt-1 text-gray-500 italic">Not yet available. Use &quot;Load full data&quot; above to fetch from FDA and DailyMed.</p>
            </section>
          )}

          {(clinical.approved_indications as string[] | undefined)?.length ? (
            <section>
              <h2 className="text-lg font-semibold text-gray-900">Approved indications</h2>
              <ul className="mt-2 list-inside list-disc text-gray-700">
                {(clinical.approved_indications as string[]).map((ind, i) => (
                  <li key={i}>{ind}</li>
                ))}
              </ul>
            </section>
          ) : (
            <section>
              <h2 className="text-lg font-semibold text-gray-900">Approved indications</h2>
              <p className="mt-1 text-gray-500 italic">Not yet available.</p>
            </section>
          )}

          {card.uses_summary ? (
            <section>
              <h2 className="text-lg font-semibold text-gray-900">Uses</h2>
              <p className="mt-1 text-gray-700">{card.uses_summary}</p>
            </section>
          ) : (
            <section>
              <h2 className="text-lg font-semibold text-gray-900">Uses</h2>
              <p className="mt-1 text-gray-500 italic">Not yet available.</p>
            </section>
          )}

          {card.safety_summary ? (
            <section>
              <h2 className="text-lg font-semibold text-gray-900">Safety</h2>
              <p className="mt-1 text-gray-700">{card.safety_summary}</p>
            </section>
          ) : (
            <section>
              <h2 className="text-lg font-semibold text-gray-900">Safety</h2>
              <p className="mt-1 text-gray-500 italic">Not yet available.</p>
            </section>
          )}

          {Object.keys(pk).length > 0 ? (
            <section>
              <h2 className="text-lg font-semibold text-gray-900">Pharmacokinetics</h2>
              <ul className="mt-2 space-y-1 text-gray-700">
                {pk.half_life_hours != null && (
                  <li>Half-life: {Number(pk.half_life_hours) >= 24 ? `${(Number(pk.half_life_hours) / 24).toFixed(1)} days` : `${pk.half_life_hours} h`}</li>
                )}
                {pk.bioavailability_percent != null ? <li>Bioavailability: {Number(pk.bioavailability_percent)}%</li> : null}
                {pk.metabolism ? <li>Metabolism: {String(pk.metabolism)}</li> : null}
                {pk.blood_brain_barrier ? <li>Blood-brain barrier: {String(pk.blood_brain_barrier)}</li> : null}
              </ul>
            </section>
          ) : (
            <section>
              <h2 className="text-lg font-semibold text-gray-900">Pharmacokinetics</h2>
              <p className="mt-1 text-gray-500 italic">Not yet available.</p>
            </section>
          )}

          {card.classification && (
            <section>
              <h2 className="text-lg font-semibold text-gray-900">Classification</h2>
              <p className="mt-1 text-gray-700">{card.classification}</p>
            </section>
          )}

          {Object.keys(chemistry).length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-gray-900">Chemistry</h2>
              <ul className="mt-2 space-y-1 text-gray-700">
                {chemistry.molecular_weight != null ? <li>Molecular weight: {Number(chemistry.molecular_weight)} Da</li> : null}
                {chemistry.formula ? <li>Formula: {String(chemistry.formula)}</li> : null}
              </ul>
            </section>
          )}

          {Object.keys(adverseFreq).length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-gray-900">Adverse effects (frequency)</h2>
              <ul className="mt-2 space-y-1 text-gray-700">
                {Object.entries(adverseFreq).map(([term, freq]) => (
                  <li key={term}>
                    <span className="capitalize">{term.replace(/_/g, " ")}</span>: {String(freq)}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {Object.keys(deckStats).length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-gray-900">Deck stats</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                {Object.entries(deckStats).map(([k, v]) =>
                  typeof v === "number" ? (
                    <span key={k} className="rounded bg-gray-200 px-2 py-1 text-sm">
                      {k.replace(/_/g, " ")}: {v}
                    </span>
                  ) : null
                )}
              </div>
            </section>
          )}
          {card.deck_tags && card.deck_tags.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-gray-900">Tags</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                {card.deck_tags.map((t) => (
                  <span key={t} className="rounded bg-blue-100 px-2 py-1 text-sm text-blue-800">
                    {t}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Regulatory, evidence, editorial, sources after core card */}
          {(card.regulatory_summary || compound.regulatory) && (
            <section>
              <h2 className="text-lg font-semibold text-gray-900">Regulatory status</h2>
              <p className="mt-1 text-gray-700">{card.regulatory_summary ?? null}</p>
              {compound.regulatory && (
                <ul className="mt-2 space-y-1 text-sm text-gray-600">
                  {compound.regulatory.approval_date && (
                    <li>Approval date: {compound.regulatory.approval_date}</li>
                  )}
                  {compound.regulatory.fda_application_number && (
                    <li>FDA application: {compound.regulatory.fda_application_number}</li>
                  )}
                  {compound.regulatory.boxed_warning && <li>Boxed warning: Yes</li>}
                  {compound.regulatory.rems_required && <li>REMS required: Yes</li>}
                </ul>
              )}
              {fdaPackages.packages.length > 0 && (
                <div className="mt-3">
                  <p className="text-sm font-medium text-gray-700">FDA approval package</p>
                  <ul className="mt-1 space-y-1">
                    {fdaPackages.packages.slice(0, 8).map((pkg, i) => (
                      <li key={i}>
                        <a
                          href={pkg.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-600 hover:underline"
                        >
                          {pkg.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          {(card.evidence_summary || (card.study_count != null && card.study_count > 0) || (compound.studies?.length ?? 0) > 0) && (
            <section>
              <h2 className="text-lg font-semibold text-gray-900">Evidence</h2>
              {card.evidence_summary && <p className="mt-1 text-gray-700">{card.evidence_summary}</p>}
              {compound.studies && compound.studies.length > 0 && (
                <ul className="mt-4 space-y-3">
                  {compound.studies.slice(0, 5).map((s) => (
                    <li key={s.id} className="rounded border border-gray-200 bg-white p-3">
                      {s.pubmed_url ? (
                        <a href={s.pubmed_url} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-600 hover:underline">
                          {s.title || `PubMed ${s.pubmed_id}`}
                        </a>
                      ) : (
                        <span className="font-medium text-gray-900">{s.title || `PubMed ${s.pubmed_id}`}</span>
                      )}
                      {(s.journal || s.publication_date) && (
                        <p className="mt-0.5 text-xs text-gray-500">
                          {[s.journal, s.publication_date].filter(Boolean).join(" · ")}
                        </p>
                      )}
                      {s.summary && <p className="mt-1 text-sm text-gray-600 line-clamp-2">{s.summary}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {compound.editorial && compound.editorial.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-gray-900">Editorial coverage</h2>
              <ul className="mt-2 space-y-3">
                {compound.editorial.map((art, i) => (
                  <li key={i} className="rounded border border-gray-200 bg-white p-3">
                    <a
                      href={art.url ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-blue-600 hover:underline"
                    >
                      {art.title}
                    </a>
                    {art.published_date && (
                      <p className="mt-0.5 text-xs text-gray-500">
                        {art.source} · {new Date(art.published_date).toLocaleDateString()}
                      </p>
                    )}
                    {art.summary && <p className="mt-1 text-sm text-gray-600 line-clamp-2">{art.summary}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {card.source_links && card.source_links.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-gray-900">Sources</h2>
              <ul className="mt-2 list-inside list-disc text-blue-600">
                {card.source_links.map((url, i) => (
                  <li key={i}>
                    <a href={url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {url}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {!compound.regulatory && (compound.studies?.length ?? 0) === 0 && (!compound.editorial?.length) && (
            <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <h2 className="text-sm font-semibold text-amber-900">Why is regulatory / evidence / editorial missing?</h2>
              <p className="mt-1 text-sm text-amber-800">
                Migration tables (004 regulatory/studies, 005 editorial) are filled by <strong>ingest</strong>. Regulatory and studies come from openFDA + PubMed when you run ingest for this compound (e.g. ask for it by name in chat). Editorial (005) is not filled by ingest — it requires a separate sync (e.g. Pharmacy Times / Airtable). Re-run ingest from chat to refresh openFDA and PubMed data.
              </p>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
