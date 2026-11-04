// MyUPI's service worker: works offline, receives payment receipts shared from UPI apps, and shows daily reminders.
// Plain JS on purpose: it's served as-is from /sw.js, outside Next's build.
const SHELL = 'myupi-shell-v1';
const BOX = 'myupi-box'; // handed between the page and this worker: a shared receipt, the reminder list, what's been shown

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.add('/')).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('myupi-shell') && k !== SHELL).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Share → MyUPI: keep the image or text for the page, then open the app on it
  if (req.method === 'POST' && url.pathname === '/share-receipt') {
    e.respondWith((async () => {
      const form = await req.formData();
      const box = await caches.open(BOX);
      const file = form.get('image');
      if (file && typeof file !== 'string') await box.put('/shared/image', new Response(file, { headers: { 'content-type': file.type } }));
      const text = [form.get('title'), form.get('text'), form.get('url')].filter(Boolean).join('\n');
      if (text) await box.put('/shared/text', new Response(text));
      return Response.redirect('/?shared=1', 303);
    })());
    return;
  }
  if (req.method !== 'GET' || url.pathname.startsWith('/api/')) return;

  // built files never change under the same name: cache first
  if (url.pathname.startsWith('/_next/static/') || /\.(svg|png|webmanifest|woff2?)$/.test(url.pathname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(SHELL).then((c) => c.put(req, copy)); }
      return res;
    })));
    return;
  }
  // pages: the network when there is one (always the newest app), else the last copy
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((res) => {
      if (res.ok && url.pathname === '/') { const copy = res.clone(); caches.open(SHELL).then((c) => c.put('/', copy)); }
      return res;
    }).catch(() => caches.match(url.pathname.startsWith('/s/') ? req : '/').then((hit) => hit || caches.match('/'))));
  }
});

// Reminders: the page keeps a list of {key, date, title, body} here; about once a day Chrome wakes this worker
// (installed app only) and it shows the ones due today or earlier that haven't been shown.
// ponytail: periodic sync is best-effort (Chrome decides when); move to Web Push from a server if reminders must be on time.
async function remind() {
  const box = await caches.open(BOX);
  const list = await (await box.match('/reminders'))?.json().catch(() => []) ?? [];
  const shown = new Set(await (await box.match('/reminders-shown'))?.json().catch(() => []) ?? []);
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60e3).toISOString().slice(0, 10);
  for (const r of list) {
    if (r.date > today || shown.has(r.key)) continue;
    await self.registration.showNotification(r.title, { body: r.body, tag: r.key, icon: '/icon.svg', badge: '/icon.svg', data: { url: '/' } });
    shown.add(r.key);
  }
  await box.put('/reminders-shown', new Response(JSON.stringify([...shown].slice(-300))));
}
self.addEventListener('periodicsync', (e) => { if (e.tag === 'remind') e.waitUntil(remind()); });
self.addEventListener('message', (e) => { if (e.data === 'remind') e.waitUntil(remind()); });
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((ws) => (ws[0] ? ws[0].focus() : self.clients.openWindow('/'))));
});
