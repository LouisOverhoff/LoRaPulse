/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import {
  cleanupOutdatedCaches,
  precacheAndRoute,
  type PrecacheEntry,
} from 'workbox-precaching';

declare global {
  interface Window {
    __WB_MANIFEST: Array<PrecacheEntry | string>;
  }
  interface ServiceWorkerGlobalScope {
    __WB_MANIFEST: Array<PrecacheEntry | string>;
  }
}

interface PushPayload {
  title?: string;
  body?: string;
  url?: string;
}

const swSelf = self as unknown as ServiceWorkerGlobalScope;

swSelf.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

swSelf.addEventListener('push', (event: PushEvent) => {
  let payload: PushPayload = {};
  if (event.data) {
    try {
      payload = event.data.json() as PushPayload;
    } catch {
      payload = { body: event.data.text() };
    }
  }

  const title = payload.title || 'LoRaPulse';
  const body = payload.body || '';
  const url = payload.url || '/';

  event.waitUntil(
    swSelf.registration.showNotification(title, {
      body,
      icon: '/icon.svg',
      badge: '/icon.svg',
      data: { url },
    })
  );
});

swSelf.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  const rawData = event.notification.data as { url?: string } | undefined;
  const targetUrl = rawData?.url || '/';

  event.waitUntil(
    (async () => {
      const windowClients = await swSelf.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      for (const client of windowClients) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client && targetUrl && targetUrl !== '/') {
            try {
              await client.navigate(targetUrl);
            } catch {
              // Ignore navigation restrictions on already focused origin client
            }
          }
          return;
        }
      }

      if (swSelf.clients.openWindow) {
        await swSelf.clients.openWindow(targetUrl);
      }
    })()
  );
});
