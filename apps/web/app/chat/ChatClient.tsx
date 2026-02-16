"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { CompoundCard } from "ui";

type Message = { role: "user" | "assistant"; content: string; compound?: unknown };

export function ChatClient() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const q = input.trim();
    if (!q || loading) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: q }]);
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, { role: "user" as const, content: q }].map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });
      const data = await res.json();
      const text = data.message ?? (res.ok ? "Done." : data.error ?? "Something went wrong.");
      const compound = data.compound ?? null;
      setMessages((prev) => [...prev, { role: "assistant", content: text, compound }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Request failed." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-6 flex flex-col rounded-lg border border-gray-200 bg-white">
      <div className="flex-1 space-y-4 overflow-y-auto p-4 min-h-[320px] max-h-[60vh]">
        {messages.length === 0 && (
          <p className="text-gray-500">Try: semaglutide, tirzepatide, metformin</p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
          >
            <div
              className={
                m.role === "user"
                  ? "max-w-[85%] rounded-lg bg-blue-600 px-3 py-2 text-white"
                  : "max-w-[85%] rounded-lg bg-gray-100 px-3 py-2 text-gray-900"
              }
            >
              <div className="whitespace-pre-wrap text-sm">{m.content}</div>
              {m.compound && typeof m.compound === "object" && "canonical_name" in m.compound
                ? (
                <div className="mt-3 border-t border-gray-200 pt-3">
                  <Link
                    href={`/compound/${(m.compound as { card?: { slug?: string }; canonical_name?: string }).card?.slug ?? (m.compound as { canonical_name?: string }).canonical_name?.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") ?? ""}`}
                    className="block rounded border border-gray-200 bg-white p-3 hover:bg-gray-50"
                  >
                    <CompoundCard
                      compound={{
                        rxcui: (m.compound as { rxcui?: string }).rxcui ?? "",
                        canonical_name: (m.compound as { canonical_name?: string }).canonical_name ?? "",
                        classification: (m.compound as { card?: { primary_class?: string; classification?: string } }).card?.primary_class ?? (m.compound as { card?: { classification?: string } }).card?.classification ?? null,
                        mechanism_summary: (m.compound as { card?: { mechanism_summary?: string } }).card?.mechanism_summary ?? null,
                      }}
                    />
                  </Link>
                  <p className="mt-1 text-xs text-gray-500">Click to open full card</p>
                </div>
                  )
                : null}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-lg bg-gray-100 px-3 py-2 text-gray-500">Resolving…</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="border-t border-gray-200 p-3"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Compound name…"
          className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          disabled={loading}
        />
      </form>
    </div>
  );
}
