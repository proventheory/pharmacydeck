"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { CompoundWithCard } from "@/lib/data";

function compoundHref(c: CompoundWithCard): string {
  const slug = c.card?.slug ?? c.canonical_name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  return `/compound/${slug}`;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return x != null && typeof x === "object" && !Array.isArray(x);
}

function Section({
  title,
  children,
  emptyLabel = "Not yet available.",
}: {
  title: string;
  children: React.ReactNode;
  emptyLabel?: string;
}) {
  const isEmpty = children == null || (typeof children === "string" && !children.trim());
  return (
    <section className="mt-4 border-t border-gray-100 pt-3 first:mt-0 first:border-0 first:pt-0">
      <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
      <div className="mt-1 text-sm text-gray-700">
        {isEmpty ? <p className="italic text-gray-500">{emptyLabel}</p> : children}
      </div>
    </section>
  );
}

function CompoundCompareCard({
  compound,
  placeholder,
}: {
  compound: CompoundWithCard | null;
  placeholder: string;
}) {
  if (!compound) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <p className="text-gray-500">{placeholder}</p>
      </div>
    );
  }

  const { card, regulatory } = compound;
  const pk = isRecord(card.pharmacokinetics) ? card.pharmacokinetics : {};
  const clinical = isRecord(card.clinical_profile) ? card.clinical_profile : {};
  const chemistry = isRecord(card.chemistry_profile) ? card.chemistry_profile : {};
  const deckStats = isRecord(card.deck_stats) ? card.deck_stats : {};
  const adverseFreq = isRecord(card.adverse_effect_frequency) ? card.adverse_effect_frequency : {};
  const approvedIndications = (clinical.approved_indications as string[] | undefined) ?? [];

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h2 className="text-xl font-semibold text-gray-900">
        <Link href={compoundHref(compound)} className="hover:underline">
          {compound.canonical_name}
        </Link>
      </h2>
      <p className="mt-1 text-xs text-gray-500">RxCUI {compound.rxcui}</p>
      {(card.primary_class ?? card.classification) && (
        <p className="mt-1 text-sm font-medium text-gray-700">{card.primary_class ?? card.classification}</p>
      )}
      {card.molecule_type && (
        <p className="mt-0.5 text-xs capitalize text-gray-500">{card.molecule_type.replace("_", " ")}</p>
      )}

      <Section title="Mechanism">{card.mechanism_summary}</Section>
      <Section title="Approved indications">
        {approvedIndications.length > 0 ? (
          <ul className="list-inside list-disc space-y-0.5">
            {approvedIndications.map((ind, i) => (
              <li key={i}>{ind}</li>
            ))}
          </ul>
        ) : null}
      </Section>
      <Section title="Uses">{card.uses_summary}</Section>
      <Section title="Safety">{card.safety_summary}</Section>
      <Section title="Pharmacokinetics">
        {Object.keys(pk).length > 0 ? (
          <ul className="space-y-0.5">
            {pk.half_life_hours != null && (
              <li>
                Half-life:{" "}
                {Number(pk.half_life_hours) >= 24
                  ? `${(Number(pk.half_life_hours) / 24).toFixed(1)} days`
                  : `${pk.half_life_hours} h`}
              </li>
            )}
            {pk.bioavailability_percent != null && (
              <li>Bioavailability: {Number(pk.bioavailability_percent)}%</li>
            )}
            {pk.metabolism != null && pk.metabolism !== "" ? (
              <li>Metabolism: {String(pk.metabolism)}</li>
            ) : null}
            {pk.blood_brain_barrier != null && pk.blood_brain_barrier !== "" ? (
              <li>Blood-brain barrier: {String(pk.blood_brain_barrier)}</li>
            ) : null}
          </ul>
        ) : null}
      </Section>
      <Section title="Classification">{card.classification}</Section>
      <Section title="Chemistry">
        {Object.keys(chemistry).length > 0 ? (
          <ul className="space-y-0.5">
            {chemistry.molecular_weight != null && (
              <li>Molecular weight: {Number(chemistry.molecular_weight)} Da</li>
            )}
            {chemistry.formula != null && chemistry.formula !== "" ? (
              <li>Formula: {String(chemistry.formula)}</li>
            ) : null}
          </ul>
        ) : null}
      </Section>
      <Section title="Adverse effects (frequency)">
        {Object.keys(adverseFreq).length > 0 ? (
          <ul className="space-y-0.5">
            {Object.entries(adverseFreq).map(([term, freq]) => (
              <li key={term}>
                <span className="capitalize">{String(term).replace(/_/g, " ")}</span>: {String(freq)}
              </li>
            ))}
          </ul>
        ) : null}
      </Section>
      <Section title="Deck stats">
        {Object.keys(deckStats).length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {Object.entries(deckStats).map(
              ([k, v]) =>
                typeof v === "number" && (
                  <span key={k} className="rounded bg-gray-200 px-2 py-0.5 text-xs">
                    {String(k).replace(/_/g, " ")}: {v}
                  </span>
                )
            )}
          </div>
        ) : null}
      </Section>
      {card.deck_tags && card.deck_tags.length > 0 && (
        <Section title="Tags">
          <div className="flex flex-wrap gap-1">
            {card.deck_tags.map((t) => (
              <span key={t} className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-800">
                {t}
              </span>
            ))}
          </div>
        </Section>
      )}
      <Section title="Regulatory status">
        {card.regulatory_summary ?? null}
        {regulatory && (
          <ul className="mt-1 space-y-0.5 text-gray-600">
            {regulatory.approval_date && <li>Approval date: {regulatory.approval_date}</li>}
            {regulatory.fda_application_number && (
              <li>FDA application: {regulatory.fda_application_number}</li>
            )}
            {regulatory.boxed_warning && <li>Boxed warning: Yes</li>}
            {regulatory.rems_required && <li>REMS required: Yes</li>}
          </ul>
        )}
      </Section>
      <Section title="Evidence">
        {[card.evidence_summary?.trim(), compound.studies?.length ? `${compound.studies.length} study(ies) on file.` : null]
          .filter(Boolean)
          .join(" ") || ""}
      </Section>
    </div>
  );
}

export function CompareClient({ compounds }: { compounds: CompoundWithCard[] }) {
  const [aRxcui, setARxcui] = useState(compounds[0]?.rxcui ?? "");
  const [bRxcui, setBRxcui] = useState(compounds[1]?.rxcui ?? "");
  const [compoundA, setCompoundA] = useState<CompoundWithCard | null>(null);
  const [compoundB, setCompoundB] = useState<CompoundWithCard | null>(null);
  const [loadingA, setLoadingA] = useState(false);
  const [loadingB, setLoadingB] = useState(false);

  useEffect(() => {
    if (!aRxcui) {
      setCompoundA(null);
      return;
    }
    setLoadingA(true);
    fetch(`/api/compound/full?rxcui=${encodeURIComponent(aRxcui)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setCompoundA(data))
      .catch(() => setCompoundA(null))
      .finally(() => setLoadingA(false));
  }, [aRxcui]);

  useEffect(() => {
    if (!bRxcui) {
      setCompoundB(null);
      return;
    }
    setLoadingB(true);
    fetch(`/api/compound/full?rxcui=${encodeURIComponent(bRxcui)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setCompoundB(data))
      .catch(() => setCompoundB(null))
      .finally(() => setLoadingB(false));
  }, [bRxcui]);

  return (
    <div className="mt-8">
      <div className="flex flex-wrap gap-4">
        <div>
          <label htmlFor="compound-a" className="block text-sm font-medium text-gray-700">
            Compound A
          </label>
          <select
            id="compound-a"
            value={aRxcui}
            onChange={(e) => setARxcui(e.target.value)}
            className="mt-1 block w-56 rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {compounds.map((c) => (
              <option key={c.rxcui} value={c.rxcui}>
                {c.canonical_name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="compound-b" className="block text-sm font-medium text-gray-700">
            Compound B
          </label>
          <select
            id="compound-b"
            value={bRxcui}
            onChange={(e) => setBRxcui(e.target.value)}
            className="mt-1 block w-56 rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {compounds.map((c) => (
              <option key={c.rxcui} value={c.rxcui}>
                {c.canonical_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-8 grid gap-8 md:grid-cols-2">
        {loadingA ? (
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <div className="flex items-center gap-2 text-gray-500">
              <span className="size-2 animate-pulse rounded-full bg-gray-400" aria-hidden />
              Loading compound details…
            </div>
          </div>
        ) : (
          <CompoundCompareCard compound={compoundA} placeholder="Select compound A" />
        )}
        {loadingB ? (
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <div className="flex items-center gap-2 text-gray-500">
              <span className="size-2 animate-pulse rounded-full bg-gray-400" aria-hidden />
              Loading compound details…
            </div>
          </div>
        ) : (
          <CompoundCompareCard compound={compoundB} placeholder="Select compound B" />
        )}
      </div>
    </div>
  );
}
