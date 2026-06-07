# sarA PWA Testing Checklist

## Production setup

1. Build and start the frontend with `npm run build:web` and the production start command.
2. Serve the frontend and API over HTTPS outside localhost.
3. Confirm `NEXT_PUBLIC_API_URL` points to the production API.

## Manifest and installability

- Open `/manifest.json` and validate all required fields.
- Confirm every standard and maskable icon returns HTTP 200.
- Chrome/Edge DevTools Application panel reports sarA as installable.
- Android Chrome, Samsung Internet, Edge Android, Windows Chrome/Edge, macOS Chrome, and desktop Chrome show the install option.
- iPhone/iPad Safari can install using Share > Add to Home Screen.
- Installed app opens in standalone display mode with black launch background.

## Service worker and offline mode

- `/service-worker.js` registers with scope `/`.
- Reload once online, then enable offline mode and reload.
- Cached UI shell loads.
- Offline banner displays: "You're offline. sarA will reconnect automatically."
- Retry connection button reloads the app.
- Previously fetched conversations and messages remain available from the
  user-scoped device cache. Authenticated API responses are never cached by the
  service worker.
- Updating the cache version removes old caches.

## Notifications and background sync

- `lib/notifications.ts` requests permission only after user interaction.
- Push subscription helper returns an existing subscription or creates one when a VAPID key is supplied.
- Service worker handles `push` and `notificationclick`.
- Background sync event `sara-retry-requests` notifies open clients.

## Platform checks

- Android: standalone launch, install prompt, safe areas, full-screen navigation.
- iPhone/iPad: black translucent status bar, notch and home indicator spacing, iOS install instructions.
- Windows/macOS/Linux: install, standalone window, app icon, offline reload.

## Lighthouse

- Run Lighthouse PWA audit against the production HTTPS build.
- Target PWA score above 90.
- Confirm first load under 2 seconds and repeat load under 1 second on representative hardware/network.
