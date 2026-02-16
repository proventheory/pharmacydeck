"use client";

import { useState } from "react";
import Link from "next/link";
import type { CompoundWithCard } from "@/lib/data";

function compoundHref(c: CompoundWithCard): string {
  const slug = c.card.slug ?? c.canonical_name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  return `/compound/${slug}`;
}

export function CompareClient({ compounds }: { compounds: CompoundWithCard[] }) {
  const [aRxcui, setARxcui] = useState(compounds[0]?.rxcui ?? "");
  const [bRxcui, setBRxcui] = useState(compounds[1]?.rxcui ?? "");

  const compoundA = compounds.find((c) => c.rxcui === aRxcui);
  const compoundB = compounds.find((c) => c.rxcui === bRxcui);

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
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          {compoundA ? (
            <>
              <h2 className="text-xl font-semibold text-gray-900">
                <Link href={compoundHref(compoundA)} className="hover:underline">
                  {compoundA.canonical_name}
                </Link>
              </h2>
              <p className="mt-1 text-xs text-gray-500">RxCUI {compoundA.rxcui}</p>
              {(compoundA.card.primary_class ?? compoundA.card.classification) && (
                <p className="mt-2 text-sm font-medium text-gray-700">
                  {compoundA.card.primary_class ?? compoundA.card.classification}
                </p>
              )}
              {compoundA.card.molecule_type && (
                <p className="mt-0.5 text-xs text-gray-500 capitalize">{compoundA.card.molecule_type.replace("_", " ")}</p>
              )}
              <p className="mt-4 text-gray-700">{compoundA.card.mechanism_summary}</p>
              <p className="mt-4 text-gray-700">{compoundA.card.uses_summary}</p>
            </>
          ) : (
            <p className="text-gray-500">Select compound A</p>
          )}
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          {compoundB ? (
            <>
              <h2 className="text-xl font-semibold text-gray-900">
                <Link href={compoundHref(compoundB)} className="hover:underline">
                  {compoundB.canonical_name}
                </Link>
              </h2>
              <p className="mt-1 text-xs text-gray-500">RxCUI {compoundB.rxcui}</p>
              {(compoundB.card.primary_class ?? compoundB.card.classification) && (
                <p className="mt-2 text-sm font-medium text-gray-700">
                  {compoundB.card.primary_class ?? compoundB.card.classification}
                </p>
              )}
              {compoundB.card.molecule_type && (
                <p className="mt-0.5 text-xs text-gray-500 capitalize">{compoundB.card.molecule_type.replace("_", " ")}</p>
              )}
              <p className="mt-4 text-gray-700">{compoundB.card.mechanism_summary}</p>
              <p className="mt-4 text-gray-700">{compoundB.card.uses_summary}</p>
            </>
          ) : (
            <p className="text-gray-500">Select compound B</p>
          )}
        </div>
      </div>
    </div>
  );
}
