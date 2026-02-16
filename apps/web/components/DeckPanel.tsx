"use client";

import Link from "next/link";
import { CompoundCard } from "ui";

export interface DeckCompound {
  rxcui: string;
  canonical_name: string;
  card?: {
    slug?: string | null;
    primary_class?: string | null;
    classification?: string | null;
    mechanism_summary?: string | null;
    study_count?: number | null;
    deck_stats?: Record<string, number> | null;
  };
}

function slugFrom(c: DeckCompound): string {
  return (
    c.card?.slug ??
    c.canonical_name
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "") ??
    ""
  );
}

export function DeckPanel({ deck }: { deck: DeckCompound[] }) {
  return (
    <div className="flex h-full flex-col border-l border-gray-200 bg-gray-50/80">
      <div className="border-b border-gray-200 px-4 py-2">
        <h2 className="text-sm font-semibold text-gray-700">Deck</h2>
        <p className="text-xs text-gray-500">Cards from this session</p>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {deck.length === 0 ? (
          <p className="text-sm text-gray-500">Ask about a compound to see cards here.</p>
        ) : (
          <ul className="space-y-3">
            {deck.map((c) => (
              <li key={c.rxcui}>
                <Link href={`/compound/${slugFrom(c)}`} className="block">
                  <CompoundCard
                    compound={{
                      rxcui: c.rxcui,
                      canonical_name: c.canonical_name,
                      classification: c.card?.primary_class ?? c.card?.classification ?? null,
                      mechanism_summary: c.card?.mechanism_summary ?? null,
                    }}
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
