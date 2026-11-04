import type { Txn } from './db';
import { mccCategory } from './upi.ts'; // .ts so the node checks can run it too

// What MyUPI has learned from your own entries: who you pay, how often, how much, and what for. No server, no model
// file: it's recounted from history on every call, so fixing an old entry's category teaches it straight away.
// ponytail: recounts every entry per call; fine for thousands of rows, memoise on the store's version if it gets slow.
export type Seen = Pick<Txn, 'payee_vpa' | 'payee_name' | 'category' | 'subcategory' | 'note' | 'amount' | 'direction' | 'status' | 'created_at' | 'method' | 'place'>;

export type Payee = {
  key: string; name: string; vpa: string | null; count: number; last: string; amount: number; typical: number;
  category: string; subcategory: string | null; note: string | null; method: Txn['method'] | null; place: string | null; score: number;
};
export type Guess = { category: string; subcategory: string | null; note: string | null; payee?: Payee; from: 'history' | 'similar' | 'keyword' | 'mcc' };

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();
const GENERIC = new Set(['', 'payment', 'upi', 'expense']);
const days = (from: string, to: string) => Math.max(0, (Date.parse(to.slice(0, 10)) - Date.parse(from.slice(0, 10))) / 864e5);

// Recency-weighted vote over a payee's entries (newest first): each counts half as much per 60 days older than
// their latest, so a habit that changed wins after a payment or two.
function vote<V>(list: Seen[], pick: (t: Seen) => V | null | undefined): { top: V | null; share: number } {
  const w = new Map<V, number>();
  let all = 0;
  for (const t of list) {
    const x = 0.5 ** (days(t.created_at, list[0].created_at) / 60), v = pick(t);
    all += x;
    if (v != null && v !== '') w.set(v, (w.get(v) ?? 0) + x);
  }
  let top: V | null = null, best = 0;
  for (const [v, x] of w) if (x > best) { top = v; best = x; }
  return { top, share: all ? best / all : 0 };
}

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : 0; };

// Everyone you've paid, grouped by UPI ID (a typed-in name joins the UPI ID that carries the same name),
// most-used-lately first: count, each payment fading by half every 30 days.
export function payees(txns: Seen[], today: string): Payee[] {
  const paid = txns.filter((t) => t.direction === 'debit' && t.status !== 'FAILURE' && !GENERIC.has(norm(t.payee_name || t.payee_vpa)))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const byName = new Map<string, string>(); // name → the UPI ID key it was seen with
  for (const t of paid) if (t.payee_vpa && t.payee_name) byName.set(norm(t.payee_name), norm(t.payee_vpa));
  const groups = new Map<string, Seen[]>();
  for (const t of paid) {
    const key = t.payee_vpa ? norm(t.payee_vpa) : byName.get(norm(t.payee_name)) ?? 'n:' + norm(t.payee_name);
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  return [...groups].map(([key, list]): Payee => {
    const cat = vote(list, (t) => (t.category === 'Other' ? null : t.category)).top ?? 'Other';
    const note = vote(list, (t) => t.note);
    return {
      key, name: list.find((t) => t.payee_name)?.payee_name ?? list[0].payee_vpa!, vpa: list.find((t) => t.payee_vpa)?.payee_vpa ?? null,
      count: list.length, last: list[0].created_at, amount: list[0].amount, typical: median(list.map((t) => t.amount)),
      category: cat, subcategory: vote(list.filter((t) => t.category === cat), (t) => t.subcategory).top,
      note: note.share >= 0.4 ? note.top : null, // only a note you actually repeat
      method: vote(list, (t) => t.method).top, place: vote(list, (t) => t.place).top,
      score: list.reduce((a, t) => a + 0.5 ** (days(t.created_at, today) / 30), 0),
    };
  }).sort((a, b) => b.score - a.score);
}

// Names everyone recognises. Your own history always wins over this list.
const KEYWORDS: [RegExp, string][] = [
  [/\b(?:swiggy|zomato|eatsure|domino|pizza|kfc|mcdonald|burger|biryani|restaurant|hotel|cafe|coffee|bakery|sweets|dhaba|chai|tea)/, 'Food'],
  [/\b(?:blinkit|zepto|instamart|bigbasket|dmart|d mart|jiomart|kirana|grocer|supermarket|vegetable|fruits|dairy|milk|provision)/, 'Groceries'],
  [/\b(?:uber|ola|rapido|metro|irctc|redbus|parking|fastag|auto|cab|taxi)/, 'Transport'],
  [/\b(?:petrol|fuel|diesel|cng|indian ?oil|iocl|bharat ?petroleum|bpcl|hpcl|hp ?pay|shell)/, 'Fuel'],
  [/\b(?:amazon|flipkart|myntra|ajio|meesho|nykaa|croma|reliance ?digital|decathlon|mall|fashion|garments|textiles|footwear)/, 'Shopping'],
  [/\b(?:airtel|jio|vodafone|\bvi\b|bsnl|electricity|bescom|tneb|msedcl|power|broadband|act fibernet|gas|water|dth|tata ?play|recharge)/, 'Bills'],
  [/\b(?:pharma|medical|chemist|apollo|medplus|1mg|netmeds|hospital|clinic|diagnostic|lab|dental|doctor|gym|cult)/, 'Health'],
  [/\b(?:netflix|hotstar|prime ?video|spotify|bookmyshow|pvr|inox|cinema|steam|playstation|youtube)/, 'Entertainment'],
  [/\b(?:makemytrip|goibibo|cleartrip|ixigo|indigo|air ?india|vistara|akasa|oyo|airbnb|booking\.com)/, 'Travel'],
  [/\b(?:rent|maintenance|society|nobroker)/, 'Rent'],
];
const STOP = new Set(['the', 'and', 'pvt', 'ltd', 'private', 'limited', 'store', 'stores', 'shop', 'enterprises', 'traders', 'services', 'india', 'mart', 'new', 'sri', 'shree', 'shri', 'payment', 'bank', 'okaxis', 'oksbi', 'okhdfcbank', 'okicici', 'ybl', 'paytm', 'ibl', 'axl']);
const words = (s: string) => norm(s).split(/[^a-z]+/).filter((w) => w.length >= 3 && !STOP.has(w));

// Best guess for a payment, from the most to the least personal evidence:
// this payee before → payees with a shared word in their name ("Sharma Medical" ↔ "Gupta Medical") → well-known names → the QR's merchant code.
export function guess(txns: Seen[], today: string, p: { vpa?: string | null; name?: string | null; mcc?: string | null }): Guess | null {
  const all = payees(txns, today);
  const vpa = norm(p.vpa), name = norm(p.name);
  const known = all.find((x) => (vpa && norm(x.vpa) === vpa) || (name && norm(x.name) === name));
  if (known && (known.category !== 'Other' || known.note)) return { category: known.category, subcategory: known.subcategory, note: known.note, payee: known, from: 'history' };
  const mine = words(`${p.name ?? ''} ${(p.vpa ?? '').split('@')[0]}`);
  if (mine.length) {
    const votes = new Map<string, number>();
    for (const x of all) {
      if (x.category === 'Other' || x === known) continue;
      const hit = words(`${x.name} ${(x.vpa ?? '').split('@')[0]}`).filter((w) => mine.includes(w)).length;
      if (hit) votes.set(x.category, (votes.get(x.category) ?? 0) + hit * x.count);
    }
    const top = [...votes].sort((a, b) => b[1] - a[1])[0];
    if (top) return { category: top[0], subcategory: null, note: null, payee: known, from: 'similar' };
  }
  const text = `${name} ${vpa}`;
  const kw = KEYWORDS.find(([re]) => re.test(text));
  if (kw) return { category: kw[1], subcategory: null, note: null, payee: known, from: 'keyword' };
  const m = mccCategory(p.mcc);
  if (m) return { category: m, subcategory: null, note: null, payee: known, from: 'mcc' };
  return known ? { category: 'Other', subcategory: null, note: null, payee: known, from: 'history' } : null;
}
