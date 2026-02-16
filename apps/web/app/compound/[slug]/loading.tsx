export default function CompoundLoading() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="flex items-center gap-2 text-gray-500">
          <span className="size-2 animate-pulse rounded-full bg-gray-400" aria-hidden />
          <span>Loading compound details…</span>
        </div>
      </div>
    </main>
  );
}
