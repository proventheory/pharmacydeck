"use client";

import { useRef, useEffect, useState } from "react";
import { useChat } from "@ai-sdk/react";
import type { DeckCompound } from "@/components/DeckPanel";
import { DeckPanel } from "@/components/DeckPanel";

const EMPTY_STATE_SUGGESTIONS = [
  "What is semaglutide?",
  "Compare semaglutide and tirzepatide",
  "Tell me about metformin",
  "Tirzepatide mechanism and indications",
];

/** Parse "Suggested follow-ups:" section from assistant message text; return array of prompt strings */
function parseSuggestedFollowUps(content: string): string[] {
  if (!content || typeof content !== "string") return [];
  const marker = "Suggested follow-ups:";
  const idx = content.indexOf(marker);
  if (idx === -1) return [];
  const after = content.slice(idx + marker.length).trim();
  const lines = after.split(/\n/).map((l) => l.replace(/^[-*]\s*/, "").trim()).filter(Boolean);
  return lines.slice(0, 5);
}

/** Strip the "Suggested follow-ups:" block from display so we show chips instead */
function contentWithoutFollowUps(content: string): string {
  if (!content || typeof content !== "string") return content;
  const marker = "Suggested follow-ups:";
  const idx = content.indexOf(marker);
  if (idx === -1) return content;
  return content.slice(0, idx).trim();
}

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

/** Build context for next request from last assistant message (Phase 3) */
function buildContextFromMessages(messages: Array<{ role: string; toolInvocations?: Array<{ state?: string; result?: unknown }> }>): {
  lastCompoundNames?: string[];
  hasRegulatory?: boolean;
  hasStudies?: boolean;
} | undefined {
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  if (!lastAssistant?.toolInvocations?.length) return undefined;
  const names: string[] = [];
  let hasRegulatory = false;
  let hasStudies = false;
  for (const ti of lastAssistant.toolInvocations) {
    if (ti.state !== "result" || !ti.result || typeof ti.result !== "object") continue;
    const r = ti.result as { type?: string; data?: { canonical_name?: string; regulatory?: unknown; studies?: unknown } };
    if (r.type === "compound" && r.data) {
      if (r.data.canonical_name) names.push(r.data.canonical_name);
      if (r.data.regulatory != null) hasRegulatory = true;
      if (Array.isArray(r.data.studies) && r.data.studies.length > 0) hasStudies = true;
    }
  }
  if (names.length === 0 && !hasRegulatory && !hasStudies) return undefined;
  return { lastCompoundNames: names.length ? names : undefined, hasRegulatory, hasStudies };
}

export function HybridChat() {
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<Array<{ role: string; toolInvocations?: Array<{ state?: string; result?: unknown }> }>>([]);
  const {
    messages,
    input,
    setInput,
    handleSubmit,
    append,
    isLoading,
    error: chatError,
  } = useChat({
    api: "/api/chat",
    body: {
      get context() {
        return buildContextFromMessages(messagesRef.current);
      },
    },
    fetch: async (url, init) => {
      const res = await fetch(url, init);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const message =
          typeof (data as { error?: string })?.error === "string"
            ? (data as { error: string }).error
            : res.statusText || "Request failed";
        throw new Error(message);
      }
      return res;
    },
  });
  messagesRef.current = messages;

  const deck = extractCompoundsFromMessages(messages);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const [mode, setMode] = useState<"chat" | "deck">("chat");

  const onSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;
    handleSubmit(e);
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInput("");
    append({ role: "user", content: suggestion });
  };

  const handleFollowUpClick = (prompt: string) => {
    setInput("");
    append({ role: "user", content: prompt });
  };

  return (
    <div className="flex h-full min-h-[360px] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex shrink-0 gap-2 border-b border-gray-200 px-3 py-2">
        <button
          type="button"
          onClick={() => setMode("chat")}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${mode === "chat" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
        >
          Chat
        </button>
        <button
          type="button"
          onClick={() => setMode("deck")}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${mode === "deck" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
        >
          Deck
        </button>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className={`flex flex-1 flex-col overflow-hidden ${mode === "deck" ? "hidden" : "flex"} md:min-w-0`}>
          <div className="flex-1 space-y-5 overflow-y-auto p-4">
            {messages.length === 0 && (
              <div className="flex flex-col gap-3">
                <p className="text-gray-500">Ask about a compound or compare two. Examples:</p>
                <div className="flex flex-wrap gap-2">
                  {EMPTY_STATE_SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => handleSuggestionClick(s)}
                      className="rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id ?? Math.random()} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div className="max-w-[90%]">
                  <div
                    className={
                      m.role === "user"
                        ? "rounded-2xl rounded-tr-md bg-blue-600 px-4 py-2.5 text-white"
                        : "rounded-2xl rounded-tl-md bg-gray-100 px-4 py-2.5 text-gray-900"
                    }
                  >
                    {m.role === "user" ? (
                      <span className="whitespace-pre-wrap text-sm">{String(m.content ?? "")}</span>
                    ) : (
                      <div className="whitespace-pre-wrap text-sm">
                        {typeof m.content === "string" ? contentWithoutFollowUps(m.content) : null}
                        {m.toolInvocations?.some((ti) => ("result" in ti && (ti as { result?: { type?: string } }).result?.type === "compound")) && (
                          <span className="mt-2 block text-green-700">Card(s) added to deck →</span>
                        )}
                      </div>
                    )}
                  </div>
                  {m.role === "assistant" && typeof m.content === "string" && (() => {
                    const followUps = parseSuggestedFollowUps(m.content);
                    if (followUps.length === 0) return null;
                    return (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {followUps.map((prompt) => (
                          <button
                            key={prompt}
                            type="button"
                            onClick={() => handleFollowUpClick(prompt)}
                            className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                          >
                            {prompt}
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="max-w-[90%] rounded-2xl rounded-tl-md bg-gray-100 px-4 py-2.5 text-sm text-gray-500">
                  <span className="inline-flex items-center gap-2">
                    <span className="size-2 animate-pulse rounded-full bg-gray-400" aria-hidden />
                    Thinking… Loading compound data for your deck.
                  </span>
                </div>
              </div>
            )}
            {isLoading && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-tl-md bg-gray-100 px-4 py-2.5 text-gray-500">Thinking…</div>
              </div>
            )}
            {chatError && (
              <div className="flex flex-col gap-3">
                <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
                  {chatError.message || "Something went wrong. Try another query."}
                </p>
                <p className="text-gray-500 text-sm">Try one of these:</p>
                <div className="flex flex-wrap gap-2">
                  {EMPTY_STATE_SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setInput("");
                        append({ role: "user", content: s });
                      }}
                      className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
          <form onSubmit={onSubmit} className="shrink-0 border-t border-gray-200 p-3 flex gap-2 items-center">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Compound or question…"
              className="flex-1 min-w-0 rounded-xl border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              disabled={isLoading}
              aria-label="Compound or question"
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="shrink-0 rounded-xl bg-gray-900 px-4 py-3 text-white font-medium hover:bg-gray-800 disabled:opacity-50 disabled:pointer-events-none"
              aria-label="Send"
            >
              Send
            </button>
          </form>
        </div>
        <div className={mode === "deck" ? "flex min-w-0 flex-1 flex-col" : "hidden w-80 shrink-0 md:flex md:flex-col"}>
          <DeckPanel deck={deck} />
        </div>
      </div>
    </div>
  );
}
