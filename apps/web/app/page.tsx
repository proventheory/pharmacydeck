import { HybridChat } from "./chat/HybridChat";

export default function Home() {
  return (
    <main className="flex min-h-[calc(100vh-3.5rem)] flex-col bg-gray-50">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-4">
        <div className="mb-2 shrink-0">
          <h1 className="text-xl font-bold text-gray-900">PharmacyDeck</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Search or ask about any compound — compare, see FDA info, and build your deck.
          </p>
        </div>
        <div className="min-h-0 flex-1">
          <HybridChat />
        </div>
      </div>
    </main>
  );
}
