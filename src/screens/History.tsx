'use client';
import { FileUp, Repeat, Search } from 'lucide-react';
import { useState } from 'react';
import NavBar from '@/components/NavBar';
import Segmented from '@/components/Segmented';
import TxnRow from '@/components/TxnRow';
import { MANDATE_RE } from '@/lib/calc';
import { db, methodOf, type Txn } from '@/lib/db';
import { setNav } from '@/lib/nav';
import { longDate, spentOf, ymd } from '@/lib/ui';
import { rupees } from '@/lib/upi';

type F = 'all' | 'upi' | 'cash' | 'card' | 'auto';
const FILTERS: [F, string][] = [['all', 'All'], ['upi', 'UPI'], ['cash', 'Cash'], ['card', 'Card'], ['auto', 'Autopay']];
const isAuto = (t: Txn) => !!t.sub_id || MANDATE_RE.test(t.desc ?? t.note ?? '');

// Every entry, newest first, by day: filter by how it was paid, search by name, note, category, trip or app.
export default function History() {
  const [filter, setFilter] = useState<F>('all');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(120); // ponytail: renders in pages of 120; virtualise if years of history get slow

  const s = q.trim().toLowerCase();
  const list = db.txns
    .filter((t) => filter === 'all' || (filter === 'auto' ? isAuto(t) : methodOf(t) === filter))
    .filter((t) => !s || [t.payee_name, t.note, t.desc, t.payee_vpa, t.category, t.subcategory, t.trip, t.app, t.place].some((v) => v?.toLowerCase().includes(s)))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const days: [string, Txn[]][] = [];
  for (const t of list.slice(0, limit)) {
    const d = t.created_at.slice(0, 10);
    if (days.at(-1)?.[0] === d) days.at(-1)![1].push(t);
    else days.push([d, [t]]);
  }
  const today = ymd(new Date());
  const yesterday = ymd(new Date(Date.now() - 864e5));
  const dayName = (d: string) => (d === today ? 'Today' : d === yesterday ? 'Yesterday' : longDate(d));

  return (
    <div className="page">
      <NavBar title="History" trailing={<>
        <button className="icon-btn" aria-label="Autopays" title="Autopays (A)" onClick={() => setNav({ subs: true })}><Repeat size={19} /></button>
        <button className="icon-btn tinted" aria-label="Upload a statement" title="Upload a statement (I)" onClick={() => setNav({ importing: true })}><FileUp size={19} /></button>
      </>} />
      <label className="search">
        <Search size={17} className="faint" />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search payments" aria-label="Search payments" />
      </label>
      <div style={{ margin: '12px 0 4px' }}><Segmented options={FILTERS} value={filter} onChange={(f) => { setFilter(f); setLimit(120); }} label="Paid by" /></div>
      <p className="sub" style={{ margin: '8px 4px 0' }}>{list.length} {list.length === 1 ? 'entry' : 'entries'} · {rupees(spentOf(list))} spent</p>

      {days.length ? days.map(([d, ts]) => (
        <div key={d}>
          <h3 className="eyebrow day"><span>{dayName(d)}</span><span className="num">{rupees(spentOf(ts))}</span></h3>
          <div className="list wide">{ts.map((t) => <TxnRow key={t.id} t={t} onClick={() => setNav({ editing: t })} />)}</div>
        </div>
      )) : q || filter !== 'all' ? <p className="sub center" style={{ marginTop: 40 }}>Nothing matches.</p> : (
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
