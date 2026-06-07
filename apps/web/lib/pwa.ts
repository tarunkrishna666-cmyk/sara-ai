type SyncManagerRegistration = ServiceWorkerRegistration & {
  sync?: {
    register: (tag: string) => Promise<void>;
  };
};

export async function registerBackgroundSync(tag = "sara-retry-requests"): Promise<boolean> {
  if (!("serviceWorker" in navigator)) return false;
  const registration = (await navigator.serviceWorker.ready) as SyncManagerRegistration;
  if (!registration.sync) return false;
  await registration.sync.register(tag);
  return true;
}

export async function clearSarACaches(): Promise<void> {
  if (!("caches" in window)) return;
  const keys = await caches.keys();
  await Promise.all(keys.filter((key) => key.startsWith("sara-pwa-")).map((key) => caches.delete(key)));
}
