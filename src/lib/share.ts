// What a public split link shows, built from your data on your device and stored as one snapshot (so the link
// never exposes anything else). Pure; checked by check.ts.
import type { Item, Split, Txn } from './db';

export type SharedLine = { date: string; what: string; total: number; each: number; count: number; paidBy: number[] };
export type OwnLine = { date: string; what: string; amount: number; paid: boolean };
export type SharePerson = { id: number; name: string; due: number; paid: number; carried: { month: string; amount: number }[]; own: OwnLine[] };
export type ShareView = {
  title: string; from: { name: string; vpa: string }; updated: string;
  month: string | null; trip: string | null; // a room link covers the current month (plus anything unpaid before it); a trip link the whole trip
  shared: SharedLine[]; people: SharePerson[];
};

type Data = { txns: Txn[]; splits: Split[]; people: { id: number; name: string }[] };

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
  return {
    title: def.title, from: me, updated: now, month, trip: def.trip,
    shared: shared.sort((a, b) => a.date.localeCompare(b.date)),
    people: people.map((p) => {
      const theirs = mine.filter((s) => s.person_id === p.id);
      const now_ = theirs.filter((s) => inPeriod(txnById.get(s.txn_id)!));
      // a room link carries anything unpaid from earlier months into this one
      const before = month ? theirs.filter((s) => !s.paid_at && txnById.get(s.txn_id)!.created_at.slice(0, 7) < month) : [];
      const months = [...new Set(before.map((s) => txnById.get(s.txn_id)!.created_at.slice(0, 7)))].sort();
      return {
        id: p.id, name: p.name,
        due: sum(now_.filter((s) => !s.paid_at)) + sum(before), paid: sum(now_.filter((s) => s.paid_at)),
        carried: months.map((m) => ({ month: m, amount: sum(before.filter((s) => txnById.get(s.txn_id)!.created_at.startsWith(m))) })),
        own: own.get(p.id)!.sort((a, b) => a.date.localeCompare(b.date)),
      };
    }),
  };
}
