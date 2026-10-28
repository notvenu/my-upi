import { findRecurring, nextDue, settleFromCredits, type Every } from './calc';
import { emit } from './store';
import { matchRows, methodFromDesc, type StmtRow } from './statement';
import { SUBCATEGORIES } from './upi';

// The whole store, kept as one JSON document in localStorage and synced row by row
// to Supabase when signed in (sync.ts). Every write goes through these functions, which call save().
// ponytail: whole-store JSON save on every write, fine for a personal log (tens of thousands of rows); move to IndexedDB if saves get slow.
export type Txn = {
  id: number; amount: number; direction: 'debit' | 'credit'; payee_vpa: string | null; payee_name: string | null;
  note: string | null; category: string; place: string | null; lat: number | null; lng: number | null;
  created_at: string; status: string; txn_ref: string | null; upi_txn_id: string | null; bank_ref: string | null;
  source: string; stmt_key: string | null; subcategory: string | null; bill_uri: string | null;
  trip?: string | null; // optional trip or event tag ("Goa trip"), so its splits can be requested together
  method?: Method | null; app?: string | null; // how it was paid; app = the UPI app's name
  sub_id?: number | null; // logged by an autopay
  items?: Item[] | null; // a bill split item by item
};
export type Method = 'upi' | 'cash' | 'card' | 'bank';
export type Item = { name: string; amount: number; who: number[] }; // who: person ids, 0 = you
// An autopay / mandate / subscription, logged on its own on each due date.
export type Sub = { id: number; name: string; amount: number; every: Every; day: number; next: string; method: Method; category: string };
export type Split = {
  id: number; txn_id: number; person_id: number | null; name: string; phone: string | null; amount: number;
  requested_at: string | null; paid_at: string | null;
};
type PersonRow = { id: number; name: string; phone: string | null; vpa: string | null };
type GroupRow = { id: number; name: string; memberIds: number[] };
export type Person = PersonRow & { owed: number; groupIds: number[] };
export type Group = GroupRow;
export type Owed = Split & { note: string | null; payee_name: string | null; created_at: string; txn_amount: number; trip: string | null };

// A public split link for a room (people) or a trip; uuid is the link's id.
export type ShareDef = { id: number; uuid: string; title: string; personIds: number[]; trip: string | null };

export type Store = {
  seq: number; txns: Txn[]; people: PersonRow[]; groups: GroupRow[]; splits: Split[];
  subcategories: Record<string, string[]>; settings: Record<string, string>; subs: Sub[]; shares: ShareDef[];
};
const KEY = 'myupi';
const empty = (): Store => ({ seq: 0, txns: [], people: [], groups: [], splits: [], subcategories: {}, settings: {}, subs: [], shares: [] });

function load(): Store {
  try { return { ...empty(), ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return empty(); }
}
export const db: Store = load();
export const persistLocal = () => localStorage.setItem(KEY, JSON.stringify(db));
let onSave = () => {};
export const setSaveHook = (fn: () => void) => { onSave = fn; };
const save = () => { persistLocal(); emit(); onSave(); };
// Time-based, so a phone and a laptop never hand out the same id (older entries keep their small ones).
let tick = 0;
const nextId = () => Date.now() * 1000 + (tick++ % 1000);

// Backup: the whole store as JSON. Bill photos stay on this device.
export const exportJson = () => JSON.stringify(db);
export function importJson(text: string) {
  const data = JSON.parse(text) as Store;
  if (!Array.isArray(data.txns) || !Array.isArray(data.people)) throw new Error('Not a MyUPI backup');
  Object.assign(db, empty(), data);
  save();
}

const pad = (n: number) => String(n).padStart(2, '0');
export const localIso = (d = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

// Failed payments never count toward spending or splits.
const counted = (t: Txn) => t.status !== 'FAILURE';
const txnById = (id: number) => db.txns.find((t) => t.id === id);

function insertSplits(txnId: number, splits: { personId: number; amount: number }[]) {
  for (const s of splits) {
    const p = db.people.find((x) => x.id === s.personId);
    if (p) db.splits.push({ id: nextId(), txn_id: txnId, person_id: p.id, name: p.name, phone: p.phone, amount: s.amount, requested_at: null, paid_at: null });
  }
}

export function addTxn(t: Partial<Txn> & { amount: number }, splits: { personId: number; amount: number }[] = []): number {
  const id = nextId();
  db.txns.push({
    id, amount: t.amount, direction: t.direction ?? 'debit', payee_vpa: t.payee_vpa ?? null, payee_name: t.payee_name ?? null, note: t.note || null,
    category: t.category ?? 'Other', subcategory: t.subcategory ?? null, place: t.place || null, lat: t.lat ?? null, lng: t.lng ?? null,
    created_at: t.created_at ?? localIso(), status: t.status ?? 'SUCCESS', txn_ref: t.txn_ref ?? null, upi_txn_id: null, bank_ref: t.bank_ref ?? null,
    source: t.source ?? 'manual', stmt_key: t.stmt_key ?? null, bill_uri: t.bill_uri ?? null, trip: t.trip?.trim() || null,
    method: t.method ?? null, app: t.app ?? null, sub_id: t.sub_id ?? null, items: t.items?.length ? t.items : null,
  });
  insertSplits(id, splits);
  save();
  return id;
}

export function updateTxn(id: number, f: Partial<Txn>) {
  const t = txnById(id);
  if (t) { Object.assign(t, f); save(); }
}

export function deleteTxn(id: number) {
  db.txns = db.txns.filter((t) => t.id !== id);
  db.splits = db.splits.filter((s) => s.txn_id !== id);
  save();
}

export const txnSplits = (txnId: number) => db.splits.filter((s) => s.txn_id === txnId);
export function addSplits(txnId: number, splits: { personId: number; amount: number }[]) { insertSplits(txnId, splits); save(); }

const newestFirst = (a: Txn, b: Txn) => b.created_at.localeCompare(a.created_at);

// Payments started from MyUPI and finished in a UPI app, waiting for "yes, I paid". Newest first.
export const toConfirm = () => db.txns.filter((t) => t.status === 'PENDING' && t.source === 'app').sort(newestFirst);
export function confirmPaid(id: number, amount: number) { updateTxn(id, { status: 'SUCCESS', amount }); }

// One fixed scale for every month's charts (largest category-month and largest day ever), so months compare honestly.
export function chartScale() {
  const cat = new Map<string, number>(), day = new Map<string, number>();
  for (const t of db.txns) {
    if (t.direction !== 'debit' || !counted(t)) continue;
    const ck = t.created_at.slice(0, 7) + t.category, dk = t.created_at.slice(0, 10);
    cat.set(ck, (cat.get(ck) ?? 0) + t.amount);
    day.set(dk, (day.get(dk) ?? 0) + t.amount);
  }
  return { category: Math.max(1, ...cat.values()), day: Math.max(1, ...day.values()) };
}

export const monthTxns = (ym: string) => db.txns.filter((t) => t.created_at.startsWith(ym)).sort(newestFirst);

// Category + subcategory picked last time for this payee (by UPI ID, else by name), if any.
export function lastPick(vpa?: string | null, name?: string | null) {
  const byVpa = vpa ? db.txns.filter((t) => t.payee_vpa === vpa) : [];
  const pool = byVpa.length ? byVpa : name ? db.txns.filter((t) => t.payee_name?.toLowerCase() === name.toLowerCase()) : [];
  const t = pool.sort(newestFirst)[0];
  return t ? { category: t.category, subcategory: t.subcategory } : undefined;
}

// Defaults, then ones the user added, then any used in history.
export function subcategoriesFor(category: string): string[] {
  const used = db.txns.filter((t) => t.category === category && t.subcategory).map((t) => t.subcategory!);
  return [...new Set([...(SUBCATEGORIES[category] ?? []), ...(db.subcategories[category] ?? []), ...used])];
}
export function addSubcategory(category: string, name: string) {
  const list = (db.subcategories[category] ??= []);
  if (!list.includes(name.trim())) { list.push(name.trim()); save(); }
}

// Most-split-with first, so roommates float to the top of pickers.
export function listPeople(): Person[] {
  const count = (id: number) => db.splits.filter((s) => s.person_id === id).length;
  return db.people
    .map((p) => ({
      ...p,
      owed: db.splits.filter((s) => s.person_id === p.id && !s.paid_at && counted(txnById(s.txn_id)!)).reduce((a, s) => a + s.amount, 0),
      groupIds: db.groups.filter((g) => g.memberIds.includes(p.id)).map((g) => g.id),
    }))
    .sort((a, b) => count(b.id) - count(a.id) || a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
}

export const listGroups = (): Group[] => [...db.groups].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

export function savePerson(p: { id?: number; name: string; phone: string; vpa: string }, groupIds: number[]): number {
  const row = { name: p.name.trim(), phone: p.phone.replace(/\D/g, '').slice(-10) || null, vpa: p.vpa.trim().toLowerCase() || null };
  const existing = p.id ? db.people.find((x) => x.id === p.id) : undefined;
  const id = existing ? existing.id : nextId();
  if (existing) Object.assign(existing, row);
  else db.people.push({ id, ...row });
  for (const g of db.groups) {
    g.memberIds = g.memberIds.filter((m) => m !== id);
    if (groupIds.includes(g.id)) g.memberIds.push(id);
  }
  save();
  return id;
}

export function deletePerson(id: number) {
  db.people = db.people.filter((p) => p.id !== id);
  for (const g of db.groups) g.memberIds = g.memberIds.filter((m) => m !== id);
  for (const s of db.splits) if (s.person_id === id) s.person_id = null; // past splits keep the name snapshot
  save();
}
export function addGroup(name: string) {
  if (db.groups.some((g) => g.name.toLowerCase() === name.trim().toLowerCase())) return;
  db.groups.push({ id: nextId(), name: name.trim(), memberIds: [] });
  save();
}
export function deleteGroup(id: number) { db.groups = db.groups.filter((g) => g.id !== id); save(); }

export function unpaidSplits(personId?: number): Owed[] {
  return db.splits
    .filter((s) => !s.paid_at && (!personId || s.person_id === personId))
    .map((s) => ({ s, t: txnById(s.txn_id)! }))
    .filter(({ t }) => t && counted(t))
    .sort((a, b) => a.t.created_at.localeCompare(b.t.created_at))
    .map(({ s, t }) => ({ ...s, note: t.note, payee_name: t.payee_name, created_at: t.created_at, txn_amount: t.amount, trip: t.trip ?? null }));
}

// Trip tags used so far, most recent first, for suggestions.
export function listTrips(): string[] {
  return [...new Set([...db.txns].sort(newestFirst).map((t) => t.trip).filter(Boolean) as string[])];
}

export function markSplits(ids: number[], field: 'requested_at' | 'paid_at') {
  const now = localIso();
  for (const s of db.splits) if (ids.includes(s.id)) s[field] = now;
  save();
}

export const getSetting = (k: string) => db.settings[k] ?? '';
export function setSetting(k: string, v: string) { db.settings[k] = v; save(); }

// Skip rows already imported (same row or same UPI ref), confirm payments MyUPI recorded, add the rest.
export function importStatement(rows: StmtRow[]) {
  let matched = 0, added = 0, skipped = 0;
  const fresh = rows.filter((r) => {
    const dup = db.txns.some((t) => t.stmt_key === r.key || (r.ref && t.bank_ref === r.ref));
    if (dup) skipped++;
    return !dup;
  });
  const candidates = db.txns.filter((t) => !t.stmt_key && t.source !== 'statement').map((t) => ({
    id: t.id, amount: t.amount, direction: t.direction, date: t.created_at.slice(0, 10),
    refs: [t.upi_txn_id, t.bank_ref].filter(Boolean) as string[],
  }));
  matchRows(fresh, candidates).forEach((id, i) => {
    const r = fresh[i];
    const t = id !== null ? txnById(id) : undefined;
    if (t) {
      Object.assign(t, { status: 'SUCCESS', stmt_key: r.key, bank_ref: t.bank_ref ?? r.ref ?? null });
      matched++;
    } else {
      const name = r.vpa ? r.vpa.split('@')[0] : r.desc.slice(0, 40);
      const last = lastPick(r.vpa, name);
      addTxn({
        amount: r.amount, direction: r.direction, payee_vpa: r.vpa ?? null, payee_name: name, note: r.desc,
        category: last?.category || (r.direction === 'credit' ? 'Transfer' : 'Other'), subcategory: last?.subcategory || null,
        created_at: `${r.date}T12:00:00`, status: 'SUCCESS', source: 'statement', stmt_key: r.key, bank_ref: r.ref ?? null,
        method: methodFromDesc(r.desc, r.vpa),
      });
      added++;
    }
  });
  // friends paying back: credits that match what someone owes mark those splits paid
  const owing = db.people.map((p) => ({
    id: p.id, name: p.name, vpa: p.vpa,
    unpaid: unpaidSplits(p.id).map((s) => ({ id: s.id, amount: s.amount, month: s.created_at.slice(0, 7) })),
  }));
  const paidIds = settleFromCredits(fresh.filter((r) => r.direction === 'credit'), owing);
  markSplits(paidIds, 'paid_at');
  return { matched, added, skipped, settled: paidIds.length };
}

// Older entries have no method: UPI if it has a UPI ID or was paid through MyUPI.
export const methodOf = (t: Txn): Method | null => t.method ?? (t.payee_vpa || t.source === 'app' ? 'upi' : null);

// ── autopays ──
export const listSubs = () => [...db.subs].sort((a, b) => a.next.localeCompare(b.next));
export function saveSub(s: Omit<Sub, 'id'> & { id?: number }) {
  const row = { ...s, name: s.name.trim(), day: Number(s.next.slice(8, 10)) };
  const existing = s.id ? db.subs.find((x) => x.id === s.id) : undefined;
  if (existing) Object.assign(existing, row);
  else db.subs.push({ ...row, id: nextId() });
  save();
}
export function deleteSub(id: number) { db.subs = db.subs.filter((s) => s.id !== id); save(); }

// Logs every autopay that has come due (catching up after days away) and moves it to its next date.
// A later bank statement confirms these instead of adding them twice (same amount, ±1 day).
export function logDueSubs(today: string): number {
  let n = 0;
  for (const s of db.subs) {
    while (s.next <= today) {
      addTxn({ amount: s.amount, payee_name: s.name, category: s.category, method: s.method, created_at: `${s.next}T09:00:00`, source: 'autopay', sub_id: s.id });
      s.next = nextDue(s.next, s.every, s.day);
      n++;
    }
  }
  if (n) save();
  return n;
}

// Payments that look like subscriptions and aren't tracked yet (or dismissed).
export function suggestedSubs(today: string) {
  const dismissed: string[] = JSON.parse(getSetting('subs_dismissed') || '[]');
  const have = new Set(db.subs.map((s) => s.name.toLowerCase()));
  const seen = db.txns
    .filter((t) => t.direction === 'debit' && counted(t) && !t.sub_id)
    .map((t) => ({ key: (t.payee_vpa || t.payee_name || t.note || '').toLowerCase(), name: t.payee_name || t.note || t.payee_vpa || 'Payment',
      amount: t.amount, date: t.created_at.slice(0, 10), category: t.category, note: t.note ?? '' }))
    .filter((x) => x.key);
  return findRecurring(seen, today).filter((r) => !dismissed.includes(r.key) && !have.has(r.name.toLowerCase()));
}
export const dismissSub = (key: string) =>
  setSetting('subs_dismissed', JSON.stringify([...JSON.parse(getSetting('subs_dismissed') || '[]'), key]));

// ── split links ──
export function addShare(title: string, personIds: number[], trip: string | null): ShareDef {
  const def = { id: nextId(), uuid: crypto.randomUUID(), title: title.trim(), personIds, trip };
  db.shares.push(def);
  save();
  return def;
}
export function deleteShare(id: number) { db.shares = db.shares.filter((s) => s.id !== id); save(); }
