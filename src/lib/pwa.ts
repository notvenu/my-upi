import { db, listNudges, listSubs, toConfirm } from './db';
import { rupees } from './upi';

// Installed-app extras: offline (sw.js), receipts shared in from UPI apps, daily reminders and the fingerprint lock.
// Reminders and the lock are per device, so they live in localStorage, not in the synced settings.
const BOX = 'myupi-box';
const local = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };

export function registerSW() {
  if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

// What the Share button handed over (sw.js keeps it for one pick-up), or null.
export async function takeShared(): Promise<{ image?: Blob; text?: string } | null> {
  if (!new URLSearchParams(location.search).has('shared') || !('caches' in window)) return null;
  history.replaceState(null, '', '/');
  const box = await caches.open(BOX);
  const [img, txt] = await Promise.all([box.match('/shared/image'), box.match('/shared/text')]);
  await Promise.all([box.delete('/shared/image'), box.delete('/shared/text')]);
  const out = { image: img ? await img.blob() : undefined, text: txt ? await txt.text() : undefined };
  return out.image || out.text ? out : null;
}

// ── reminders ──
type Reminder = { key: string; date: string; title: string; body: string };
const dayBefore = (d: string) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() - 1); return x.toISOString().slice(0, 10); };
const dayLabel = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
function reminders(today: string): Reminder[] {
  return [
    ...listSubs().map((s) => ({ key: `sub:${s.id}:${s.next}`, date: dayBefore(s.next), title: `${s.name} autopay`, body: `${rupees(s.amount)} is due on ${dayLabel(s.next)}` })),
    ...db.debts.filter((d) => !d.paid_at && d.due).map((d) => ({ key: `debt:${d.id}:${d.due}`, date: d.due!, title: `Pay ${d.to}`, body: `${rupees(d.amount)}${d.note ? ` for ${d.note}` : ''} is due today` })),
    ...(toConfirm().length ? [{ key: `confirm:${today}`, date: today, title: 'Did these go through?', body: `${toConfirm().length} payment${toConfirm().length > 1 ? 's' : ''} waiting to be confirmed` }] : []),
    ...listNudges().filter((n) => n.key.startsWith('o:') || n.key.startsWith('b:')).map((n) => ({ key: n.key, date: today, title: 'MyUPI', body: n.text })),
  ];
}
export const remindersOn = () => local('reminders') === '1';
// Hands the worker the current list; called whenever the app goes to the background.
export async function syncReminders(today: string) {
  if (!remindersOn() || !('caches' in window)) return;
  await (await caches.open(BOX)).put('/reminders', new Response(JSON.stringify(reminders(today))));
}
// true, or why it can't: needs notification permission and an installed app (Chrome only wakes installed apps).
export async function enableReminders(today: string): Promise<true | string> {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return "This browser can't show reminders";
  if ((await Notification.requestPermission()) !== 'granted') return 'Allow notifications for MyUPI first';
  const reg = await navigator.serviceWorker.ready;
  const ps = (reg as ServiceWorkerRegistration & { periodicSync?: { register: (tag: string, o: { minInterval: number }) => Promise<void> } }).periodicSync;
  if (!ps) return 'Install MyUPI to your home screen (Chrome on Android), then turn this on';
  try { await ps.register('remind', { minInterval: 12 * 3600e3 }); } catch { return 'Install MyUPI to your home screen first, then turn this on'; }
  localStorage.setItem('reminders', '1');
  await syncReminders(today);
  return true;
}
export function disableReminders() {
  localStorage.removeItem('reminders');
  navigator.serviceWorker?.ready.then((r) => (r as ServiceWorkerRegistration & { periodicSync?: { unregister: (t: string) => Promise<void> } }).periodicSync?.unregister('remind')).catch(() => {});
}

// ── app lock: the phone's fingerprint, face or screen lock, through WebAuthn ──
// ponytail: a privacy screen, not encryption; the data is still in this browser's storage. Encrypt the store if that matters.
const b64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const lockOn = () => !!local('lock_id');
export const lockAvailable = async () =>
  !!window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().catch(() => false));
export async function setupLock(): Promise<boolean> {
  const cred = await navigator.credentials.create({ publicKey: {
    challenge: crypto.getRandomValues(new Uint8Array(32)), rp: { name: 'MyUPI' },
    user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'MyUPI', displayName: 'MyUPI' },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' }, timeout: 60000,
  } }).catch(() => null) as PublicKeyCredential | null;
  if (!cred) return false;
  localStorage.setItem('lock_id', b64(cred.rawId));
  return true;
}
export async function unlock(): Promise<boolean> {
  const id = local('lock_id');
  if (!id) return true;
  const ok = await navigator.credentials.get({ publicKey: {
    challenge: crypto.getRandomValues(new Uint8Array(32)), allowCredentials: [{ type: 'public-key', id: unb64(id) }], userVerification: 'required', timeout: 60000,
  } }).catch(() => null);
  return !!ok;
}
export const removeLock = () => localStorage.removeItem('lock_id');
