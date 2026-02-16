import { HybridChat } from "./HybridChat";

export default function ChatPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <h1 className="text-2xl font-bold text-gray-900">PharmacyDeck</h1>
        <p className="mt-1 text-gray-600">
          Chat drives discovery — deck shows cards. Ask about a compound or compare two.
        </p>
        <div className="mt-4">
          <HybridChat />
        </div>
      </div>
    </main>
  );
}
