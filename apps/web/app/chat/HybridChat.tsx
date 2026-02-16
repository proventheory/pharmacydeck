"use client";

import { useRef, useEffect, useState } from "react";
import { useChat } from "@ai-sdk/react";
import type { DeckCompound } from "@/components/DeckPanel";
import { DeckPanel } from "@/components/DeckPanel";

function extractCompoundsFromMessages(messages: Array<{ role: string; toolInvocations?: Array<{ state?: string; result?: unknown }> }>): DeckCompound[] {
  const seen = new Set<string>();
  const out: DeckCompound[] = [];
  for (const m of messages) {
    if (m.role !== "assistant" || !m.toolInvocations) continue;
    for (const ti of m.toolInvocations) {
      if (ti.state !== "result" || !ti.result || typeof ti.result !== "object") continue;
      const r = ti.result as { type?: string; data?: { rxcui?: string; canonical_name?: string; card?: DeckCompound["card"] } };
      if (r.type !== "compound" || !r.data?.rxcui || seen.has(r.data.rxcui)) continue;
      seen.add(r.data.rxcui);
      out.push({
        rxcui: r.data.rxcui,
        canonical_name: r.data.canonical_name ?? "",
        card: r.data.card,
      });
    }
  }
  return out;
}

export function HybridChat() {
  const bottomRef = useRef<HTMLDivElement>(null);
  const {
    messages,
    input,
    setInput,
    handleSubmit,
    status,
    error,
  } = useChat({
    api: "/api/chat",
    body: {},
  });

  const deck = extractCompoundsFromMessages(messages);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const [mode, setMode] = useState<"chat" | "deck">("chat");

  return (
    <div className="flex h-[calc(100vh-8rem)] min-h-[420px] flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="flex shrink-0 gap-2 border-b border-gray-200 px-3 py-2">
        <button
          type="button"
          onClick={() => setMode("chat")}
          className={`rounded px-3 py-1 text-sm ${mode === "chat" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"}`}
        >
          Chat
        </button>
        <button
          type="button"
          onClick={() => setMode("deck")}
          className={`rounded px-3 py-1 text-sm ${mode === "deck" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"}`}
        >
          Deck
        </button>
      </div>
      <div className="flex flex-1 overflow-hidden">
      <div className={`flex w-full flex-1 flex-col overflow-hidden ${mode === "deck" ? "hidden" : "md:min-w-0"}`}>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {messages.length === 0 && (
            <p className="text-gray-500">Ask about a compound (e.g. semaglutide) or compare two (e.g. semaglutide vs tirzepatide).</p>
          )}
          {messages.map((m) => (
            <div
              key={m.id ?? Math.random()}
              className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
            >
              <div
                className={
                  m.role === "user"
                    ? "max-w-[85%] rounded-lg bg-blue-600 px-3 py-2 text-white"
                    : "max-w-[85%] rounded-lg bg-gray-100 px-3 py-2 text-gray-900"
                }
              >
                {m.role === "user" ? (
                  <span className="whitespace-pre-wrap text-sm">{String(m.content ?? "")}</span>
                ) : (
                  <div className="whitespace-pre-wrap text-sm">
                    {typeof m.content === "string" && m.content ? m.content : null}
                    {m.toolInvocations?.some((ti) => ("result" in ti && (ti as { result?: { type?: string } }).result?.type === "compound")) && (
                      <span className="mt-2 block text-green-700">Card(s) added to deck →</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          {status === "streaming" && (
            <div className="flex justify-start">
              <div className="rounded-lg bg-gray-100 px-3 py-2 text-gray-500">Thinking…</div>
            </div>
          )}
          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{String(error)}</div>
          )}
          <div ref={bottomRef} />
        </div>
        <form onSubmit={handleSubmit} className="border-t border-gray-200 p-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Compound or question…"
            className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            disabled={status === "streaming"}
          />
        </form>
      </div>
      <div className={mode === "deck" ? "min-w-0 flex-1 overflow-hidden" : "hidden w-80 shrink-0 md:block"}>
        <DeckPanel deck={deck} />
      </div>
      </div>
    </div>
  );
}
