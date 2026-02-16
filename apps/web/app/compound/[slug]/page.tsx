import { notFound } from "next/navigation";
import Link from "next/link";
import { getMockCompoundBySlug } from "@/lib/mock-compounds";

export default async function CompoundPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const compound = getMockCompoundBySlug(slug);
  if (!compound) notFound();

  const { card } = compound;

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Link href="/" className="text-sm text-blue-600 hover:underline">
          ← Back to Home
        </Link>
        <h1 className="mt-4 text-3xl font-bold text-gray-900">
          {compound.canonical_name}
        </h1>
        {compound.description && (
          <p className="mt-2 text-gray-600">{compound.description}</p>
        )}

        <div className="mt-8 space-y-6">
          {card.classification && (
            <section>
              <h2 className="text-lg font-semibold text-gray-900">Classification</h2>
              <p className="mt-1 text-gray-700">{card.classification}</p>
            </section>
          )}
          {card.mechanism_summary && (
            <section>
              <h2 className="text-lg font-semibold text-gray-900">Mechanism</h2>
              <p className="mt-1 text-gray-700">{card.mechanism_summary}</p>
            </section>
          )}
          {card.uses_summary && (
            <section>
              <h2 className="text-lg font-semibold text-gray-900">Uses</h2>
              <p className="mt-1 text-gray-700">{card.uses_summary}</p>
            </section>
          )}
          {card.safety_summary && (
            <section>
              <h2 className="text-lg font-semibold text-gray-900">Safety</h2>
              <p className="mt-1 text-gray-700">{card.safety_summary}</p>
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
        </div>
      </div>
    </main>
  );
}
