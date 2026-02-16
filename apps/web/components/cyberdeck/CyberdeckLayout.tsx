"use client";

import { useEffect } from "react";

export function CyberdeckLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.add("cyberdeck");
    document.body.style.background = "#0a0a0a";
    document.body.style.color = "#00ffcc";
    document.body.style.fontFamily = "'JetBrains Mono', 'Fira Code', monospace";
    return () => {
      document.documentElement.classList.remove("cyberdeck");
      document.body.style.background = "";
      document.body.style.color = "";
      document.body.style.fontFamily = "";
    };
  }, []);
  return (
    <div className="h-screen w-screen overflow-hidden bg-[#0a0a0a] text-[#00ffcc]">
      {children}
    </div>
  );
}
