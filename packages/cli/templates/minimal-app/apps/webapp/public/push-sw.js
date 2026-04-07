/* global self */
self.addEventListener("push", (event) => {
  let payload = { title: "Notification", body: "" };
  try {
    if (event.data) {
      payload = { ...payload, ...event.data.json() };
    }
  } catch {
    const text = event.data?.text();
    if (text) payload = { title: "Notification", body: text };
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      data: payload.data ?? {},
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      if (clientList.length > 0) {
        const client = clientList[0];
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow("/");
      }
      return undefined;
    }),
  );
});
