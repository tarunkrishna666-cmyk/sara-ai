"use client";

import { useEffect, useState } from "react";
import { Download, RefreshCw, Share, WifiOff, X } from "lucide-react";
import Image from "next/image";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const [online, setOnline] = useState(true);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [launching, setLaunching] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    setIsIos(
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1),
    );
    setIsStandalone(
      window.matchMedia("(display-mode: standalone)").matches ||
        ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone)),
    );

    const offline = () => setOnline(false);
    const online = () => setOnline(true);
    const beforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
      window.setTimeout(() => setShowInstall(true), 1200);
    };
    const openInstall = () => setShowInstall(true);

    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("sara:open-install", openInstall);
    window.setTimeout(() => setLaunching(false), 650);

    if ("serviceWorker" in navigator) {
      if (process.env.NODE_ENV === "production") {
        void navigator.serviceWorker.register("/service-worker.js", { scope: "/" });
      } else {
        // Development bundles change in place, so an old PWA cache can cause hydration mismatches.
        void navigator.serviceWorker.getRegistrations().then((registrations) =>
          Promise.all(registrations.map((registration) => registration.unregister())),
        );
        if ("caches" in window) {
          void caches.keys().then((keys) =>
            Promise.all(keys.filter((key) => key.startsWith("sara-pwa-")).map((key) => caches.delete(key))),
          );
        }
      }
    }

    return () => {
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("sara:open-install", openInstall);
    };
  }, []);

  async function install() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const result = await installPrompt.userChoice;
    if (result.outcome === "accepted") setShowInstall(false);
    setInstallPrompt(null);
  }

  return (
    <>
      {children}
      {launching && isStandalone ? (
        <div className="pwa-splash" aria-label="Launching sarA">
          <Image src="/icons/icon-192x192.png" alt="" width={96} height={96} priority />
          <p>sarA AI</p>
        </div>
      ) : null}

      {!online ? (
        <div className="offline-banner" role="status">
          <WifiOff className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1">You're offline. sarA will reconnect automatically.</span>
          <button type="button" onClick={() => window.location.reload()} aria-label="Retry connection">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {!isStandalone && (installPrompt || isIos) ? (
        <button type="button" className="install-chip" onClick={() => setShowInstall(true)}>
          <Download className="h-4 w-4" />
          Install sarA
        </button>
      ) : null}

      {showInstall && !isStandalone ? (
        <div className="install-backdrop" role="presentation" onClick={() => setShowInstall(false)}>
          <section className="install-card" role="dialog" aria-modal="true" aria-labelledby="install-title" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="install-close" onClick={() => setShowInstall(false)} aria-label="Close install instructions"><X className="h-4 w-4" /></button>
            <Image src="/icons/icon-192x192.png" alt="sarA AI" width={64} height={64} />
            <h2 id="install-title">Install sarA AI</h2>
            {isIos && !installPrompt ? (
              <p>Tap <Share className="inline h-4 w-4" /> Share, then choose <strong>Add to Home Screen</strong>.</p>
            ) : !installPrompt ? (
              <p>Use the install icon in Chrome&apos;s address bar, or open the browser menu and choose <strong>Install sarA AI</strong>.</p>
            ) : (
              <p>Install sarA for faster launches, offline access, and a native app experience.</p>
            )}
            {installPrompt ? <button type="button" className="primary-action install-action" onClick={install}><Download className="h-4 w-4" />Install app</button> : null}
          </section>
        </div>
      ) : null}
    </>
  );
}
