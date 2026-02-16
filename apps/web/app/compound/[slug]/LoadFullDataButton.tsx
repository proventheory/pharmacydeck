"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LoadFullDataButton({ slug }: { slug: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLoad() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/compound/${encodeURIComponent(slug)}/ingest`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Request failed (${res.status})`);
        return;
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
      <p className="text-sm text-amber-900">
        Mechanism, uses, safety, and pharmacokinetics are not loaded yet. Run a one-time load to fetch them from FDA, DailyMed, and PubMed.
      </p>
      <button
        type="button"
        onClick={handleLoad}
        disabled={loading}
        className="mt-3 rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
      >
        {loading ? "Loading… (this may take 30–60 seconds)" : "Load full data"}
      </button>
      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}
