"use client";

import { useState, useRef, useEffect } from "react";

const STATUS_LABELS: Record<string, string> = {
  resolving_identity: "RESOLVING IDENTITY",
  identity_ready: "LOADING STRUCTURE",
  chemistry_ready: "LOADING STUDIES",
  studies_ready: "BUILDING CARD",
  card_ready: "CARD READY",
  error: "ERROR",
};

export function Terminal({
  onQuery,
  disabled,
  status,
  inputRef: externalInputRef,
}: {
  onQuery: (q: string) => void;
  disabled?: boolean;
  status?: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const [input, setInput] = useState("");
  const internalRef = useRef<HTMLInputElement>(null);
  const inputRef = externalInputRef ?? internalRef;

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [inputRef]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = input.trim();
    if (q && !disabled) {
      onQuery(q);
      setInput("");
    }
  };

  const statusLabel = status ? STATUS_LABELS[status] ?? status.toUpperCase() : null;

  return (
    <div className="border-b border-[#00ffcc]/30 px-4 py-3">
      {statusLabel && (
        <p className="mb-2 font-mono text-xs text-[#00ffcc]/90">
          [ {statusLabel} ]
        </p>
      )}
      <form onSubmit={handleSubmit} className="flex items-center gap-2 font-mono">
        <span className="select-none text-[#00ffcc]">&gt;</span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit(e as unknown as React.FormEvent)}
          placeholder=" compound name"
          disabled={disabled}
          className="min-w-0 flex-1 bg-transparent text-[#00ffcc] placeholder:text-[#00ffcc]/50 focus:outline-none disabled:opacity-50"
          autoFocus
        />
      </form>
    </div>
  );
}
