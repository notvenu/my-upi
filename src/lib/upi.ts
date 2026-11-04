export const CATEGORIES = [
  'Food', 'Groceries', 'Transport', 'Fuel', 'Shopping', 'Bills',
  'Health', 'Entertainment', 'Travel', 'Rent', 'Transfer', 'Other',
] as const;

// Starting suggestions; users add their own per category (stored in the subcategories table).
export const SUBCATEGORIES: Record<string, string[]> = {
  Food: ['Restaurant', 'Cafe', 'Snacks', 'Delivery', 'Tea'],
  Groceries: ['Veggies', 'Fruits', 'Dairy', 'Kirana', 'Meat'],
  Transport: ['Cab', 'Auto', 'Metro', 'Bus', 'Train', 'Parking'],
  Fuel: ['Petrol', 'Diesel', 'CNG'],
  Shopping: ['Clothes', 'Electronics', 'Online', 'Household', 'Personal care'],
  Bills: ['Electricity', 'Mobile', 'Wifi', 'Gas', 'Water', 'DTH'],
  Health: ['Medicines', 'Doctor', 'Tests', 'Gym'],
  Entertainment: ['Movies', 'Subscriptions', 'Games', 'Events'],
  Travel: ['Flights', 'Hotels', 'Trips'],
  Rent: ['Rent', 'Maintenance', 'Maid'],
  Transfer: ['Family', 'Friends', 'Self'],
  Other: [],
};

// raw = the QR text exactly as scanned.
// note = the QR's own payment note (tn), e.g. "Order 1234".
export type UpiQr = { vpa: string; name: string; amount?: number; mcc?: string; note?: string; params: Record<string, string>; raw: string };

const VPA = /^[\w.\-]+@[\w.\-]+$/;

// Shop QRs come in three shapes: a upi://pay link (also as tez://upi/pay, phonepe://pay, paytmmp://pay or a https link
// carrying pa=), a BharatQR / EMV code ("000201…" with the UPI ID nested inside), or just a bare UPI ID.
export function parseUpiQr(text: string): UpiQr | null {
  const raw = text.trim().replace(/^﻿/, '');
  const q = raw.indexOf('?');
  const params: Record<string, string> = {};
  if (/^[a-z][\w+.-]*:/i.test(raw) && q > 0) {
    for (const part of raw.slice(q + 1).split('&')) {
      const i = part.indexOf('=');
      if (i < 0) continue;
      const k = part.slice(0, i).toLowerCase(), v = part.slice(i + 1).replace(/\+/g, ' ');
      try { params[k] = decodeURIComponent(v); } catch { params[k] = v; }
    }
  } else if (/^0002\d{2}/.test(raw)) Object.assign(params, emvParams(raw));
  else if (VPA.test(raw)) params.pa = raw;
  const vpa = params.pa?.trim();
  if (!vpa || !VPA.test(vpa)) return null;
  const am = parseFloat(params.am);
  const name = params.pn?.trim() || vpa;
  return { vpa, name, amount: am > 0 ? am : undefined, mcc: params.mc, note: params.tn?.trim() || undefined, params: { ...params, pa: vpa }, raw };
}

// EMV TLV: two-digit tag, two-digit length, value. Tags 26–51 hold payment networks; UPI's has the UPI ID as one of its
// own nested values. 52 merchant code, 54 amount, 59 name.
function tlv(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i + 4 <= s.length;) {
    const len = Number(s.slice(i + 2, i + 4));
    if (!Number.isFinite(len)) break;
    out[s.slice(i, i + 2)] = s.slice(i + 4, i + 4 + len);
    i += 4 + len;
  }
  return out;
}
function emvParams(s: string): Record<string, string> {
  const top = tlv(s), p: Record<string, string> = {};
  for (let t = 26; t <= 51; t++) {
    const inner = top[String(t)];
    if (!inner) continue;
    const vpa = Object.values(tlv(inner)).find((v) => VPA.test(v.trim()));
    if (vpa) { p.pa = vpa.trim(); break; }
  }
  if (top['59']) p.pn = top['59'];
  if (top['54']) p.am = top['54'];
  if (top['52'] && top['52'] !== '0000') p.mc = top['52'];
  return p;
}

// A QR's merchant code (MCC) → our category, for a shop you've never paid before.
const MCC: [RegExp, string][] = [
  [/^(5812|5813|5814)$/, 'Food'], [/^(5411|5422|5441|5451|5462|5499)$/, 'Groceries'], [/^(5541|5542|5983)$/, 'Fuel'],
  [/^(4111|4112|4121|4131|4789|7523)$/, 'Transport'], [/^(5122|5912|8011|8021|8031|8042|8043|8049|8062|8071|8099|7997)$/, 'Health'],
  [/^(4814|4816|4899|4900)$/, 'Bills'], [/^(7832|7841|7922|7991|7994|7996|7999|5815|5816|5817|5818)$/, 'Entertainment'],
  [/^(3\d{3}|4411|4511|4722|7011|7012)$/, 'Travel'], [/^(6513)$/, 'Rent'],
  [/^(5[2-9]\d\d)$/, 'Shopping'], // the rest of the 5xxx retail range
];
export const mccCategory = (mcc?: string | null) => (mcc ? MCC.find(([re]) => re.test(mcc))?.[1] ?? null : null);

// A saved person has no QR; build the plainest one possible.
export function personQr(vpa: string, name: string): UpiQr {
  return { vpa, name, params: { pa: vpa, pn: name }, raw: `upi://pay?pa=${vpa}&pn=${encodeURIComponent(name)}` };
}

export function simplePayUri(vpa: string, name: string, amount: number, note: string): string {
  const tn = note.replace(/[^A-Za-z0-9 ,]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 50);
  return `upi://pay?pa=${vpa}&pn=${encodeURIComponent(name)}&am=${amount.toFixed(2)}&cu=INR${tn ? `&tn=${encodeURIComponent(tn)}` : ''}`;
}

// Where "Open {app}" goes: the app's Play Store page, where you tap Open. A website can't start an app's home screen
// directly, and the payment links it can send were declined or showed "invalid QR"; you scan and pay in the app.
export const appPage = (pkg: string) => `https://play.google.com/store/apps/details?id=${pkg}`;

// The note UPI apps show on the payment screen ("tn"): the reasons, squeezed into ~50 chars since apps truncate.
export function requestReason(reasons: string[]): string {
  const uniq = [...new Set(reasons.map((r) => r.trim()).filter(Boolean))];
  const fit = (n: number) => uniq.slice(0, n).join(', ') + (n < uniq.length ? ` +${uniq.length - n}` : '');
  for (let n = uniq.length; n > 0; n--) if (fit(n).length <= 50) return fit(n);
  return uniq.length ? uniq[0].slice(0, 50 - (uniq.length > 1 ? 4 : 0)) + (uniq.length > 1 ? ` +${uniq.length - 1}` : '') : 'Split';
}

// Keystroke filter for ₹ inputs: digits, one '.', two decimals, up to ₹99,99,999.
export function cleanAmount(v: string): string {
  const [int, ...rest] = v.replace(/[^\d.]/g, '').split('.');
  const i = int.replace(/^0+(?=\d)/, '').slice(0, 7);
  return rest.length ? `${i || '0'}.${rest.join('').slice(0, 2)}` : i;
}


export const rupees = (paise: number) =>
  '₹' + (paise / 100).toLocaleString('en-IN', { maximumFractionDigits: paise % 100 ? 2 : 0, minimumFractionDigits: paise % 100 ? 2 : 0 });

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "Sat, 05 Oct 2026 · 8:42 PM" from a local ISO timestamp, without relying on the device's Intl data.
export function whenLabel(iso: string): string {
  const [y, mo, d] = iso.slice(0, 10).split('-').map(Number);
  const [h, mi] = iso.slice(11, 16).split(':').map(Number);
  const wd = DAYS[new Date(y, mo - 1, d).getDay()];
  return `${wd}, ${String(d).padStart(2, '0')} ${MONS[mo - 1]} ${y} · ${h % 12 || 12}:${String(mi).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

export type RequestItem = { created_at: string; note: string | null; payee_name: string | null; amount: number; txn_amount: number };

// `about` names what the request covers ("our Goa trip splits"); without it, all pending splits.
// `reason` overrides the payment note (a trip's name reads better than a list of shops).
// adjust: their previous balance and what they've already paid in part, when asking for everything
export function requestMessage(friend: string, items: RequestItem[], myVpa: string, about?: string, reason?: string,
  adjust: { opening: number; paid: number } = { opening: 0, paid: 0 }): string {
  const total = items.reduce((a, x) => a + x.amount, 0) + adjust.opening - adjust.paid;
  const lines = items.flatMap((x, i) => [
    `${i + 1}. ${whenLabel(x.created_at)}`,
    `   ${x.note || x.payee_name || 'Expense'} — *${rupees(x.amount)}*${x.txn_amount > x.amount ? ` (your share of ${rupees(x.txn_amount)})` : ''}`,
    ...(x.note && x.payee_name ? [`   paid to ${x.payee_name}`] : []),
  ]);
  const extra = [
    ...(adjust.opening ? [`Previous balance — *${rupees(adjust.opening)}*`] : []),
    ...(adjust.paid ? [`Already paid — *−${rupees(adjust.paid)}*`] : []),
  ];
  return [
    `Hi ${friend.split(' ')[0]} 👋`,
    items.length ? `Here's what's pending from ${about ?? 'our splits'} (${items.length} item${items.length > 1 ? 's' : ''}):` : "Here's what's pending:",
    '',
    ...lines,
    ...(extra.length ? [...(lines.length ? [''] : []), ...extra] : []),
    '',
    `*Total: ${rupees(total)}*`,
    `Pay to UPI ID: ${myVpa}`,
    `Note for the payment: ${reason ?? requestReason(items.map((x) => x.note || x.payee_name || ''))}`,
  ].join('\n');
}
