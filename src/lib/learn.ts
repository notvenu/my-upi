import type { Txn } from './db';
import { genericName, mccCategory } from './upi.ts'; // .ts so the node checks can run it too

// What MyUPI has learned from your own entries: who you pay, how often, how much, and what for. No server, no model
// file: it's recounted from history on every call, so fixing an old entry's category teaches it straight away.
// ponytail: recounts every entry per call; fine for thousands of rows, memoise on the store's version if it gets slow.
export type Seen = Pick<Txn, 'payee_vpa' | 'payee_name' | 'category' | 'subcategory' | 'note' | 'amount' | 'direction' | 'status' | 'created_at' | 'method' | 'place'>;

export type Payee = {
  key: string; name: string; named: boolean; vpa: string | null; count: number; last: string; amount: number; typical: number;
  category: string; subcategory: string | null; note: string | null; method: Txn['method'] | null; place: string | null; score: number;
};
export type Guess = { category: string; subcategory: string | null; note: string | null; payee?: Payee; from: 'history' | 'similar' | 'keyword' | 'mcc' };

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();
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
  // a payment still waiting for its amount (₹0) says nothing yet; a generic name without a UPI ID isn't anyone
  const paid = txns.filter((t) => t.direction === 'debit' && t.status !== 'FAILURE' && t.amount > 0 && (t.payee_vpa || !genericName(t.payee_name)))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const byName = new Map<string, string>(); // name → the UPI ID key it was seen with
  for (const t of paid) if (t.payee_vpa && !genericName(t.payee_name, t.payee_vpa)) byName.set(norm(t.payee_name), norm(t.payee_vpa));
  const groups = new Map<string, Seen[]>();
  for (const t of paid) {
    const key = t.payee_vpa ? norm(t.payee_vpa) : byName.get(norm(t.payee_name)) ?? 'n:' + norm(t.payee_name);
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  return [...groups].map(([key, list]): Payee => {
    const cat = vote(list, (t) => (t.category === 'Other' ? null : t.category)).top ?? 'Other';
    const note = vote(list, (t) => t.note);
    return {
      // the newest real name you gave them beats the QR's "PhonePeMerchant"
      key, name: list.find((t) => !genericName(t.payee_name, t.payee_vpa))?.payee_name ?? list.find((t) => t.payee_name)?.payee_name ?? list[0].payee_vpa!,
      named: list.some((t) => !genericName(t.payee_name, t.payee_vpa)), vpa: list.find((t) => t.payee_vpa)?.payee_vpa ?? null,
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
  const vpa = norm(p.vpa), name = genericName(p.name, p.vpa) ? '' : norm(p.name);
  const known = all.find((x) => (vpa && norm(x.vpa) === vpa) || (name && norm(x.name) === name));
  if (known && (known.category !== 'Other' || known.note)) return { category: known.category, subcategory: known.subcategory, note: known.note, payee: known, from: 'history' };
  const mine = words(`${name} ${vpa.split('@')[0]}`);
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

// ── budgets ──
// Spending that counts toward a month: paid out, not failed, with an amount.
const spent = (t: Seen) => t.direction === 'debit' && t.status !== 'FAILURE' && t.amount > 0;
const ymOf = (iso: string) => iso.slice(0, 7);
const prevMonths = (today: string, n: number) => Array.from({ length: n }, (_, i) => {
  const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - i - 1);
  return d.toISOString().slice(0, 7);
});
export function byCategory(txns: Seen[], ym: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of txns) if (spent(t) && ymOf(t.created_at) === ym) out[t.category] = (out[t.category] ?? 0) + t.amount;
  return out;
}
// A category's usual month: the median of the last three full months (a month without it counts as ₹0).
function usual(txns: Seen[], today: string): Record<string, number> {
  const months = prevMonths(today, 3).map((m) => byCategory(txns, m));
  const cats = new Set(months.flatMap((m) => Object.keys(m)));
  return Object.fromEntries([...cats].map((c) => [c, median(months.map((m) => m[c] ?? 0))]));
}
// Suggested limits: your usual month per category, rounded up to ₹100. Categories you rarely use are left out.
export function suggestBudgets(txns: Seen[], today: string): Record<string, number> {
  return Object.fromEntries(Object.entries(usual(txns, today)).filter(([, v]) => v >= 300_00).map(([c, v]) => [c, Math.ceil(v / 100_00) * 100_00]));
}
// Left this month across your budgeted categories, and what that allows per day (whole rupees) including today.
export function safeToSpend(budgets: Record<string, number>, txns: Seen[], today: string) {
  const cats = Object.keys(budgets).filter((c) => budgets[c] > 0);
  const now = byCategory(txns, ymOf(today));
  const limit = cats.reduce((a, c) => a + budgets[c], 0), used = cats.reduce((a, c) => a + (now[c] ?? 0), 0);
  const [y, m, d] = today.split('-').map(Number);
  const daysLeft = new Date(Date.UTC(y, m, 0)).getUTCDate() - d + 1;
  return { limit, spent: used, left: limit - used, perDay: Math.max(0, Math.floor((limit - used) / daysLeft / 100) * 100), daysLeft, cats: cats.map((c) => ({ category: c, limit: budgets[c], spent: now[c] ?? 0 })) };
}

// ── things worth pointing out ──
export type Nudge = { key: string; text: string; warn: boolean };
const r = (p: number) => '₹' + Math.round(p / 100).toLocaleString('en-IN');
export function nudges(txns: Seen[], today: string, budgets: Record<string, number> = {}): Nudge[] {
  const out: Nudge[] = [];
  const ym = ymOf(today), day = +today.slice(8, 10);
  const all = payees(txns, today);
  const list = txns.filter(spent).sort((a, b) => b.created_at.localeCompare(a.created_at));
  // over a budget, or close to it
  for (const c of safeToSpend(budgets, txns, today).cats) {
    if (c.spent >= c.limit) out.push({ key: `b:${ym}:${c.category}:over`, warn: true, text: `${c.category} is over budget: ${r(c.spent)} of ${r(c.limit)}` });
    else if (c.spent >= c.limit * 0.9) out.push({ key: `b:${ym}:${c.category}`, warn: true, text: `${c.category} has ${r(c.limit - c.spent)} left of ${r(c.limit)} this month` });
  }
  // a payment far above what you usually pay them (last 7 days)
  for (const p of all) {
    if (p.count < 4) continue;
    const mine = list.filter((t) => (p.vpa ? norm(t.payee_vpa) === norm(p.vpa) : norm(t.payee_name) === norm(p.name)));
    const before = median(mine.slice(1).map((t) => t.amount)), t = mine[0];
    if (t && days(t.created_at, today) <= 7 && t.amount >= before * 3 && t.amount - before >= 200_00)
      out.push({ key: `u:${t.created_at}:${p.key}`, warn: true, text: `${r(t.amount)} to ${p.name} is unusual. You normally pay ${r(before)}` });
    // a fixed amount that changed: a subscription or a regular bill that went up (or down)
    const [last, ...prev] = mine.map((x) => x.amount);
    if (prev.length >= 3 && prev.slice(0, 3).every((a) => a === prev[0]) && last !== prev[0] && days(mine[0].created_at, today) <= 45)
      out.push({ key: `p:${p.key}:${last}`, warn: last > prev[0], text: `${p.name} went from ${r(prev[0])} to ${r(last)}` });
  }
  // a category running well ahead of its usual month (from day 7 on, so one big shop on the 1st doesn't shout)
  if (day >= 7) {
    const u = usual(txns, today), now = byCategory(txns, ym);
    const len = new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7), 0)).getUTCDate();
    for (const [c, v] of Object.entries(now)) {
      if (budgets[c] || (u[c] ?? 0) < 500_00) continue; // budgeted ones are covered above
      const pace = Math.round((v / day) * len);
      if (v > u[c]) out.push({ key: `c:${ym}:${c}:over`, warn: true, text: `${c}: ${r(v)} already, more than your usual ${r(u[c])} a month` });
      else if (pace > u[c] * 1.3) out.push({ key: `c:${ym}:${c}`, warn: false, text: `${c} is on pace for ${r(pace)} this month, usually ${r(u[c])}` });
    }
  }
  return out;
}

// ── one-line quick add, on this device: "120 chai split rahul", "uber 250 cash", "1.2k dinner with priya ravi" ──
export type Quick = { amount: number; payee: string; note: string; method: 'upi' | 'cash' | 'card' | 'bank' | null; people: number[] };
export function parseQuick(text: string, people: { id: number; name: string }[], known: { name: string }[]): Quick | null {
  let amount = 0, method: Quick['method'] = null, splitting = false;
  const ids: number[] = [], rest: string[] = [];
  for (const tok of text.trim().split(/\s+/)) {
    const w = tok.toLowerCase().replace(/[,.]$/, '');
    const num = w.replace(/^(₹|rs\.?|inr)/, '').match(/^(\d+(?:\.\d{1,2})?)(k)?$/);
    if (!amount && num) { amount = Math.round(parseFloat(num[1]) * (num[2] ? 1000 : 1) * 100); continue; }
    if (/^(cash|card|upi|bank)$/.test(w)) { method = w as Quick['method']; continue; }
    if (/^(split|with|between|and|&)$/.test(w)) { splitting = splitting || w !== 'and'; continue; }
    const who = splitting && w.length >= 2 ? people.find((p) => p.name.toLowerCase().split(/\s+/).some((n) => n.startsWith(w))) : undefined;
    if (who) { if (!ids.includes(who.id)) ids.push(who.id); continue; }
    rest.push(tok);
  }
  if (!amount) return null;
  const words = rest.join(' ').trim(), lw = words.toLowerCase();
  // a payee you've paid before, named anywhere in the words; what's left is the reason
  const hit = lw ? known.find((k) => { const n = k.name.toLowerCase(); return n === lw || (lw.length >= 3 && (n.startsWith(lw) || lw.includes(n))); }) : undefined;
  if (hit) {
    const at = lw.indexOf(hit.name.toLowerCase());
    const note = at < 0 ? '' : (words.slice(0, at) + words.slice(at + hit.name.length)).replace(/\s+/g, ' ').trim();
    return { amount, payee: hit.name, note, method, people: ids };
  }
  return { amount, payee: words.replace(/\b\w/g, (c) => c.toUpperCase()), note: '', method, people: ids };
}
