"use client";

interface CyberdeckCardProps {
  compound: {
    canonical_name?: string;
    rxcui?: string;
    card?: {
      primary_class?: string | null;
      mechanism_summary?: string | null;
      study_count?: number | null;
      deck_stats?: Record<string, number> | null;
    };
  } | null;
  loadingStage?: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  resolving_identity: "RESOLVING IDENTITY",
  identity_ready: "LOADING STRUCTURE",
  chemistry_ready: "LOADING STUDIES",
  studies_ready: "BUILDING CARD",
  card_ready: "CARD READY",
};

export function CyberdeckCard({ compound, loadingStage }: CyberdeckCardProps) {
  if (loadingStage) {
    const label = STATUS_LABELS[loadingStage] ?? loadingStage.toUpperCase();
    return (
      <div className="rounded border border-[#00ffcc]/40 bg-[#00ffcc]/5 p-4 font-mono text-sm">
        <div className="animate-pulse text-[#00ffcc]/70">[ {label} ]</div>
      </div>
    );
  }
  if (!compound) return null;
  const c = compound;
  const deck = c.card?.deck_stats ?? {};
  const power = deck.power_score ?? deck.power ?? null;
  const rarity = deck.rarity_score ?? deck.rarity ?? null;
  return (
    <div className="rounded border border-[#00ffcc]/40 bg-[#00ffcc]/5 p-4 font-mono text-sm">
      <div className="border-b border-[#00ffcc]/30 pb-2">
        <h2 className="text-lg font-bold uppercase tracking-wider text-[#00ffcc]">
          {c.canonical_name ?? "—"}
        </h2>
        <p className="mt-0.5 text-xs text-[#00ffcc]/70">RxCUI {c.rxcui ?? "—"}</p>
      </div>
      <div className="mt-3 space-y-1 text-xs text-[#00ffcc]/90">
        {c.card?.primary_class && (
          <p>CLASS: {c.card.primary_class}</p>
        )}
        {power != null && <p>POWER: {power}</p>}
        {rarity != null && <p>RARITY: {rarity}</p>}
        {c.card?.study_count != null && (
          <p>STUDIES: {c.card.study_count}</p>
        )}
      </div>
      {c.card?.mechanism_summary && (
        <p className="mt-3 line-clamp-2 text-xs text-[#00ffcc]/80">
          {c.card.mechanism_summary}
        </p>
      )}
    </div>
  );
}
