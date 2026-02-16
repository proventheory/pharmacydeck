"use client";

import { useState, useCallback, useRef } from "react";
import Link from "next/link";
import { CyberdeckLayout } from "@/components/cyberdeck/CyberdeckLayout";
import { Terminal } from "@/components/cyberdeck/Terminal";
import { CyberdeckCard } from "@/components/cyberdeck/CyberdeckCard";
import { MoleculeViewer } from "@/components/cyberdeck/MoleculeViewer";
import { useCyberdeckKeys, requestFullscreen } from "@/hooks/useCyberdeckKeys";

type StreamEvent = { event: string; data: unknown };
type CardEntry = { compound: unknown; smiles: string | null };

const MAX_HISTORY = 20;
const isLoading = (s: string | null) =>
  s === "resolving_identity" || s === "identity_ready" || s === "chemistry_ready" || s === "studies_ready";

export function CyberdeckClient() {
  const [status, setStatus] = useState<string | null>(null);
  const [compound, setCompound] = useState<unknown>(null);
  const [smiles, setSmiles] = useState<string | null>(null);
  const [chemistryLoading, setChemistryLoading] = useState(false);
  const [cardHistory, setCardHistory] = useState<CardEntry[]>([]);
  const [selectedHistoryIndex, setSelectedHistoryIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const liveSmilesRef = useRef<string | null>(null);
  const historyLengthRef = useRef(0);
  historyLengthRef.current = cardHistory.length;

  const handleQuery = useCallback(async (query: string) => {
    setStatus("resolving_identity");
    setCompound(null);
    setSmiles(null);
    setSelectedHistoryIndex(0);
    setChemistryLoading(true);
    try {
      const res = await fetch("/api/generateCompound/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      if (!res.ok || !res.body) {
        setStatus("error");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const parsed = JSON.parse(line.slice(6)) as StreamEvent;
            switch (parsed.event) {
              case "resolving_identity":
                setStatus("resolving_identity");
                break;
              case "identity_ready":
                setStatus("identity_ready");
                break;
              case "chemistry_ready": {
                setStatus("chemistry_ready");
                setChemistryLoading(false);
                const d = parsed.data as Record<string, unknown> | null;
                const s = d?.smiles ? String(d.smiles) : null;
                liveSmilesRef.current = s;
                if (s) setSmiles(s);
                break;
              }
              case "studies_ready":
                setStatus("studies_ready");
                break;
              case "card_ready": {
                const data = parsed.data;
                const capturedSmiles = liveSmilesRef.current;
                setStatus("card_ready");
                setCompound(data);
                setCardHistory((prev) => [
                  { compound: data, smiles: capturedSmiles },
                  ...prev.slice(0, MAX_HISTORY - 1),
                ]);
                setSelectedHistoryIndex(0);
                break;
              }
              case "error":
                setStatus("error");
                setCompound(null);
                break;
            }
          } catch {
            // skip malformed
          }
        }
      }
      liveSmilesRef.current = null;
    } catch {
      setStatus("error");
    } finally {
      setChemistryLoading(false);
    }
  }, []);

  const cycleCard = useCallback(() => {
    const len = historyLengthRef.current;
    if (len <= 1) return;
    setSelectedHistoryIndex((i) => (i + 1) % len);
  }, []);

  useCyberdeckKeys({
    onClear: () => {
      setStatus(null);
      setCompound(null);
      setSmiles(null);
      setSelectedHistoryIndex(0);
    },
    onFullscreen: requestFullscreen,
    onCycleCard: cycleCard,
  });

  const showFromHistory = !isLoading(status) && cardHistory.length > 0 && status !== "error";
  const displayEntry = showFromHistory ? cardHistory[selectedHistoryIndex] : null;
  const displayCompound = displayEntry?.compound ?? compound;
  const displaySmiles = displayEntry?.smiles ?? smiles;

  return (
    <CyberdeckLayout>
      <div className="flex h-full flex-col">
        <header className="flex shrink-0 items-center justify-between border-b border-[#00ffcc]/30 px-4 py-2 font-mono">
          <Link href="/" className="text-lg font-bold tracking-wider text-[#00ffcc]">
            PHARMACYDECK TERMINAL
          </Link>
          <span className="text-xs text-[#00ffcc]/60">
            ENTER search · TAB cards · ESC clear · Cmd+K focus · F fullscreen
          </span>
        </header>
        <Terminal
          inputRef={inputRef}
          onQuery={handleQuery}
          disabled={isLoading(status)}
          status={status ?? undefined}
        />
        <div className="flex flex-1 flex-wrap gap-4 overflow-auto p-4">
          <div className="min-w-[280px] flex-1">
            <MoleculeViewer
              smiles={displaySmiles}
              loading={chemistryLoading && status !== "card_ready"}
              title="MOLECULAR STRUCTURE"
            />
          </div>
          <div className="min-w-[280px] flex-1">
            <CyberdeckCard
              compound={displayCompound as Parameters<typeof CyberdeckCard>[0]["compound"]}
              loadingStage={
                status && !displayCompound && status !== "error" ? status : null
              }
            />
            {displayCompound ? (
              <Link
                href={`/compound/${(displayCompound as { card?: { slug?: string }; canonical_name?: string }).card?.slug ?? (displayCompound as { canonical_name?: string }).canonical_name?.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") ?? ""}`}
                className="mt-3 inline-block text-sm text-[#00ffcc] underline hover:no-underline font-mono"
              >
                Open full card →
              </Link>
            ) : null}
            {cardHistory.length > 1 && (
              <p className="mt-2 text-xs text-[#00ffcc]/60 font-mono">
                TAB to cycle ({selectedHistoryIndex + 1}/{cardHistory.length})
              </p>
            )}
          </div>
        </div>
      </div>
    </CyberdeckLayout>
  );
}
