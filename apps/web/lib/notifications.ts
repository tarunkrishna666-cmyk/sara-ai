export type NotificationPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!("Notification" in window)) return "denied";
  return Notification.requestPermission();
}

export async function getPushSubscription(
  applicationServerKey?: BufferSource,
): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing || !applicationServerKey) return existing;
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey,
  });
}

export async function showLocalNotification(payload: NotificationPayload): Promise<void> {
  if (Notification.permission !== "granted" || !("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.ready;
  await registration.showNotification(payload.title, {
    body: payload.body,
    icon: "/icons/icon-192x192.png",
    badge: "/icons/icon-96x96.png",
    tag: payload.tag,
    data: { url: payload.url || "/" },
  });
}
