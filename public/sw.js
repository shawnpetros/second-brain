// Service Worker for Open Brain push notifications

self.addEventListener("push", (event) => {
  if (!event.data) return;

  const data = event.data.json();
  const options = {
    body: data.body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag || "brain-notification",
    data: { url: data.url || "/dashboard/queue" },
    vibrate: [100, 50, 100],
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/dashboard/queue";
  event.waitUntil(clients.openWindow(url));
});
