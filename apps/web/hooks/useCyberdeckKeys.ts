"use client";

import { useEffect, useCallback } from "react";

export function useCyberdeckKeys({
  onClear,
  onFullscreen,
  onCycleCard,
}: {
  onClear?: () => void;
  onFullscreen?: () => void;
  onCycleCard?: () => void;
}) {
  const onClearRef = useCallback(onClear ?? (() => {}), [onClear]);
  const onFullscreenRef = useCallback(onFullscreen ?? (() => {}), [onFullscreen]);
  const onCycleCardRef = useCallback(onCycleCard ?? (() => {}), [onCycleCard]);

  useEffect(() => {
    function handle(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClearRef();
      }
      if (e.key === "f" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        onFullscreenRef();
      }
      if (e.key === "Tab" && onCycleCardRef) {
        e.preventDefault();
        onCycleCardRef();
      }
    }
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [onClearRef, onFullscreenRef, onCycleCardRef]);
}

function requestFullscreen() {
  if (document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen();
  }
}

export { requestFullscreen };
