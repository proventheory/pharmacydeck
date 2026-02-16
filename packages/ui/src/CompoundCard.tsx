export interface CompoundCardData {
  rxcui: string;
  canonical_name: string;
  classification?: string | null;
  mechanism_summary?: string | null;
  uses_summary?: string | null;
}

export interface CompoundCardProps {
  compound: CompoundCardData;
  className?: string;
  as?: "article" | "div";
}

export function CompoundCard({
  compound,
  className = "",
  as: Component = "article",
}: CompoundCardProps) {
  return (
    <Component
      className={`rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition hover:border-gray-300 hover:shadow-md ${className}`}
    >
      <h3 className="font-semibold text-gray-900">{compound.canonical_name}</h3>
      {compound.classification && (
        <p className="mt-1 text-sm text-gray-600">{compound.classification}</p>
      )}
      {compound.mechanism_summary && (
        <p className="mt-2 line-clamp-2 text-sm text-gray-700">
          {compound.mechanism_summary}
        </p>
      )}
    </Component>
  );
}
