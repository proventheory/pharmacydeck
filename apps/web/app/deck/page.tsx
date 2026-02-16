import Link from "next/link";
import { getAllMockCompounds } from "@/lib/mock-compounds";
import { CompoundCard } from "ui";

export default function DeckPage() {
  const saved = getAllMockCompounds().slice(0, 3);

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-900">My Deck</h1>
        <p className="mt-2 text-gray-600">
          Your saved compounds. (Mock: showing first 3 for skeleton.)
        </p>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {saved.map((c) => (
            <li key={c.rxcui}>
              <Link href={`/compound/${c.canonical_name.toLowerCase().replace(/\s+/g, "-")}`}>
                <CompoundCard
                  compound={{
                    rxcui: c.rxcui,
                    canonical_name: c.canonical_name,
                    classification: c.card.classification,
                    mechanism_summary: c.card.mechanism_summary,
                  }}
                />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
