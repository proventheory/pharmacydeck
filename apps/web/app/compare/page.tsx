import { getCompoundsFromSupabase } from "@/lib/data";
import { getAllMockCompounds } from "@/lib/mock-compounds";
import { CompareClient } from "./CompareClient";

export default async function ComparePage() {
  const fromDb = await getCompoundsFromSupabase();
  const compounds = fromDb.length > 0 ? fromDb : getAllMockCompounds();

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-900">Compare compounds</h1>
        <p className="mt-2 text-gray-600">
          Select two compounds to view them side by side.
        </p>
        <CompareClient compounds={compounds} />
      </div>
    </main>
  );
}
