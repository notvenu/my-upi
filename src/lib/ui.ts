import {
  Circle, Coffee, Droplet, FileText, Film, Heart, House, Map, Navigation, Repeat, ShoppingBag, ShoppingCart,
  type LucideIcon,
} from 'lucide-react';
import { getSetting, methodOf, setSetting, type Txn } from './db';
import { emit } from './store';

// Each category: an icon and an iOS system colour as [increased-contrast light, dark-mode variant].
// The icon square always uses the deep one so the white glyph clears 3:1; bars and text pick per theme.
const CATS: Record<string, { icon: LucideIcon; hue: [string, string] }> = {
  Food: { icon: Coffee, hue: ['#C93400', '#FF9F0A'] },
  Groceries: { icon: ShoppingCart, hue: ['#248A3D', '#30D158'] },
  Transport: { icon: Navigation, hue: ['#0040DD', '#0A84FF'] },
  Fuel: { icon: Droplet, hue: ['#7F6545', '#AC8E68'] },
  Shopping: { icon: ShoppingBag, hue: ['#D30F45', '#FF375F'] },
  Bills: { icon: FileText, hue: ['#8944AB', '#BF5AF2'] },
  Health: { icon: Heart, hue: ['#D70015', '#FF453A'] },
  Entertainment: { icon: Film, hue: ['#3634A3', '#5E5CE6'] },
  Travel: { icon: Map, hue: ['#0071A4', '#64D2FF'] },
  Rent: { icon: House, hue: ['#0C817B', '#40C8E0'] },
  Transfer: { icon: Repeat, hue: ['#6C6C70', '#98989D'] },
  Other: { icon: Circle, hue: ['#636366', '#8E8E93'] },
};
export const catIcon = (cat: string) => (CATS[cat] ?? CATS.Other).icon;
export const catSolid = (cat: string) => (CATS[cat] ?? CATS.Other).hue[0];
// CSS light-dark() picks the right hue per theme, no JS theme state needed.
export const catHue = (cat: string) => { const [l, d] = (CATS[cat] ?? CATS.Other).hue; return `light-dark(${l}, ${d})`; };

// How many sheets are open: the page behind recedes like an iOS card stack, and shortcuts pause.
export const chrome = { sheets: 0 };
export const addSheet = (n: 1 | -1) => { chrome.sheets += n; emit(); };

// ── dates ──
const pad2 = (n: number) => String(n).padStart(2, '0');
export const ym = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
export const ymd = (d: Date) => `${ym(d)}-${pad2(d.getDate())}`;
export const monthName = (key: string) => new Date(key + '-01T00:00:00').toLocaleString('en-IN', { month: 'long', year: 'numeric' });
export const longDate = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
export const shortDate = (iso: string) => new Date(iso.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
export const ddmon = (iso: string) => new Date(iso.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
export const time12 = (iso: string) => { const [h, m] = iso.slice(11, 16).split(':').map(Number); return `${h % 12 || 12}:${pad2(m)} ${h < 12 ? 'AM' : 'PM'}`; };
export const spentOf = (list: Txn[]) => list.filter((t) => t.direction === 'debit' && t.status !== 'FAILURE').reduce((a, t) => a + t.amount, 0);
export const statusWord = (st: string) => (st === 'SUCCESS' ? '' : st === 'FAILURE' ? "Didn't pay" : 'Unconfirmed');
export const toPaise = (v: string) => Math.round(parseFloat(v || '0') * 100) || 0;
// How it was paid, for lists: the UPI app's name when known.
export function methodLabel(t: Txn): string {
  const m = methodOf(t);
  const how = m === 'upi' ? t.app || 'UPI' : m === 'cash' ? 'Cash' : m === 'card' ? 'Card' : m === 'bank' ? 'Bank' : '';
  return t.sub_id ? `Autopay${how ? ` · ${how}` : ''}` : how;
}

export const VPA_RE = /^[\w.\-]+@[\w]+$/;
export const vpaError = (v: string) => (v.trim() && !VPA_RE.test(v.trim()) ? 'Use name@bank, like rahul@okaxis' : undefined);
export const phoneError = (v: string) => (v.trim() && v.replace(/\D/g, '').length < 10 ? 'Enter a 10-digit number' : undefined);

// ── feedback ──
export const haptic = (ms = 8) => { try { navigator.vibrate?.(ms); } catch {} };
export const toastState = { msg: '', n: 0 };
export function toast(msg: string) { haptic(15); toastState.msg = msg; toastState.n++; emit(); }

// ── Android back button ──
// Every sheet / page pushes a history entry; Back closes the topmost one instead of leaving the app.
// Releases are batched to a microtask so a sheet replacing another (close one, open the next) reuses the
// entry instead of racing an async history.back() against pushState.
const layers: (() => void)[] = [];
let skip = 0, freed = 0;
addEventListener('popstate', () => { if (skip) { skip--; return; } layers.pop()?.(); });
const flush = () => { if (!freed) return; skip++; history.go(-freed); freed = 0; };
export function pushLayer(close: () => void) {
  if (freed) freed--; // reuse an entry released in this same tick
  else history.pushState({ layer: layers.length + 1 }, '');
  layers.push(close);
  return () => {
    const i = layers.indexOf(close);
    if (i < 0) return; // already closed by Back
    layers.splice(i, 1);
    if (!freed++) queueMicrotask(flush);
  };
}

// ── confirm dialog (replaces Alert.alert) ──
export const askState: { q: null | { title: string; text: string; ok: string; danger?: boolean; resolve: (v: boolean) => void } } = { q: null };
export const ask = (title: string, text: string, ok = 'OK', danger = false) =>
  new Promise<boolean>((resolve) => { askState.q = { title, text, ok, danger, resolve }; emit(); });
export function answer(v: boolean) { askState.q?.resolve(v); askState.q = null; emit(); }

// ── bill photos: downscaled JPEGs in IndexedDB, referenced as "idb:<key>" ──
const idb = () => new Promise<IDBDatabase>((res, rej) => {
  const r = indexedDB.open('myupi-bills', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('bills');
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
async function billStore<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) {
  const s = (await idb()).transaction('bills', mode).objectStore('bills');
  return new Promise<T>((res, rej) => { const r = fn(s); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
export async function saveBill(file: File): Promise<string> {
  const img = await createImageBitmap(file);
  const k = Math.min(1, 1400 / Math.max(img.width, img.height));
  const c = new OffscreenCanvas(Math.round(img.width * k), Math.round(img.height * k));
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  const blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.7 });
  const key = `bill-${Date.now()}`;
  await billStore('readwrite', (s) => s.put(blob, key));
  return `idb:${key}`;
}
export async function billUrl(uri: string): Promise<string | null> {
  const blob = await billStore<Blob | undefined>('readonly', (s) => s.get(uri.slice(4))).catch(() => undefined);
  return blob ? URL.createObjectURL(blob) : null;
}
export function removeBill(uri: string | null | undefined) {
  if (uri?.startsWith('idb:')) billStore('readwrite', (s) => s.delete(uri.slice(4))).catch(() => {});
}

// ── where am I ──
// Coordinates from the browser; the name from OpenStreetMap, only when the user has granted location.
export async function currentPlace(): Promise<{ place: string; lat: number; lng: number } | null> {
  const pos = await new Promise<GeolocationPosition>((res, rej) =>
    navigator.geolocation.getCurrentPosition(res, rej, { maximumAge: 120_000, timeout: 10_000 }));
  const { latitude: lat, longitude: lng } = pos.coords;
  let place = '';
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&lat=${lat}&lon=${lng}`);
    const a = (await r.json()).address ?? {};
    place = [a.amenity ?? a.shop ?? a.road, a.suburb ?? a.neighbourhood, a.city ?? a.town ?? a.village]
      .filter(Boolean).filter((v: string, i: number, arr: string[]) => arr.indexOf(v) === i).join(', ');
  } catch {}
  return { place, lat, lng };
}
export const locationGranted = async () =>
  (await navigator.permissions?.query({ name: 'geolocation' }).catch(() => null))?.state === 'granted';

// ── UPI apps ──
export type UpiApp = { pkg: string; label: string };
// ponytail: fixed list of common UPI apps; add an entry for any other app you pay with
export const UPI_APPS: UpiApp[] = [
  { pkg: 'com.phonepe.app', label: 'PhonePe' },
  { pkg: 'money.super.payments', label: 'super.money' },
  { pkg: 'com.google.android.apps.nbu.paisa.user', label: 'Google Pay' },
  { pkg: 'net.one97.paytm', label: 'Paytm' },
  { pkg: 'in.org.npci.upiapp', label: 'BHIM' },
  { pkg: 'com.sbi.upi', label: 'BHIM SBI Pay' },
];
export const preferredApp = () => UPI_APPS.find((a) => a.pkg === getSetting('upi_app')) ?? UPI_APPS[0];
export const setPreferredApp = (pkg: string) => setSetting('upi_app', pkg);

// Only Chrome on Android can open another app by its package; on a laptop or iPhone you pay on the phone and record it here.
export const canOpenApps = /Android/i.test(navigator.userAgent);
// Opens the app like tapping its icon: no payment is started.
export function openUpiApp(pkg: string) {
  location.href = `intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=${pkg};end`;
}

// Share sheet on phones; copies to the clipboard where there is none (most laptops). False if cancelled.
export async function shareText(text: string, url?: string): Promise<'shared' | 'copied' | false> {
  if (navigator.share) {
    try { await navigator.share(url ? { text, url } : { text }); return 'shared'; } catch { return false; }
  }
  await navigator.clipboard.writeText(url ? `${text}\n${url}` : text);
  return 'copied';
}

export function download(name: string, text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

// The entry whose UPI app we just opened, so coming back can ask "did you pay?" right away.
// Stored, because Android often discards the tab while the UPI app is in front.
export const markOpened = (id: number) => localStorage.setItem('opened', JSON.stringify({ id, at: Date.now() }));
export function takeJustReturned(): number | null {
  const o = JSON.parse(localStorage.getItem('opened') ?? 'null') as { id: number; at: number } | null;
  if (!o || Date.now() - o.at < 3000) return null; // still switching apps
  localStorage.removeItem('opened');
  return Date.now() - o.at < 30 * 60e3 ? o.id : null;
}
