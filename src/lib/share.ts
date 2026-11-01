// What a public split link shows, built from your data on your device and stored as one snapshot (so the link
// never exposes anything else). Only what's still unpaid is listed. Pure; checked by check.ts.
import type { Item, Split, Txn } from './db';
// ponytail: history is every split ever in the snapshot; trim to recent months if links get heavy

export type SharedLine = { date: string; what: string; total: number; each: number; count: number; paidBy: number[] };
export type OwnLine = { date: string; what: string; amount: number; paid: boolean };
// One payment someone was in, in full: what it was, the bill, their share, who else was in it, and the items (who had each).
export type HistoryLine = {
  date: string; what: string; payee: string | null; category: string; place: string | null; trip: string | null;
  total: number; share: number; paid: boolean; with: string[]; items: { name: string; amount: number; who: string[] }[];
  detail?: Detail;
};
// A room link's month-by-month sheet for one person, like a roommates' spreadsheet: that month's unpaid items (their
// share), the total, what was carried in from before, money off (amounts are positive; shown as minus), and the balance carried on.
// Everything about one payment, for tapping an item on the link: when, who it was paid to and how, the whole bill,
// everyone's share (you paid the bill, so your share is what's left), and the bill's items.
export type Detail = {
  time: string; payee: string | null; paidBy: string; method: string | null; total: number; note: string | null;
  category: string; sub: string | null; place: string | null; trip: string | null;
  shares: { name: string; amount: number; them?: boolean }[]; items: { name: string; amount: number; who: string[] }[];
};
// category and detail: items only (older snapshots lack them)
export type LedgerLine = { date: string; what: string; amount: number; category?: string; detail?: Detail };
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
  until?: string | null; // only payments up to this day
  shared: SharedLine[]; people: SharePerson[];
};

type Data = { txns: Txn[]; splits: Split[]; people: { id: number; name: string; opening?: number; credit?: number; owe?: number }[] };
type LedgerPerson = Data['people'][number];

const whatOf = (t: Txn) => t.note || t.payee_name || t.subcategory || t.category;
// how the bill was paid: the UPI app's name when known
const methodName = (t: Txn) => {
  const m = t.method ?? (t.payee_vpa || t.source === 'app' ? 'upi' : null);
  return m === 'upi' ? t.app || 'UPI' : m === 'cash' ? 'Cash' : m === 'card' ? 'Card' : m === 'bank' ? 'Bank transfer' : null;
};

export function buildShare(
  def: { title: string; personIds: number[]; trip: string | null; until?: string | null }, d: Data, me: { name: string; vpa: string }, now: string,
): ShareView {
  const until = def.until && def.until < now.slice(0, 10) ? def.until : null;
  if (until) d = { ...d, txns: d.txns.filter((t) => t.created_at.slice(0, 10) <= until) }; // later payments aren't on the link
  const people = d.people.filter((p) => def.personIds.includes(p.id));
  const P = new Set(people.map((p) => p.id));
  const month = def.trip ? null : (until ?? now).slice(0, 7);
  const txnById = new Map(d.txns.filter((t) => t.status !== 'FAILURE').map((t) => [t.id, t]));
  const inPeriod = (t: Txn) => (def.trip ? t.trip === def.trip : t.created_at.startsWith(month!));
  const mine = d.splits.filter((s) => s.person_id !== null && P.has(s.person_id) && txnById.has(s.txn_id));

  const shared: SharedLine[] = [];
  const own = new Map<number, OwnLine[]>(people.map((p) => [p.id, []]));
  const ownLine = (id: number, t: Txn, what: string, amount: number) => {
    const paid = !!mine.find((s) => s.txn_id === t.id && s.person_id === id)?.paid_at;
    if (amount > 0 && !paid) own.get(id)!.push({ date: t.created_at.slice(0, 10), what, amount, paid });
  };

  for (const t of [...new Set(mine.map((s) => s.txn_id))].map((id) => txnById.get(id)!).filter(inPeriod)) {
    const all = d.splits.filter((s) => s.txn_id === t.id);
    const E = new Set(all.map((s) => s.person_id));
    const heads = E.size + 1; // + you
    const byAll = [...P].every((id) => E.has(id)); // the whole room is in it
    const paidBy = all.filter((s) => s.person_id !== null && P.has(s.person_id) && s.paid_at).map((s) => s.person_id!);
    const settled = [...P].filter((id) => E.has(id)).every((id) => paidBy.includes(id)); // everyone on the link has paid it
    const what = whatOf(t);
    const items: Item[] = t.items ?? [];
    if (items.length) {
      const common = items.filter((it) => !it.who.length).reduce((a, it) => a + it.amount, 0)
        + Math.max(0, t.amount - items.reduce((a, it) => a + it.amount, 0));
      if (common && byAll && !settled) shared.push({ date: t.created_at.slice(0, 10), what, total: common, each: Math.floor(common / heads), count: heads, paidBy });
      else if (common) for (const id of P) if (E.has(id)) ownLine(id, t, `${what} (shared part)`, Math.floor(common / heads));
      for (const it of items.filter((x) => x.who.length)) for (const id of it.who) if (P.has(id)) ownLine(id, t, `${it.name} · ${what}`, Math.floor(it.amount / it.who.length));
    } else {
      const equal = all.every((s) => s.amount === all[0].amount);
      if (byAll && equal) { if (!settled) shared.push({ date: t.created_at.slice(0, 10), what, total: t.amount, each: all[0].amount, count: heads, paidBy }); }
      else for (const s of all) if (s.person_id !== null && P.has(s.person_id)) ownLine(s.person_id, t, what, s.amount);
    }
  }

  const sum = (xs: Split[]) => xs.reduce((a, s) => a + s.amount, 0);
  // first names; 0 (ME) on an item is whoever made the link
  const first = (n: string) => n.trim().split(/\s+/)[0] || '?';
  const owner = first(me.name || 'Payer');
  const nameOf = (id: number | null, snapshot = '') => (id === 0 ? owner : first(d.people.find((p) => p.id === id)?.name ?? snapshot));
  const detailOf = (t: Txn, pid: number): Detail => {
    const all = d.splits.filter((x) => x.txn_id === t.id);
    return {
      time: t.created_at, payee: t.payee_name, paidBy: owner, method: methodName(t), total: t.amount, note: t.note && t.note !== whatOf(t) ? t.note : null,
      category: t.category, sub: t.subcategory, place: t.place ?? null, trip: t.trip ?? null,
      shares: [{ name: owner, amount: Math.max(0, t.amount - all.reduce((a, x) => a + x.amount, 0)) },
        ...all.map((x) => ({ name: nameOf(x.person_id, x.name), amount: x.amount, ...(x.person_id === pid ? { them: true } : {}) }))],
      items: (t.items ?? []).map((it) => ({ name: it.name, amount: it.amount, who: it.who.length ? it.who.map((id) => nameOf(id)) : ['Everyone'] })),
    };
  };
  const history = (pid: number): HistoryLine[] => mine
    .filter((s) => s.person_id === pid && !s.paid_at && (!def.trip || txnById.get(s.txn_id)!.trip === def.trip))
    .map((s) => {
      const t = txnById.get(s.txn_id)!;
      const others = d.splits.filter((x) => x.txn_id === t.id && x.person_id !== pid).map((x) => nameOf(x.person_id, x.name));
      return {
        date: t.created_at.slice(0, 10), what: whatOf(t), payee: t.payee_name, category: t.category, place: t.place ?? null, trip: t.trip ?? null,
        total: t.amount, share: s.amount, paid: !!s.paid_at, with: [owner, ...others],
        items: (t.items ?? []).map((it) => ({ name: it.name, amount: it.amount, who: it.who.length ? it.who.map((id) => nameOf(id)) : ['Everyone'] })),
        detail: detailOf(t, pid),
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
  return {
    title: def.title, from: me, updated: now, month, trip: def.trip, until,
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
        ...(month ? { ledger: ledger(p, d, now, (t) => detailOf(t, p.id)) } : { history: history(p.id) }),
      };
    }),
  };
}

// Builds the month sheet from what's still unpaid: each month's open splits, their previous balance carried into the
// first month, and what comes off (a part payment, money they gave you) on the last, so the last balance is what they owe.
export function ledger(p: LedgerPerson, d: Data, now: string, detail?: (t: Txn) => Detail): LedgerMonth[] {
  const ok = new Map(d.txns.filter((t) => t.status !== 'FAILURE').map((t) => [t.id, t]));
  const open = d.splits.filter((s) => s.person_id === p.id && !s.paid_at && ok.has(s.txn_id));
  const mOf = (iso: string) => iso.slice(0, 7);
  const sum = (xs: { amount: number }[]) => xs.reduce((a, x) => a + x.amount, 0);
  const off = [
    ...(p.credit ? [{ date: now.slice(0, 10), what: 'Paid in part', amount: p.credit }] : []),
    ...(p.owe ? [{ date: now.slice(0, 10), what: 'Gave you', amount: p.owe }] : []),
  ];
  const months = [...new Set(open.map((s) => mOf(ok.get(s.txn_id)!.created_at)))].sort();
  if (!months.length && (p.opening || off.length)) months.push(mOf(now)); // only an old balance or credit left
  let balance = p.opening ?? 0;
  return months.map((m, i) => {
    const items = open.filter((s) => mOf(ok.get(s.txn_id)!.created_at) === m)
      .map((s) => { const t = ok.get(s.txn_id)!; return { date: t.created_at.slice(0, 10), what: whatOf(t), amount: s.amount, category: t.category, ...(detail ? { detail: detail(t) } : {}) }; })
      .sort((a, b) => a.date.localeCompare(b.date));
    const paid = i === months.length - 1 ? off : [];
    const old = balance;
    balance = old + sum(items) - sum(paid);
    return { month: m, items, total: sum(items), old, paid, balance };
  });
}
