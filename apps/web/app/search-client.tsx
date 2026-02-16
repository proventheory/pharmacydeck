"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SearchInput } from "ui";

export function SearchClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (query: string) => {
    if (!query.trim()) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/resolve?q=${encodeURIComponent(query.trim())}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Not found");
        setLoading(false);
        return;
      }
      const slug = data.compound?.card?.slug ?? data.compound?.canonical_name?.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") ?? query.trim().toLowerCase().replace(/\s+/g, "-");
      router.push(`/compound/${slug}`);
    } catch {
      setError("Search failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-8">
      <SearchInput
        placeholder="Type a compound name (e.g. semaglutide)…"
        onSearch={handleSearch}
        className="max-w-xl"
      />
      {loading && <p className="mt-2 text-sm text-gray-500">Resolving…</p>}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
