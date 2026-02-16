"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { addToDeck, removeFromDeck, isInDeck } from "@/lib/deck-storage";

function useDeckState(rxcui: string): boolean {
  const [inDeck, setInDeck] = useState(false);
  useEffect(() => {
    setInDeck(isInDeck(rxcui));
    const handler = () => setInDeck(isInDeck(rxcui));
    window.addEventListener("pharmacydeck-deck-update", handler);
    return () => window.removeEventListener("pharmacydeck-deck-update", handler);
  }, [rxcui]);
  return inDeck;
}

export function DeckButton({ rxcui }: { rxcui: string }) {
  const router = useRouter();
  const inDeck = useDeckState(rxcui);

  const handleToggle = () => {
    if (inDeck) removeFromDeck(rxcui);
    else addToDeck(rxcui);
    router.refresh();
    window.dispatchEvent(new Event("pharmacydeck-deck-update"));
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      className="mt-4 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
    >
      {inDeck ? "Remove from My Deck" : "Add to My Deck"}
    </button>
  );
}
