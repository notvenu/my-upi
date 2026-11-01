'use client';
import { Check, ChevronLeft, ChevronRight, Copy, QrCode, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { renderSVG } from 'uqr';
import Avatar from '@/components/Avatar';
import type { Detail, LedgerMonth, SharePerson, ShareView } from '@/lib/share';
import { supabase } from '@/lib/sync';
import { rupees, simplePayUri } from '@/lib/upi';

const monthName = (ym: string) => new Date(`${ym}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
const day = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60e3);
  return m < 2 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : day(iso.slice(0, 10));
};

// Tapping an item: the whole payment. When and where, who it was paid to and how, the bill, everyone's share, the items.
// A bottom sheet on a phone, a centred dialog on a computer; Esc or a tap outside closes it.
type Opened = { what: string; amount: number; detail: Detail };
function DetailSheet({ item, who, onClose }: { item: Opened; who: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  const d = item.detail;
  const when = new Date(d.time).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  const facts = [
    ['Paid to', d.payee], ['Paid by', `${d.paidBy}${d.method ? ` · ${d.method}` : ''}`], ['Place', d.place], ['Trip', d.trip], ['Note', d.note],
  ].filter(([, v]) => v) as [string, string][];
  return (
    <dialog ref={ref} className="dsheet" onClose={onClose} onClick={(e) => { if (e.target === e.currentTarget) ref.current?.close(); }} aria-label={item.what}>
      <div className="in">
        <div className="top">
          <div style={{ minWidth: 0 }}>
            <p className="sub small">{[d.category, d.sub].filter(Boolean).join(' · ')}</p>
            <h2>{item.what}</h2>
            <p className="sub small">{when}</p>
          </div>
          <button className="x" aria-label="Close" onClick={() => ref.current?.close()}><X size={18} /></button>
        </div>

        <div className="mine">
          <span className="sub">{who}&apos;s share</span>
          <span className="num big">{rupees(item.amount)}</span>
          <span className="sub small">of a {rupees(d.total)} bill</span>
        </div>

        <dl className="facts">
          {facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>

        <h3 className="eyebrow">Split between {d.shares.length}</h3>
        <ul className="lines">
          {d.shares.map((x, i) => (
            <li key={i} className={x.them ? 'them' : ''}>
              <Avatar name={x.name} size={30} />
              <span className="grow">{x.name}<span className="sub small">{i === 0 ? ' · paid the bill' : x.them ? ' · this share' : ''}</span></span>
              <span className="num">{rupees(x.amount)}</span>
            </li>
          ))}
        </ul>

        {d.items.length > 0 && (
          <>
            <h3 className="eyebrow">On the bill</h3>
            <ul className="lines">
              {d.items.map((it, i) => (
                <li key={i}><span className="grow" style={{ minWidth: 0 }}>{it.name}<span className="sub small" style={{ display: 'block' }}>{it.who.join(', ')}</span></span><span className="num">{rupees(it.amount)}</span></li>
              ))}
            </ul>
          </>
        )}
      </div>
      <style jsx>{`
        .dsheet { border: 0; padding: 0; margin: auto auto 0; width: 100%; max-width: 560px; max-height: 90dvh; border-radius: 26px 26px 0 0;
          background: var(--card); color: var(--ink); overflow: hidden; }
        .dsheet::backdrop { background: rgb(0 0 0 / .6); }
        .dsheet[open] { animation: rise .32s var(--ease); }
        @keyframes rise { from { transform: translateY(48px); opacity: 0; } }
        .in { overflow-y: auto; max-height: 90dvh; padding: 20px 20px calc(24px + env(safe-area-inset-bottom)); scrollbar-width: none; }
        .top { display: flex; gap: 12px; align-items: flex-start; justify-content: space-between; }
        h2 { font-size: 24px; font-weight: 700; letter-spacing: -0.02em; margin: 2px 0; overflow-wrap: anywhere; }
        .small { font-size: 13px; }
        .x { flex-shrink: 0; width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; background: var(--raised); color: var(--sub); }
        .mine { display: grid; gap: 2px; margin: 16px 0 6px; padding: 16px; border-radius: 18px; background: var(--bg); }
        .big { font-size: 32px; font-weight: 700; color: var(--lime); letter-spacing: -0.02em; }
        .facts { margin: 8px 0 0; }
        .facts div { display: flex; justify-content: space-between; gap: 16px; padding: 10px 2px; border-bottom: .5px solid var(--line); font-size: 15px; }
        .facts dt { color: var(--sub); flex-shrink: 0; }
        .facts dd { margin: 0; text-align: right; overflow-wrap: anywhere; }
        .eyebrow { margin: 18px 0 6px; }
        .lines { list-style: none; margin: 0; padding: 0; }
        .lines li { display: flex; align-items: center; gap: 10px; padding: 9px 2px; font-size: 15px; }
        .lines li + li { border-top: .5px solid var(--line); }
        .them { color: var(--lime); }
        @media (min-width: 900px) { .dsheet { margin: auto; border-radius: 24px; max-height: 82vh; } .in { max-height: 82vh; } }
      `}</style>
    </dialog>
  );
}

// One person's unpaid items: categories first (tap one to filter), then the items, searchable and sortable, a page at a time.
type Row = { date: string; what: string; category: string; amount: number; sub?: string; detail?: Detail };
const PAGE = 15;
const SORTS = [['new', 'Newest first'], ['old', 'Oldest first'], ['high', 'Highest amount'], ['low', 'Lowest amount']] as const;
type Sort = (typeof SORTS)[number][0];
const BY: Record<Sort, (a: Row, b: Row) => number> = {
  new: (a, b) => b.date.localeCompare(a.date), old: (a, b) => a.date.localeCompare(b.date),
  high: (a, b) => b.amount - a.amount, low: (a, b) => a.amount - b.amount,
};
function ItemHistory({ rows, who }: { rows: Row[]; who: string }) {
  const [open, setOpen] = useState<Opened | null>(null);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>('new');
  const [page, setPage] = useState(0);
  const total = rows.reduce((a, r) => a + r.amount, 0);
  const cats = [...rows.reduce((m, r) => {
    const c = m.get(r.category) ?? { amt: 0, n: 0 };
    return m.set(r.category, { amt: c.amt + r.amount, n: c.n + 1 });
  }, new Map<string, { amt: number; n: number }>())].sort((a, b) => b[1].amt - a[1].amt);
  const s = q.trim().toLowerCase();
  const list = rows.filter((r) => (!cat || r.category === cat) && (!s || `${r.what} ${r.category} ${r.sub ?? ''}`.toLowerCase().includes(s))).sort(BY[sort]);
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const at = Math.min(page, pages - 1);
  const shown = list.slice(at * PAGE, (at + 1) * PAGE);
  const top = useRef<HTMLDivElement>(null);
  const turn = (n: number) => { setPage(n); top.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }); };

  if (!rows.length) return null;
  return (
    <div className="ih">
      <div className="cats" role="group" aria-label="Categories">
        {cats.map(([c, { amt, n }]) => (
          <button key={c} className={`cat${cat === c ? ' on' : ''}`} aria-pressed={cat === c} onClick={() => { setCat(cat === c ? null : c); setPage(0); }}>
            <span className="cn ellipsis">{c}</span>
            <span className="num">{rupees(amt)}</span>
            <span className="small">{n} item{n > 1 ? 's' : ''} · {Math.round((amt / (total || 1)) * 100)}%</span>
            <span className="bar"><i style={{ width: `${Math.max(3, (amt / cats[0][1].amt) * 100)}%` }} /></span>
          </button>
        ))}
      </div>

      <div className="tools" ref={top}>
        <label className="search">
          <Search size={17} aria-hidden="true" />
          <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Search items" aria-label="Search items" />
        </label>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
          {SORTS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
      </div>
      <p className="sub count">
        {list.length} item{list.length === 1 ? '' : 's'}{cat ? ` in ${cat}` : ''} · {rupees(list.reduce((a, r) => a + r.amount, 0))}
        {cat && <button className="link" onClick={() => { setCat(null); setPage(0); }}>Show all</button>}
      </p>

      {shown.length ? (
        <ol className="rows card">
          {shown.map((r, i) => (
            <li key={i}>
              <button className="rowbtn" disabled={!r.detail} onClick={() => r.detail && setOpen({ what: r.what, amount: r.amount, detail: r.detail })}>
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className="w">{r.what}</span>
                  <span className="d">{[day(r.date), cat ? '' : r.category, r.sub].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="num">{rupees(r.amount)}</span>
                {r.detail && <ChevronRight size={16} className="faint" />}
              </button>
            </li>
          ))}
        </ol>
      ) : <p className="sub empty">Nothing matches &ldquo;{q}&rdquo;.</p>}

      {open && <DetailSheet item={open} who={who} onClose={() => setOpen(null)} />}
      {pages > 1 && (
        <nav className="pager" aria-label="Pages">
          <button className="btn soft" disabled={at === 0} onClick={() => turn(at - 1)} aria-label="Previous page"><ChevronLeft size={18} /></button>
          <span className="sub">{at * PAGE + 1}–{Math.min(list.length, (at + 1) * PAGE)} of {list.length}</span>
          <button className="btn soft" disabled={at === pages - 1} onClick={() => turn(at + 1)} aria-label="Next page"><ChevronRight size={18} /></button>
        </nav>
      )}
      <style jsx>{`
        .cats { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 150px), 1fr)); gap: 8px; }
        .cat { display: grid; gap: 1px; text-align: left; padding: 12px 14px; border-radius: 16px; background: var(--card); min-width: 0; transition: background .2s; }
        .cat:hover { background: var(--raised); }
        .cat.on { background: var(--ink); color: var(--bg); }
        .cn { font-weight: 600; font-size: 15px; }
        .cat .num { font-size: 18px; font-weight: 600; }
        .small { font-size: 12px; color: var(--sub); }
        .cat.on .small { color: var(--bg); opacity: .7; }
        .bar { display: block; height: 4px; border-radius: 2px; background: var(--raised); margin-top: 8px; overflow: hidden; }
        .bar i { display: block; height: 100%; border-radius: 2px; background: var(--lime); }
        .cat.on .bar { background: rgb(0 0 0 / .15); }
        .cat.on .bar i { background: var(--bg); }
        .tools { display: flex; gap: 8px; margin-top: 14px; scroll-margin-top: 16px; }
        .search { flex: 1; display: flex; align-items: center; gap: 8px; background: var(--card); border-radius: 999px; padding: 0 14px; min-height: 44px; color: var(--sub); min-width: 0; }
        .search input { flex: 1; min-width: 0; font-size: 16px; padding: 8px 0; color: var(--ink); background: none; }
        select { background: var(--card); color: var(--ink); border-radius: 999px; padding: 0 14px; min-height: 44px; font-size: 15px; color-scheme: dark; border: 0; max-width: 46%; }
        .count { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin: 10px 4px 8px; font-size: 14px; }
        .rows { list-style: none; margin: 0; padding: 4px 16px; }
        .rows li + li { border-top: .5px solid var(--line); }
        .rowbtn { display: flex; align-items: center; gap: 10px; width: 100%; padding: 11px 0; text-align: left; border-radius: 10px; }
        .rowbtn:not(:disabled):hover .w { text-decoration: underline; text-underline-offset: 3px; }
        .w { display: block; overflow-wrap: anywhere; }
        .d { display: block; font-size: 13px; color: var(--sub); margin-top: 1px; }
        .empty { padding: 16px 4px; }
        .pager { display: flex; align-items: center; justify-content: center; gap: 14px; margin-top: 12px; }
        .pager .btn { width: 44px; min-height: 44px; padding: 0; }
      `}</style>
    </div>
  );
}

// A room link: one person's sheet, a month at a time like a spreadsheet's tabs (this month first); on a wide
// screen every month sits side by side. Each month: its items with their share, the total, the balance carried in,
// what they paid, and what's carried on.
function Months({ months, who }: { months: LedgerMonth[]; who: string }) {
  const [open, setOpen] = useState<Opened | null>(null);
  const [at, setAt] = useState(months.length - 1);
  const tabs = useRef<HTMLDivElement>(null);
  useEffect(() => { setAt(months.length - 1); }, [months]);
  useEffect(() => { tabs.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [at]);
  const short = (ym: string) => monthName(ym).split(' ')[0];
  const signed = (v: number) => (v < 0 ? `−${rupees(-v)}` : rupees(v));
  return (
    <div className="sheet">
      {months.length > 1 && (
        <div className="mtabs" ref={tabs} role="tablist" aria-label="Month">
          {months.map((m, i) => (
            <button key={m.month} role="tab" aria-selected={i === at} className={`mt${i === at ? ' on' : ''}`} onClick={() => setAt(i)}>
              <span>{short(m.month)}{m.month.slice(0, 4) !== months[months.length - 1].month.slice(0, 4) ? ` ${m.month.slice(2, 4)}` : ''}</span>
              <span className="num">{signed(m.balance)}</span>
            </button>
          ))}
        </div>
      )}
      {open && <DetailSheet item={open} who={who} onClose={() => setOpen(null)} />}
      <div className="cols">
        {months.map((m, i) => {
          const last = i === months.length - 1;
          return (
            <section key={m.month} className={`card mo${i === at ? '' : ' off'}`} aria-label={monthName(m.month)}>
              <h3>{monthName(m.month)}</h3>
              {m.items.length ? (
                <ol className="items">
                  {m.items.map((it, j) => (
                    <li key={j}>
                      <button className="rowbtn" disabled={!it.detail} onClick={() => it.detail && setOpen({ what: it.what, amount: it.amount, detail: it.detail })}>
                        <span className="grow" style={{ minWidth: 0 }}><span className="w">{it.what}</span><span className="d">{day(it.date)}</span></span>
                        <span className="num">{rupees(it.amount)}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              ) : <p className="sub none">Nothing new this month</p>}
              <dl className="sum">
                <div className="tot"><dt>Total</dt><dd className="num">{rupees(m.total)}</dd></div>
                {m.old !== 0 && <div><dt>{i ? `From ${short(months[i - 1].month)}` : 'Earlier balance'}</dt><dd className="num">{signed(m.old)}</dd></div>}
                {m.paid.map((x, j) => (
                  <div key={j}><dt>{x.what}</dt><dd className="num">−{rupees(x.amount)}</dd></div>
                ))}
                <div className="bal"><dt>{last ? 'Due now' : `Carried to ${short(months[i + 1].month)}`}</dt><dd className="num">{signed(m.balance)}</dd></div>
              </dl>
            </section>
          );
        })}
      </div>
      <style jsx>{`
        .mtabs { display: flex; gap: 6px; overflow-x: auto; margin: 0 -16px 10px; padding: 2px 16px; scrollbar-width: none; }
        .mtabs::-webkit-scrollbar { display: none; }
        .mt { flex-shrink: 0; display: grid; gap: 1px; padding: 7px 14px; border-radius: 14px; background: var(--card); text-align: left; font-weight: 600; font-size: 15px; min-height: 44px; }
        .mt .num { font-size: 12px; font-weight: 500; color: var(--sub); }
        .mt.on { background: var(--ink); color: var(--bg); }
        .mt.on .num { color: var(--bg); opacity: .7; }
        .mo { padding: 16px; }
        .off { display: none; }
        h3 { font-size: 17px; font-weight: 600; margin-bottom: 4px; }
        .items { list-style: none; margin: 0; padding: 0; }
        .items li { display: flex; }
        .rowbtn { display: flex; align-items: center; gap: 12px; width: 100%; padding: 10px 0; text-align: left; }
        .rowbtn:not(:disabled):hover .w { text-decoration: underline; text-underline-offset: 3px; }
        .items li + li { border-top: .5px solid var(--line); }
        .w { display: block; overflow-wrap: anywhere; }
        .d { display: block; font-size: 13px; color: var(--sub); margin-top: 1px; }
        .none { padding: 10px 0; }
        .sum { margin: 8px -6px 0; padding: 6px 12px; border-radius: 14px; background: var(--bg); }
        .sum div { display: flex; justify-content: space-between; gap: 12px; padding: 7px 0; font-size: 15px; }
        .sum dt { color: var(--sub); min-width: 0; overflow-wrap: anywhere; }
        .sum dd { margin: 0; white-space: nowrap; }
        .sum .tot dt, .sum .tot dd { color: var(--ink); font-weight: 600; }
        .sum .bal { border-top: .5px solid var(--line); margin-top: 2px; padding-top: 10px; }
        .sum .bal dt { color: var(--ink); font-weight: 600; }
        .sum .bal dd { font-size: 18px; font-weight: 700; }
        /* a wide screen has room for the whole sheet: every month side by side */
        @media (min-width: 760px) {
          .mtabs { display: none; }
          .cols { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px; align-items: start; }
          .off { display: block; }
        }
      `}</style>
    </div>
  );
}

// The page a split link opens: what each person still owes and how to pay it. A room link shows one person's month
// sheet at a time; a trip link what everyone shares and each person's own items. On a computer: people and paying on
// the left (with the QR up, since a UPI link can't open there), the sheet on the right.
export default function SharePage({ id }: { id: string }) {
  const [view, setView] = useState<ShareView | null>(null);
  const [failed, setFailed] = useState('');
  const [qrFor, setQrFor] = useState<number | null>(null);
  const [histFor, setHistFor] = useState<number | null>(null);
  const [tab, setTab] = useState<'cats' | 'months'>('cats');
  const [pick, setPick] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const copyVpa = async () => { try { await navigator.clipboard.writeText(view!.from.vpa); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* no clipboard: the ID is on screen */ } };

  useEffect(() => {
    async function load() {
      if (!supabase) { setFailed("This site isn't connected to its database."); return; }
      const { data, error } = await supabase.rpc('get_share', { share_id: id });
      if (error) setFailed("Couldn't load this link. Check your connection and refresh.");
      else if (!data) setFailed('This link was removed or never existed.');
      else setView(data as ShareView);
    }
    load();
    // live enough: refresh when the tab comes back
    const again = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', again);
    return () => document.removeEventListener('visibilitychange', again);
  }, [id]);

  const period = view ? (view.trip ? view.trip : view.until ? `Up to ${monthName(view.until.slice(0, 7))}` : view.month ? monthName(view.month) : '') : '';
  useEffect(() => { document.title = view ? `${view.title} · ${period}` : 'Split'; }, [view, period]);
  // a room link shows one person at a time, picked from chips
  const room = !!view?.people.some((p) => p.ledger);
  const sel = view && room ? view.people.find((p) => p.id === pick) ?? view.people[0] : undefined;
  // the items behind the history: a room link's unpaid months, a trip link's unpaid payments (with the bill and who was in it)
  const rowsOf = (p: SharePerson): Row[] => p.ledger
    ? p.ledger.flatMap((m) => m.items.map((it) => ({ ...it, category: it.category ?? 'Other' })))
    : (p.history ?? []).map((h) => ({ date: h.date, what: h.what, category: h.category, amount: h.share, sub: `bill ${rupees(h.total)}, with ${h.with.join(', ')}`, detail: h.detail }));
  const nameOf = (pid: number) => view?.people.find((p) => p.id === pid)?.name.split(' ')[0] ?? '';
  const payUri = (amount: number) => simplePayUri(view!.from.vpa, view!.from.name, amount / 100, `${view!.title} ${view!.month ? monthName(view!.month) : ''}`.trim());

  return (
    // the page scrolls itself: the body is locked for the app
    <div className="scroller">
      <main className="share">
        {failed ? <p className="sub center" style={{ marginTop: '30vh' }}>{failed}</p>
          : !view ? <p className="sub center" style={{ marginTop: '30vh' }}>Loading…</p> : (
            <>
              <header>
                <p className="eyebrow" style={{ margin: 0 }}>Splits · {period}</p>
                <h1>{view.title}</h1>
                <p className="sub">From {view.from.name} · updated {ago(view.updated)}</p>
                <p className="sub">Shared with {view.people.map((p) => p.name).join(', ')}</p>
              </header>

              <div className="layout">
                <aside className="side">
              {room && view.people.length > 1 && (
                <div className="chips" role="tablist" aria-label="Whose sheet">
                  {view.people.map((p) => (
                    <button key={p.id} role="tab" aria-selected={sel?.id === p.id} className={`chip${sel?.id === p.id ? ' on' : ''}`} onClick={() => { setPick(p.id); setQrFor(null); }}>
                      {p.name.split(' ')[0]}<span className="num">{p.due ? rupees(p.due) : 'Settled'}</span>
                    </button>
                  ))}
                </div>
              )}
              <section className="people">
                {(sel ? [sel] : view.people).map((p) => (
                  <article key={p.id} className="card person">
                    <div className="row">
                      <Avatar name={p.name} size={40} />
                      <div className="grow" style={{ minWidth: 0 }}>
                        <p className="ellipsis" style={{ fontWeight: 600 }}>{p.name}</p>
                        {/* room links: the month sheet below says all this, line by line */}
                        {p.ledger && <p className="sub" style={{ fontSize: 14 }}>{p.due ? 'Due now' : 'All paid up'}</p>}
                        {!p.ledger && <p className="sub" style={{ fontSize: 14 }}>
                          {[
                            p.paid ? `${rupees(p.paid)} paid` : '',
                            ...p.carried.map((c) => `${rupees(c.amount)} from ${monthName(c.month).split(' ')[0]}`),
                            p.opening ? `${rupees(p.opening)} previous balance` : '',
                            p.partPaid ? `${rupees(p.partPaid)} paid in part` : '',
                            p.oweBack ? `${rupees(p.oweBack)} owed back to them` : '',
                          ].filter(Boolean).join(' · ')}
                        </p>}
                      </div>
                      {p.due ? <p className="num due">{rupees(p.due)}</p> : <p className="settled"><Check size={16} /> Settled</p>}
                    </div>
                    {p.due > 0 && view.from.vpa && (
                      <>
                        <div className="pay">
                          <a className="btn lime" href={payUri(p.due)}>Pay {rupees(p.due)}</a>
                          <button className="btn soft" aria-label={`Show QR to pay ${p.name}'s share`} aria-pressed={qrFor === p.id} onClick={() => setQrFor(qrFor === p.id ? null : p.id)}><QrCode size={18} /></button>
                        </div>
                        <div className={`qr${qrFor === p.id ? ' open' : ''}`}>
                          <div className="code" dangerouslySetInnerHTML={{ __html: renderSVG(payUri(p.due), { border: 1 }) }} />
                          <p className="sub">Scan with any UPI app to pay {rupees(p.due)}</p>
                          <button className="btn soft copy" onClick={copyVpa}>{copied ? <><Check size={16} /> Copied</> : <><Copy size={16} /> {view.from.vpa}</>}</button>
                        </div>
                      </>
                    )}
                    {!!p.history?.length && (
                      <>
                        <button className="hist-btn" aria-expanded={histFor === p.id} onClick={() => setHistFor(histFor === p.id ? null : p.id)}>
                          <span className="grow">History · {p.history.length} {p.history.length === 1 ? 'payment' : 'payments'}</span>
                          <ChevronRight size={17} className={histFor === p.id ? 'down' : ''} />
                        </button>
                        {histFor === p.id && <div style={{ marginTop: 12 }}><ItemHistory rows={rowsOf(p)} who={p.name.split(' ')[0]} /></div>}
                      </>
                    )}
                  </article>
                ))}
              </section>

                </aside>
                <div className="body">
              {sel?.ledger && (sel.ledger.length ? (
                <>
                  <div className="tabs" role="tablist" aria-label="View">
                    <button role="tab" aria-selected={tab === 'cats'} className={tab === 'cats' ? 'on' : ''} onClick={() => setTab('cats')}>By category</button>
                    <button role="tab" aria-selected={tab === 'months'} className={tab === 'months' ? 'on' : ''} onClick={() => setTab('months')}>By month</button>
                  </div>
                  {tab === 'cats' ? <ItemHistory key={sel.id} rows={rowsOf(sel)} who={sel.name.split(' ')[0]} /> : <Months key={sel.id} months={sel.ledger} who={sel.name.split(' ')[0]} />}
                </>
              ) : (
                <div className="card done">
                  <Check size={26} style={{ color: 'var(--lime)' }} />
                  <p style={{ fontWeight: 600, fontSize: 18 }}>{sel.name.split(' ')[0]} is all paid up</p>
                  <p className="sub">Nothing unpaid{view.until ? ` up to ${monthName(view.until.slice(0, 7))}` : ''}.</p>
                </div>
              ))}

              {!room && view.shared.length > 0 && (
                <>
                  <h2 className="eyebrow">Everyone equally</h2>
                  <div className="list flush">
                    {view.shared.map((l, i) => (
                      <div key={i} className="item line">
                        <span className="grow" style={{ minWidth: 0 }}>
                          <span className="ellipsis" style={{ display: 'block' }}>{l.what}</span>
                          <span className="sub" style={{ fontSize: 14 }}>{day(l.date)} · {rupees(l.total)} ÷ {l.count}{l.paidBy.length ? ` · paid: ${l.paidBy.map(nameOf).join(', ')}` : ''}</span>
                        </span>
                        <span className="num">{rupees(l.each)}<span className="sub" style={{ fontSize: 13, marginLeft: 3 }}>each</span></span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {!room && view.people.filter((p) => p.own.length).map((p) => (
                <div key={p.id}>
                  <h2 className="eyebrow">Just {p.name.split(' ')[0]}</h2>
                  <div className="list flush">
                    {p.own.map((l, i) => (
                      <div key={i} className="item line">
                        <span className="grow" style={{ minWidth: 0 }}><span className="ellipsis" style={{ display: 'block' }}>{l.what}</span><span className="sub" style={{ fontSize: 14 }}>{day(l.date)}</span></span>
                        {l.paid && <Check size={16} style={{ color: 'var(--lime)' }} aria-label="Paid" />}
                        <span className={`num${l.paid ? ' paid' : ''}`}>{rupees(l.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {!room && !view.shared.length && !view.people.some((p) => p.own.length) && <p className="sub center" style={{ marginTop: 32 }}>Nothing split {view.month ? 'this month' : 'yet'}.</p>}
              {!room && view.people.some((p) => p.carried.length) && <p className="hint" style={{ marginTop: 20 }}>Anything unpaid from an earlier month is carried into this one until it&apos;s paid.</p>}
                </div>
              </div>
              <p className="hint center" style={{ margin: '32px 0' }}>Made with MyUPI</p>
            </>
          )}
      </main>
      <style jsx>{`
        .scroller { position: fixed; inset: 0; overflow-y: auto; scrollbar-width: none; }
        .scroller::-webkit-scrollbar { display: none; }
        .share { max-width: 720px; margin: 0 auto; padding: calc(env(safe-area-inset-top) + 28px) 16px 24px; min-height: 100dvh; }
        header { margin-bottom: 20px; }
        h1 { font-size: 34px; font-weight: 700; letter-spacing: -0.03em; margin: 2px 0; }
        .people { display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr)); }
        .person { padding: 16px; }
        .due { font-size: 22px; font-weight: 700; color: var(--lime); }
        .settled { display: flex; align-items: center; gap: 4px; color: var(--sub); font-weight: 500; }
        .pay { display: grid; grid-template-columns: 1fr auto; gap: 8px; margin-top: 14px; }
        .pay .btn { text-decoration: none; }
        .pay .soft { width: 52px; padding: 0; }
        .qr { display: none; justify-items: center; gap: 8px; margin-top: 14px; }
        .qr.open { display: grid; }
        .copy { min-height: 40px; font-size: 14px; padding: 0 14px; max-width: 100%; }
        .first { margin-top: 18px; }
        .done { display: grid; justify-items: center; gap: 4px; text-align: center; padding: 28px 20px; margin-top: 18px; }
        .code :global(svg) { width: 200px; height: 200px; background: #fff; border-radius: 12px; padding: 6px; display: block; }
        .line { gap: 12px; }
        .paid { color: var(--faint); text-decoration: line-through; }
        .hist-btn { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 44px; margin-top: 12px; padding-top: 10px;
          border-top: .5px solid var(--line); color: var(--sub); font-size: 15px; text-align: left; }
        .hist-btn :global(.down) { transform: rotate(90deg); }
        .tabs { display: inline-flex; gap: 4px; padding: 4px; border-radius: 999px; background: var(--card); margin: 18px 0 12px; }
        .tabs button { padding: 0 16px; min-height: 36px; border-radius: 999px; font-weight: 600; font-size: 15px; color: var(--sub); }
        .tabs .on { background: var(--raised); color: var(--ink); }
        /* people: equal cards, two to a row on a phone (more on wider screens), so nobody ends up alone on a line */
        .chips { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 140px), 1fr)); gap: 8px; margin: 0 0 12px; }
        .chip { display: grid; gap: 1px; text-align: left; padding: 10px 14px; border-radius: 16px; background: var(--card); font-weight: 600; min-height: 52px; min-width: 0; }
        .chip:not(.on):hover { background: var(--raised); }
        .chip .num { font-size: 13px; font-weight: 500; color: var(--sub); }
        .chip.on { background: var(--lime); color: var(--on-lime); }
        .chip.on .num { color: var(--on-lime); opacity: .75; }
        /* a computer: people and paying on the left, held in place; the sheet on the right */
        @media (min-width: 900px) {
          .share { max-width: 1160px; padding: 48px 32px 24px; }
          h1 { font-size: 44px; }
          header { margin-bottom: 28px; }
          .layout { display: grid; grid-template-columns: 340px minmax(0, 1fr); gap: 32px; align-items: start; }
          .side { position: sticky; top: 24px; }
          .chips { grid-template-columns: 1fr; gap: 6px; }
          .chip { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 16px; }
          .chip:not(.on):hover { background: var(--raised); }
          .chip .num { font-size: 14px; }
          .people { grid-template-columns: 1fr; }
          .pay { display: none; } /* a UPI link can't open on a computer: the QR is up instead */
          .qr { display: grid; }
          .first { margin-top: 0; }
          .tabs { margin-top: 0; }
          .done { margin-top: 0; }
        }
      `}</style>
    </div>
  );
}
