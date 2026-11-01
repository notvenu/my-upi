'use client';
import { ChevronDown, Download, FileUp, Repeat, Search, X } from 'lucide-react';
import { useState } from 'react';
import NavBar from '@/components/NavBar';
import Segmented from '@/components/Segmented';
import TxnRow from '@/components/TxnRow';
import { MANDATE_RE } from '@/lib/calc';
import { db, listCategories, methodOf, type Txn } from '@/lib/db';
import { setNav } from '@/lib/nav';
import { statementCsv } from '@/lib/statement';
import { download, longDate, monthName, spentOf, toast, ymd } from '@/lib/ui';
import { rupees } from '@/lib/upi';

type F = 'all' | 'upi' | 'cash' | 'card' | 'auto';
const FILTERS: [F, string][] = [['all', 'All'], ['upi', 'UPI'], ['cash', 'Cash'], ['card', 'Card'], ['auto', 'Autopay']];
const isAuto = (t: Txn) => !!t.sub_id || MANDATE_RE.test(t.desc ?? t.note ?? '');
type Sort = 'new' | 'old' | 'high' | 'low';
const SORTS: [Sort, string][] = [['new', 'Newest'], ['old', 'Oldest'], ['high', 'Highest'], ['low', 'Lowest']];
const SORT_FN: Record<Sort, (a: Txn, b: Txn) => number> = {
  new: (a, b) => b.created_at.localeCompare(a.created_at),
  old: (a, b) => a.created_at.localeCompare(b.created_at),
  high: (a, b) => b.amount - a.amount,
  low: (a, b) => a.amount - b.amount,
};
const receivedOf = (list: Txn[]) => list.filter((t) => t.direction === 'credit' && t.status !== 'FAILURE').reduce((a, t) => a + t.amount, 0);

// A filter as a chip: the phone's own picker opens, and the chip fills in while it's set.
function Pick({ value, onChange, options, label }: { value: string; onChange: (v: string) => void; options: [string, string][]; label: string }) {
  return (
    <label className="chip pick" aria-pressed={value !== options[0][0]}>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        {options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
      </select>
      <ChevronDown size={15} />
      <style jsx>{`
        .pick { position: relative; padding-right: 12px; }
        select { appearance: none; background: none; border: 0; color: inherit; font: inherit; padding: 0; cursor: pointer; }
        select:focus-visible { outline: none; }
        .pick:focus-within { box-shadow: 0 0 0 2px var(--tint); }
        option { background: var(--card); color: var(--ink); }
      `}</style>
    </label>
  );
}

// Every entry by day (or by amount): filter by how it was paid, side, month and category; search by name, note,
// category, trip or app; download what's shown as a statement that imports back.
export default function History() {
  const [filter, setFilter] = useState<F>('all');
  const [side, setSide] = useState('all');
  const [month, setMonth] = useState('all');
  const [cat, setCat] = useState('all');
  const [sort, setSort] = useState<Sort>('new');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(120); // ponytail: renders in pages of 120; virtualise if years of history get slow
  const more = <T,>(set: (v: T) => void) => (v: T) => { set(v); setLimit(120); };

  const months = [...new Set(db.txns.map((t) => t.created_at.slice(0, 7)))].sort().reverse();
  const cats = [...new Set([...listCategories(), ...db.txns.map((t) => t.category)])].filter((c) => db.txns.some((t) => t.category === c));
  const s = q.trim().toLowerCase();
  const list = db.txns
    .filter((t) => filter === 'all' || (filter === 'auto' ? isAuto(t) : methodOf(t) === filter))
    .filter((t) => side === 'all' || t.direction === side)
    .filter((t) => month === 'all' || t.created_at.startsWith(month))
    .filter((t) => cat === 'all' || t.category === cat)
    .filter((t) => !s || [t.payee_name, t.note, t.desc, t.payee_vpa, t.category, t.subcategory, t.trip, t.app, t.place].some((v) => v?.toLowerCase().includes(s)))
    .sort(SORT_FN[sort]);
  const byDay = sort === 'new' || sort === 'old';
  const groups: [string, Txn[]][] = [];
  for (const t of list.slice(0, limit)) {
    const d = byDay ? t.created_at.slice(0, 10) : '';
    if (groups.at(-1)?.[0] === d) groups.at(-1)![1].push(t);
    else groups.push([d, [t]]);
  }
  const today = ymd(new Date());
  const yesterday = ymd(new Date(Date.now() - 864e5));
  const dayName = (d: string) => (d === today ? 'Today' : d === yesterday ? 'Yesterday' : longDate(d));
  const filtered = !!q || filter !== 'all' || side !== 'all' || month !== 'all' || cat !== 'all';
  const clear = () => { setFilter('all'); setSide('all'); setMonth('all'); setCat('all'); setQ(''); setLimit(120); };
  const received = receivedOf(list);

  function exportCsv() {
    if (!list.length) return toast('Nothing to download');
    const name = ['myupi', month === 'all' ? 'statement' : month, cat === 'all' ? '' : cat.toLowerCase()].filter(Boolean).join('-');
    download(`${name}.csv`, statementCsv(list.map((t) => ({ ...t, method: methodOf(t) }))), 'text/csv');
    toast(`Downloaded ${list.length} ${list.length === 1 ? 'entry' : 'entries'}`);
  }

  return (
    <div className="page">
      <NavBar title="History" trailing={<>
        <button className="icon-btn" aria-label="Download statement" title="Download what's shown as CSV" onClick={exportCsv}><Download size={19} /></button>
        <button className="icon-btn" aria-label="Autopays" title="Autopays (A)" onClick={() => setNav({ subs: true })}><Repeat size={19} /></button>
        <button className="icon-btn tinted" aria-label="Upload a statement" title="Upload a statement (I)" onClick={() => setNav({ importing: true })}><FileUp size={19} /></button>
      </>} />
      <label className="search">
        <Search size={17} className="faint" />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search payments" aria-label="Search payments" />
      </label>
      <div style={{ margin: '12px 0 0' }}><Segmented options={FILTERS} value={filter} onChange={more(setFilter)} label="Paid by" /></div>
      <div className="chips scroll" style={{ marginTop: 10 }}>
        <Pick label="Sort" value={sort} onChange={(v) => more(setSort)(v as Sort)} options={SORTS} />
        <Pick label="Spent or received" value={side} onChange={more(setSide)} options={[['all', 'In & out'], ['debit', 'Spent'], ['credit', 'Received']]} />
        <Pick label="Month" value={month} onChange={more(setMonth)} options={[['all', 'All months'], ...months.map((m): [string, string] => [m, monthName(m)])]} />
        <Pick label="Category" value={cat} onChange={more(setCat)} options={[['all', 'All categories'], ...cats.map((c): [string, string] => [c, c])]} />
        {filtered && <button className="chip" onClick={clear}><X size={15} /> Clear</button>}
      </div>
      <p className="sub" style={{ margin: '10px 4px 0' }}>
        {list.length} {list.length === 1 ? 'entry' : 'entries'} · {rupees(spentOf(list))} {received ? `out · ${rupees(received)} in` : 'spent'}
      </p>

      {groups.length ? groups.map(([d, ts]) => (
        <div key={d || 'all'}>
          {byDay ? <h3 className="eyebrow day"><span>{dayName(d)}</span><span className="num">{rupees(spentOf(ts))}</span></h3> : <div style={{ height: 14 }} />}
          <div className="list wide">{ts.map((t) => <TxnRow key={t.id} t={t} onClick={() => setNav({ editing: t })} />)}</div>
        </div>
      )) : filtered ? <p className="sub center" style={{ marginTop: 40 }}>Nothing matches.</p> : (
        <div className="card center" style={{ marginTop: 16, padding: '28px 22px', display: 'grid', gap: 8, justifyItems: 'center' }}>
          <p style={{ fontWeight: 600, fontSize: 18 }}>No payments yet</p>
          <p className="sub" style={{ maxWidth: 300 }}>Add them as you pay, or upload a bank, PhonePe or super.money statement to bring in what you&apos;ve already paid.</p>
          <button className="btn lime" style={{ marginTop: 8, width: 'auto' }} onClick={() => setNav({ importing: true })}><FileUp size={18} /> Upload a statement</button>
        </div>
      )}
      {list.length > limit && <button className="btn soft" style={{ marginTop: 16 }} onClick={() => setLimit(limit + 120)}>Show more</button>}
      <style jsx>{`
        .search { display: flex; align-items: center; gap: 10px; background: var(--card); border-radius: 999px; padding: 0 18px; min-height: 46px; }
        .search input { flex: 1; font-size: 16px; padding: 10px 0; }
        .day .num { color: var(--sub); }
      `}</style>
    </div>
  );
}
