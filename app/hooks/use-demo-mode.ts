"use client";

import { useSyncExternalStore, useCallback, useEffect, useState } from "react";

const DEMO_MODE_KEY = "beneat-demo-mode";
const DEMO_MODE_EVENT = "beneat-demo-mode-change";

function getSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(DEMO_MODE_KEY) === "true";
}

function getServerSnapshot(): boolean {
  return false;
}

function subscribe(callback: () => void): () => void {
  const handleStorage = (e: StorageEvent) => {
    if (e.key === DEMO_MODE_KEY) {
      callback();
    }
  };

  const handleCustomEvent = () => {
    callback();
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener(DEMO_MODE_EVENT, handleCustomEvent);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(DEMO_MODE_EVENT, handleCustomEvent);
  };
}

export function isDemoModeEnabled(): boolean {
  if (typeof window === "undefined") return false;

  const urlParams = new URLSearchParams(window.location.search);
  const urlDemo = urlParams.get("demo");

  if (urlDemo === "1" || urlDemo === "true") {
    return true;
  }

  return localStorage.getItem(DEMO_MODE_KEY) === "true";
}

function notifyChange(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(DEMO_MODE_EVENT));
  }
}

export function useDemoMode() {
  const storedDemoMode = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);

    const urlParams = new URLSearchParams(window.location.search);
    const urlDemo = urlParams.get("demo");

    if (urlDemo === "1" || urlDemo === "true") {
      if (localStorage.getItem(DEMO_MODE_KEY) !== "true") {
        localStorage.setItem(DEMO_MODE_KEY, "true");
        notifyChange();
      }
    }
  }, []);

  const isDemoMode = isHydrated ? isDemoModeEnabled() : false;

  const enableDemoMode = useCallback(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(DEMO_MODE_KEY, "true");
    notifyChange();
  }, []);

  const disableDemoMode = useCallback(() => {
    if (typeof window === "undefined") return;
    localStorage.removeItem(DEMO_MODE_KEY);
    notifyChange();
  }, []);

  const toggleDemoMode = useCallback(() => {
    if (isDemoModeEnabled()) {
      localStorage.removeItem(DEMO_MODE_KEY);
    } else {
      localStorage.setItem(DEMO_MODE_KEY, "true");
    }
    notifyChange();
  }, []);

  return {
    isDemoMode,
    isHydrated,
    enableDemoMode,
    disableDemoMode,
    toggleDemoMode,
  };
}
