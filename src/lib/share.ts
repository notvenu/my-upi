// What a public split link shows, built from your data on your device and stored as one snapshot (so the link
// never exposes anything else). Pure; checked by check.ts.
import type { Item, Split, Txn } from './db';
// ponytail: history is every split ever in the snapshot; trim to recent months if links get heavy

export type SharedLine = { date: string; what: string; total: number; each: number; count: number; paidBy: number[] };
export type OwnLine = { date: string; what: string; amount: number; paid: boolean };
// One payment someone was in, in full: what it was, the bill, their share, who else was in it, and the items (who had each).
export type HistoryLine = {
  date: string; what: string; payee: string | null; category: string; place: string | null; trip: string | null;
  total: number; share: number; paid: boolean; with: string[]; items: { name: string; amount: number; who: string[] }[];
};
// A room link's month-by-month sheet for one person, like a roommates' spreadsheet: that month's items (their share),
// the total, what was carried in from before, what they paid (amounts are positive; shown as minus), and the balance carried on.
export type LedgerLine = { date: string; what: string; amount: number };
export type LedgerMonth = { month: string; items: LedgerLine[]; total: number; old: number; paid: LedgerLine[]; balance: number };
export type SharePerson = {
  id: number; name: string; due: number; paid: number; carried: { month: string; amount: number }[]; own: OwnLine[];
  history?: HistoryLine[]; // trip links: newest first. Older room-link snapshots have it too.
  ledger?: LedgerMonth[]; // room links: oldest month first, ending with this month
  // room links: their previous balance, what they've paid in part, and what's owed back to them (all in due)
  opening?: number; partPaid?: number; oweBack?: number;
};
export type ShareView = {
  title: string; from: { name: string; vpa: string }; updated: string;
  month: string | null; trip: string | null; // a room link covers the current month (plus anything unpaid before it); a trip link the whole trip
  shared: SharedLine[]; people: SharePerson[];
};

type Data = { txns: Txn[]; splits: Split[]; people: { id: number; name: string; opening?: number; credit?: number; owe?: number }[] };
type LedgerPerson = Data['people'][number];

const whatOf = (t: Txn) => t.note || t.payee_name || t.subcategory || t.category;

export function buildShare(
  def: { title: string; personIds: number[]; trip: string | null }, d: Data, me: { name: string; vpa: string }, now: string,
): ShareView {
  const people = d.people.filter((p) => def.personIds.includes(p.id));
  const P = new Set(people.map((p) => p.id));
  const month = def.trip ? null : now.slice(0, 7);
  const txnById = new Map(d.txns.filter((t) => t.status !== 'FAILURE').map((t) => [t.id, t]));
  const inPeriod = (t: Txn) => (def.trip ? t.trip === def.trip : t.created_at.startsWith(month!));
  const mine = d.splits.filter((s) => s.person_id !== null && P.has(s.person_id) && txnById.has(s.txn_id));

  const shared: SharedLine[] = [];
  const own = new Map<number, OwnLine[]>(people.map((p) => [p.id, []]));
  const ownLine = (id: number, t: Txn, what: string, amount: number) => {
    const paid = !!mine.find((s) => s.txn_id === t.id && s.person_id === id)?.paid_at;
    if (amount > 0) own.get(id)!.push({ date: t.created_at.slice(0, 10), what, amount, paid });
  };

  for (const t of [...new Set(mine.map((s) => s.txn_id))].map((id) => txnById.get(id)!).filter(inPeriod)) {
    const all = d.splits.filter((s) => s.txn_id === t.id);
    const E = new Set(all.map((s) => s.person_id));
    const heads = E.size + 1; // + you
    const byAll = [...P].every((id) => E.has(id)); // the whole room is in it
    const paidBy = all.filter((s) => s.person_id !== null && P.has(s.person_id) && s.paid_at).map((s) => s.person_id!);
    const what = whatOf(t);
    const items: Item[] = t.items ?? [];
    if (items.length) {
      const common = items.filter((it) => !it.who.length).reduce((a, it) => a + it.amount, 0)
        + Math.max(0, t.amount - items.reduce((a, it) => a + it.amount, 0));
      if (common && byAll) shared.push({ date: t.created_at.slice(0, 10), what, total: common, each: Math.floor(common / heads), count: heads, paidBy });
      else if (common) for (const id of P) if (E.has(id)) ownLine(id, t, `${what} (shared part)`, Math.floor(common / heads));
      for (const it of items.filter((x) => x.who.length)) for (const id of it.who) if (P.has(id)) ownLine(id, t, `${it.name} · ${what}`, Math.floor(it.amount / it.who.length));
    } else {
      const equal = all.every((s) => s.amount === all[0].amount);
      if (byAll && equal) shared.push({ date: t.created_at.slice(0, 10), what, total: t.amount, each: all[0].amount, count: heads, paidBy });
      else for (const s of all) if (s.person_id !== null && P.has(s.person_id)) ownLine(s.person_id, t, what, s.amount);
    }
  }

  const sum = (xs: Split[]) => xs.reduce((a, s) => a + s.amount, 0);
  // first names; 0 (ME) on an item is whoever made the link
  const first = (n: string) => n.trim().split(/\s+/)[0] || '?';
  const owner = first(me.name || 'Payer');
  const nameOf = (id: number | null, snapshot = '') => (id === 0 ? owner : first(d.people.find((p) => p.id === id)?.name ?? snapshot));
  const history = (pid: number): HistoryLine[] => mine
    .filter((s) => s.person_id === pid && (!def.trip || txnById.get(s.txn_id)!.trip === def.trip))
    .map((s) => {
      const t = txnById.get(s.txn_id)!;
      const others = d.splits.filter((x) => x.txn_id === t.id && x.person_id !== pid).map((x) => nameOf(x.person_id, x.name));
      return {
        date: t.created_at.slice(0, 10), what: whatOf(t), payee: t.payee_name, category: t.category, place: t.place ?? null, trip: t.trip ?? null,
        total: t.amount, share: s.amount, paid: !!s.paid_at, with: [owner, ...others],
        items: (t.items ?? []).map((it) => ({ name: it.name, amount: it.amount, who: it.who.length ? it.who.map((id) => nameOf(id)) : ['Everyone'] })),
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
  return {
    title: def.title, from: me, updated: now, month, trip: def.trip,
    shared: shared.sort((a, b) => a.date.localeCompare(b.date)),
    people: people.map((p) => {
      const theirs = mine.filter((s) => s.person_id === p.id);
      const now_ = theirs.filter((s) => inPeriod(txnById.get(s.txn_id)!));
      // a room link carries anything unpaid from earlier months into this one
      const before = month ? theirs.filter((s) => !s.paid_at && txnById.get(s.txn_id)!.created_at.slice(0, 7) < month) : [];
      const months = [...new Set(before.map((s) => txnById.get(s.txn_id)!.created_at.slice(0, 7)))].sort();
      // previous balance and part payments aren't tied to a trip, so only a room link counts them
      const opening = month ? p.opening ?? 0 : 0, partPaid = month ? p.credit ?? 0 : 0, oweBack = month ? p.owe ?? 0 : 0;
      return {
        id: p.id, name: p.name, opening, partPaid, oweBack,
        due: Math.max(0, sum(now_.filter((s) => !s.paid_at)) + sum(before) + opening - partPaid - oweBack), paid: sum(now_.filter((s) => s.paid_at)),
        carried: months.map((m) => ({ month: m, amount: sum(before.filter((s) => txnById.get(s.txn_id)!.created_at.startsWith(m))) })),
        own: own.get(p.id)!.sort((a, b) => a.date.localeCompare(b.date)),
        ...(month ? { ledger: ledger(p, d, now) } : { history: history(p.id) }),
      };
    }),
  };
}

// Builds the month sheet from what's recorded. Money they paid back (repayments) and money they gave you (owed back) are
// the minus lines. Splits marked paid with no money recorded that month show as "Marked paid". Whatever's left over
// (a "mark all as paid" that cleared a balance) lands on this month as "Settled", so the last balance is always what they owe.
export function ledger(p: LedgerPerson, d: Data, now: string): LedgerMonth[] {
  const ok = new Map(d.txns.filter((t) => t.status !== 'FAILURE').map((t) => [t.id, t]));
  const mine = d.splits.filter((s) => s.person_id === p.id && ok.has(s.txn_id));
  const repaid = d.txns.filter((t) => ok.has(t.id) && t.direction === 'credit' && t.repay_of === p.id);
  const gave = d.txns.filter((t) => ok.has(t.id) && t.direction === 'credit' && t.owe_to === p.id);
  const mOf = (iso: string) => iso.slice(0, 7);
  const thisMonth = mOf(now);
  const months = [...new Set([
    ...mine.map((s) => mOf(ok.get(s.txn_id)!.created_at)), ...mine.filter((s) => s.paid_at).map((s) => mOf(s.paid_at!)),
    ...repaid.map((t) => mOf(t.created_at)), ...gave.map((t) => mOf(t.created_at)), thisMonth,
  ])].filter((m) => m <= thisMonth).sort();
  const sum = (xs: { amount: number }[]) => xs.reduce((a, x) => a + x.amount, 0);

  // Repayments cover splits marked paid that month; any left over waits for later months, or went to their old balance.
  // Part credit still waiting came from the latest repayments, so it's set aside from those first.
  const r = new Map(months.map((m) => [m, sum(repaid.filter((t) => mOf(t.created_at) === m))]));
  let keep = p.credit ?? 0;
  for (const m of [...months].reverse()) { const k = Math.min(keep, r.get(m)!); r.set(m, r.get(m)! - k); keep -= k; }
  let pool = 0;
  const manual = new Map<string, number>();
  for (const m of months) {
    pool += r.get(m)!;
    const settled = sum(mine.filter((s) => s.paid_at && mOf(s.paid_at) === m));
    const used = Math.min(pool, settled);
    pool -= used;
    manual.set(m, settled - used);
  }
  // repayment left over went to their previous balance, so that balance started that much higher
  let balance = (p.opening ?? 0) + pool;
  const out: LedgerMonth[] = [];
  for (const m of months) {
    const items = mine.filter((s) => mOf(ok.get(s.txn_id)!.created_at) === m)
      .map((s) => { const t = ok.get(s.txn_id)!; return { date: t.created_at.slice(0, 10), what: whatOf(t), amount: s.amount }; })
      .sort((a, b) => a.date.localeCompare(b.date));
    const paid = [
      ...repaid.filter((t) => mOf(t.created_at) === m).map((t) => ({ date: t.created_at.slice(0, 10), what: t.note || 'Paid back', amount: t.amount })),
      ...gave.filter((t) => mOf(t.created_at) === m).map((t) => ({ date: t.created_at.slice(0, 10), what: `Gave you${t.note ? ` · ${t.note}` : ''}`, amount: t.amount })),
    ].sort((a, b) => a.date.localeCompare(b.date));
    if (manual.get(m)) paid.push({ date: `${m}-01`, what: 'Marked paid', amount: manual.get(m)! });
    const old = balance;
    balance = old + sum(items) - sum(paid);
    if (items.length || paid.length || m === thisMonth) out.push({ month: m, items, total: sum(items), old, paid, balance });
  }
  const owes = (p.opening ?? 0) - (p.credit ?? 0) - (p.owe ?? 0) + sum(mine.filter((s) => !s.paid_at));
  const last = out[out.length - 1];
  if (last.balance !== owes) {
    last.paid.push({ date: now.slice(0, 10), what: 'Settled', amount: last.balance - owes });
    last.balance = owes;
  }
  return out;
}
