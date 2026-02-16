import Link from "next/link";
import { CompoundCard } from "ui";
import { SearchInput } from "ui";
import { getAllMockCompounds } from "@/lib/mock-compounds";

export default function Home() {
  const trending = getAllMockCompounds().slice(0, 5);

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-900">PharmacyDeck</h1>
        <p className="mt-2 text-gray-600">
          Pharmaceutical intelligence interface — explore compounds, compare, and build your deck.
        </p>

        <div className="mt-8">
          <SearchInput
            placeholder="Search compounds…"
            className="max-w-xl"
          />
        </div>

        <section className="mt-10">
          <h2 className="text-xl font-semibold text-gray-900">Trending compounds</h2>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {trending.map((c) => (
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
        </section>

        <section className="mt-10 rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-lg font-semibold text-gray-900">My Deck</h2>
          <p className="mt-2 text-sm text-gray-600">
            <Link href="/deck" className="text-blue-600 hover:underline">
              View your saved compounds
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}
