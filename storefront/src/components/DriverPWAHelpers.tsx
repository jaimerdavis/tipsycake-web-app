"use client";

import { useSyncExternalStore, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

function subscribe(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

function getSnapshot() {
  return typeof navigator !== "undefined" ? !navigator.onLine : false;
}

export function OfflineIndicator() {
  const offline = useSyncExternalStore(subscribe, getSnapshot, () => false);

  if (!offline) return null;

  return (
    <div className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-amber-500/95 px-4 py-2 text-sm font-medium text-amber-950">
      <span>You&apos;re offline. Actions will sync when the connection returns.</span>
    </div>
  );
}

export function AddToHomeScreenPrompt() {
  const [show, setShow] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<{ prompt: () => Promise<{ outcome: string }> } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches
      || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    const dismissed = sessionStorage.getItem("pwa-install-dismissed") === "1";
    if (isStandalone || dismissed) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as unknown as { prompt: () => Promise<{ outcome: string }> });
      setShow(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      const result = await deferredPrompt.prompt();
      if (result.outcome === "accepted") setShow(false);
    }
  };

  const handleDismiss = () => {
    setShow(false);
    sessionStorage.setItem("pwa-install-dismissed", "1");
  };

  if (!show) return null;

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/80 px-4 py-3 text-sm">
      <p>Add to Home Screen for a better app-like experience.</p>
      <div className="flex shrink-0 gap-2">
        <Button size="sm" variant="outline" onClick={handleDismiss}>
          Not now
        </Button>
        <Button size="sm" onClick={handleInstall}>
          Install
        </Button>
      </div>
    </div>
  );
}
