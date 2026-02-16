"use client";

import { useEffect, useRef, useState, useId } from "react";

interface MoleculeViewerProps {
  smiles: string | null;
  loading?: boolean;
  title?: string;
}

export function MoleculeViewer({ smiles, loading, title = "Structure" }: MoleculeViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const domId = useId().replace(/:/g, "-");

  useEffect(() => {
    if (!smiles?.trim()) {
      setError(null);
      return;
    }
    setError(null);
    const el = containerRef.current;
    if (!el) return;

    let cancelled = false;
    (async () => {
      try {
        const SmilesDrawer = (await import("smiles-drawer")).default;
        const drawer = new SmilesDrawer.Drawer({
          width: 280,
          height: 200,
          bondThickness: 1.5,
          bondLength: 15,
          shortBondLength: 0.85,
          bondSpacing: 5,
          atomVisualization: "default",
          isomeric: true,
        });
        SmilesDrawer.parse(
          smiles,
          (tree: unknown) => {
            if (cancelled) return;
            el.innerHTML = "";
            const canvas = document.createElement("canvas");
            canvas.id = domId;
            canvas.width = 280;
            canvas.height = 200;
            el.appendChild(canvas);
            drawer.draw(tree, domId, "dark", false);
          },
          (err: Error) => {
            if (!cancelled) setError(err?.message ?? "Parse error");
          }
        );
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load renderer");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [smiles, domId]);

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center rounded border border-[#00ffcc]/30 bg-[#00ffcc]/5">
        <span className="text-sm text-[#00ffcc]/60">Loading structure…</span>
      </div>
    );
  }

  return (
    <div className="rounded border border-[#00ffcc]/30 bg-[#00ffcc]/5">
      <div className="border-b border-[#00ffcc]/30 px-2 py-1 text-xs uppercase text-[#00ffcc]/80">
        {title}
      </div>
      <div ref={containerRef} className="min-h-[120px] p-2 flex items-center justify-center" />
      {error && <p className="p-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}
