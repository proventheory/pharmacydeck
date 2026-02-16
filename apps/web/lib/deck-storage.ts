/**
 * Client-side deck storage (localStorage). Key: pharmacydeck_deck = JSON array of RxCUI strings.
 */

const DECK_KEY = "pharmacydeck_deck";

export function getSavedDeckRxcuis(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(DECK_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function addToDeck(rxcui: string): void {
  const list = getSavedDeckRxcuis();
  if (list.includes(rxcui)) return;
  list.push(rxcui);
  localStorage.setItem(DECK_KEY, JSON.stringify(list));
}

export function removeFromDeck(rxcui: string): void {
  const list = getSavedDeckRxcuis().filter((x) => x !== rxcui);
  localStorage.setItem(DECK_KEY, JSON.stringify(list));
}

export function isInDeck(rxcui: string): boolean {
  return getSavedDeckRxcuis().includes(rxcui);
}
