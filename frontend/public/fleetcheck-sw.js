self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data?.json() || {};
  } catch (_error) {
    payload = {
      body: event.data?.text() || '',
    };
  }

  const title = payload.title || 'FleetCheck reminder';
  const options = {
    body: payload.body || 'Please complete your FleetCheck inspection.',
    icon: payload.icon || '/favicon.png?v=20260417',
    badge: payload.badge || '/favicon.png?v=20260417',
    tag: payload.tag || 'fleetcheck-reminder',
    requireInteraction: Boolean(payload.requireInteraction),
    renotify: Boolean(payload.renotify),
    data: {
      ...(payload.data || {}),
      url: payload.url || payload?.data?.url || '/',
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const sameOriginClient = clients.find((client) => client.url.startsWith(self.location.origin));
      if (sameOriginClient) {
        return sameOriginClient.focus().then(() => {
          if ('navigate' in sameOriginClient) {
            return sameOriginClient.navigate(targetUrl);
          }
          return undefined;
        });
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
