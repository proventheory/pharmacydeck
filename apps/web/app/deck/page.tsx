import { DeckClient } from "./DeckClient";

export default function DeckPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-900">My Deck</h1>
        <p className="mt-2 text-gray-600">
          Your saved compounds. Stored in this browser until you sign in.
        </p>
        <DeckClient />
      </div>
    </main>
  );
}
