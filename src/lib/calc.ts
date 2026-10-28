// Pure money maths for item splits and autopays; checked by check.ts.

export const ME = 0; // stands for you in an item's "who" (people ids start at 1)

// Splitting a bill item by item: each item divides equally among the people it's for (none listed = everyone),
// anything not itemised divides among everyone. Returns each other person's share in paise (rounded down); you pay the rest.
export function itemShares(total: number, people: number[], items: { amount: number; who: number[] }[]): Map<number, number> {
  const owe = new Map(people.map((id) => [id, 0]));
  const portion = (who: number[], amount: number) => {
    const ids = who.length ? who.filter((id) => id === ME || owe.has(id)) : [ME, ...people];
    for (const id of ids) if (id !== ME) owe.set(id, owe.get(id)! + amount / ids.length);
  };
  for (const it of items) portion(it.who, it.amount);
  portion([ME, ...people], Math.max(0, total - items.reduce((a, it) => a + it.amount, 0)));
  return new Map([...owe].map(([id, v]) => [id, Math.floor(v)]));
}

export type Every = 'week' | 'month' | 'year';
const pad = (n: number) => String(n).padStart(2, '0');

// The charge after `date` (YYYY-MM-DD) for something billed every week / month / year on `day` of the month;
// short months clamp (31st → 30 Nov, 28/29 Feb) without drifting the following months.
export function nextDue(date: string, every: Every, day: number): string {
  const [y, m, d] = date.split('-').map(Number);
  if (every === 'week') {
    const t = new Date(Date.UTC(y, m - 1, d + 7));
    return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
  }
  const idx = m - 1 + (every === 'month' ? 1 : 12);
  const ny = y + Math.floor(idx / 12), nm = idx % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${pad(nm + 1)}-${pad(Math.min(day, last))}`;
}

export const perMonth = (amount: number, every: Every) => (every === 'week' ? (amount * 52) / 12 : every === 'year' ? amount / 12 : amount);

// What banks write on mandate / autopay debits.
export const MANDATE_RE = /\b(nach|ach|ecs|mandate|autopay|auto pay|standing instruction)\b/i;

export type Seen = { key: string; name: string; amount: number; date: string; category: string; note: string };
export type Recurring = { key: string; name: string; amount: number; last: string; category: string };

// Looks like a subscription: paid once a month for about the same amount (within 10%) in 2+ months, still going
// (last one within 40 days), or anything the bank calls a mandate / autopay.
// ponytail: monthly only; weekly/yearly autopays are added by hand
export function findRecurring(txns: Seen[], today: string): Recurring[] {
  const by = new Map<string, Seen[]>();
  for (const t of txns) by.set(t.key, [...(by.get(t.key) ?? []), t]);
  const recent = (d: string) => (Date.parse(today) - Date.parse(d)) / 864e5 <= 40;
  const out: Recurring[] = [];
  for (const [key, list] of by) {
    list.sort((a, b) => a.date.localeCompare(b.date));
    const last = list[list.length - 1];
    const similar = list.filter((t) => Math.abs(t.amount - last.amount) <= last.amount * 0.1);
    const months = new Set(similar.map((t) => t.date.slice(0, 7)));
    const monthly = months.size >= 2 && similar.length === months.size; // once a month, not a daily tea stall
    if (recent(last.date) && (monthly || MANDATE_RE.test(last.note))) out.push({ key, name: last.name, amount: last.amount, last: last.date, category: last.category });
  }
  return out;
}

export type Owing = { id: number; name: string; vpa: string | null; unpaid: { id: number; amount: number; month: string }[] };

// Money a friend sent back, read from a bank statement: a credit that names them (their UPI ID, or their first name
// in the narration) and equals everything they owe, one month's total (oldest first), or a single split.
// Returns the split ids that are now paid. Anything else stays unpaid and carries into the next month.
export function settleFromCredits(credits: { amount: number; desc: string; vpa?: string }[], people: Owing[]): number[] {
  const done = new Set<number>();
  const total = (xs: { amount: number }[]) => xs.reduce((a, s) => a + s.amount, 0);
  for (const c of credits) {
    const p = people.find((p) => {
      const first = p.name.trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, '');
      return (p.vpa && c.vpa?.toLowerCase() === p.vpa.toLowerCase()) || (first.length >= 3 && new RegExp(`\\b${first}\\b`, 'i').test(c.desc));
    });
    if (!p) continue;
    const open = p.unpaid.filter((s) => !done.has(s.id));
    const months = [...new Set(open.map((s) => s.month))].sort();
    const pick = total(open) === c.amount ? open
      : months.map((m) => open.filter((s) => s.month === m)).find((xs) => total(xs) === c.amount)
        ?? open.filter((s) => s.amount === c.amount).slice(0, 1);
    for (const s of pick) done.add(s.id);
  }
  return [...done];
}
