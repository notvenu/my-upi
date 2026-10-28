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
export type UpiQr = { vpa: string; name: string; amount?: number; mcc?: string; params: Record<string, string>; raw: string };

export function parseUpiQr(text: string): UpiQr | null {
  const raw = text.trim();
  if (!/^upi:\/\/pay\?/i.test(raw)) return null;
  const params: Record<string, string> = {};
  for (const part of raw.split('?')[1].split('&')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    try { params[part.slice(0, i).toLowerCase()] = decodeURIComponent(part.slice(i + 1).replace(/\+/g, ' ')); }
    catch { params[part.slice(0, i).toLowerCase()] = part.slice(i + 1); }
  }
  if (!params.pa) return null;
  const am = parseFloat(params.am);
  return { vpa: params.pa, name: params.pn || params.pa, amount: am > 0 ? am : undefined, mcc: params.mc, params, raw };
}

// A saved person has no QR; build the plainest one possible.
export function personQr(vpa: string, name: string): UpiQr {
  return { vpa, name, params: { pa: vpa, pn: name }, raw: `upi://pay?pa=${vpa}&pn=${encodeURIComponent(name)}` };
}

export function simplePayUri(vpa: string, name: string, amount: number, note: string): string {
  const tn = note.replace(/[^A-Za-z0-9 ,]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 50);
  return `upi://pay?pa=${vpa}&pn=${encodeURIComponent(name)}&am=${amount.toFixed(2)}&cu=INR${tn ? `&tn=${encodeURIComponent(tn)}` : ''}`;
}

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
export function requestMessage(friend: string, items: RequestItem[], myVpa: string, about?: string, reason?: string): string {
  const total = items.reduce((a, x) => a + x.amount, 0);
  const lines = items.flatMap((x, i) => [
    `${i + 1}. ${whenLabel(x.created_at)}`,
    `   ${x.note || x.payee_name || 'Expense'} — *${rupees(x.amount)}*${x.txn_amount > x.amount ? ` (your share of ${rupees(x.txn_amount)})` : ''}`,
    ...(x.note && x.payee_name ? [`   paid to ${x.payee_name}`] : []),
  ]);
  return [
    `Hi ${friend.split(' ')[0]} 👋`,
    `Here's what's pending from ${about ?? 'our splits'} (${items.length} item${items.length > 1 ? 's' : ''}):`,
    '',
    ...lines,
    '',
    `*Total: ${rupees(total)}*`,
    `Pay to UPI ID: ${myVpa}`,
    `Note for the payment: ${reason ?? requestReason(items.map((x) => x.note || x.payee_name || ''))}`,
  ].join('\n');
}
