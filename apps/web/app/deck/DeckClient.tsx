"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { CompoundCard } from "ui";
import type { CompoundWithCard } from "@/lib/data";
import { getSavedDeckRxcuis, removeFromDeck } from "@/lib/deck-storage";

export function DeckClient() {
  const [rxcuis, setRxcuis] = useState<string[]>([]);
  const [compounds, setCompounds] = useState<CompoundWithCard[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    const list = getSavedDeckRxcuis();
    setRxcuis(list);
    if (list.length === 0) {
      setCompounds([]);
      setLoading(false);
      return;
    }
    fetch(`/api/compounds?rxcuis=${list.join(",")}`)
      .then((res) => res.json())
      .then((data) => {
        setCompounds(data.compounds ?? []);
      })
      .catch(() => setCompounds([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const handler = () => load();
    window.addEventListener("pharmacydeck-deck-update", handler);
    return () => window.removeEventListener("pharmacydeck-deck-update", handler);
  }, []);

  const handleRemove = (rxcui: string) => {
    removeFromDeck(rxcui);
    setRxcuis((prev) => prev.filter((x) => x !== rxcui));
    setCompounds((prev) => prev.filter((c) => c.rxcui !== rxcui));
    window.dispatchEvent(new Event("pharmacydeck-deck-update"));
  };

  if (loading) {
    return <p className="mt-8 text-gray-600">Loading your deck…</p>;
  }

  if (rxcuis.length === 0) {
    return (
      <div className="mt-8 rounded-lg border border-gray-200 bg-white p-8 text-center">
        <p className="text-gray-600">Your deck is empty.</p>
        <p className="mt-2 text-sm text-gray-500">
          Visit a compound page and click &ldquo;Add to My Deck&rdquo; to save it here.
        </p>
        <Link href="/" className="mt-4 inline-block text-blue-600 hover:underline">
          Browse compounds
        </Link>
      </div>
    );
  }

  return (
    <ul className="mt-8 grid gap-4 sm:grid-cols-2">
      {compounds.map((c) => (
        <li key={c.rxcui} className="relative">
          <Link href={`/compound/${c.card.slug ?? c.canonical_name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")}`}>
            <CompoundCard
              compound={{
                rxcui: c.rxcui,
                canonical_name: c.canonical_name,
                classification: c.card.primary_class ?? c.card.classification,
                mechanism_summary: c.card.mechanism_summary,
              }}
            />
          </Link>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              handleRemove(c.rxcui);
            }}
            className="absolute right-2 top-2 rounded bg-gray-100 px-2 py-1 text-xs text-gray-600 hover:bg-gray-200"
          >
            Remove
          </button>
        </li>
      ))}
    </ul>
  );
}
