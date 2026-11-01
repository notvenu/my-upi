'use client';
import { ChevronLeft, ChevronRight, TrendingDown, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import CatIcon from '@/components/CatIcon';
import NavBar from '@/components/NavBar';
import Segmented from '@/components/Segmented';
import Sheet from '@/components/Sheet';
import TxnRow from '@/components/TxnRow';
import { chartScale, monthTxns } from '@/lib/db';
import { setNav } from '@/lib/nav';
import { haptic, monthName, shortDate, spentOf, ym, ymd } from '@/lib/ui';
import { rupees } from '@/lib/upi';

const pct = (v: number, of: number) => Math.round((v / (of || 1)) * 100);
// Donut colours: the top five categories in fixed slot order (validated for colour-blind separation between
// neighbouring slices on the dark card), everything else folded into one grey slice.
const SLOTS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'];
const REST = '#5a5a5e';
const debitsByCat = (list: { direction: string; status: string; category: string; amount: number }[]) => {
  const m = new Map<string, { amt: number; n: number }>();
  for (const t of list) {
    if (t.direction !== 'debit' || t.status === 'FAILURE') continue;
    const c = m.get(t.category) ?? { amt: 0, n: 0 };
    m.set(t.category, { amt: c.amt + t.amount, n: c.n + 1 });
  }
  return m;
};

// Part-to-whole ring, 2px card-coloured gaps between slices. Hover or tap a slice to read it in the middle.
function Donut({ slices, total, active, onActive, onPick }: {
  slices: { key: string; label: string; value: number; color: string }[]; total: number;
  active: string | null; onActive: (k: string | null) => void; onPick: (k: string) => void;
}) {
  const r = 80, C = 2 * Math.PI * r, gap = slices.length > 1 ? 2 : 0;
  let at = 0;
  const on = slices.find((s) => s.key === active);
  return (
    <div className="donut" onPointerLeave={() => onActive(null)}>
      <svg viewBox="0 0 200 200" role="img" aria-label={`Spending by category: ${slices.map((s) => `${s.label} ${pct(s.value, total)}%`).join(', ')}`}>
        <g transform="rotate(-90 100 100)">
          {slices.map((s) => {
            const len = (s.value / total) * C;
            const el = (
              <circle key={s.key} cx="100" cy="100" r={r} fill="none" stroke={s.color} strokeWidth={active === s.key ? 26 : 22}
                strokeDasharray={`${Math.max(0.5, len - gap)} ${C}`} strokeDashoffset={-at} opacity={active && active !== s.key ? 0.35 : 1}
                onPointerEnter={() => onActive(s.key)} onClick={() => onPick(s.key)} style={{ cursor: 'pointer', transition: 'opacity .2s, stroke-width .2s' }} />
            );
            at += len;
            return el;
          })}
        </g>
      </svg>
      <div className="mid" aria-live="polite">
        <span className="sub ellipsis" style={{ fontSize: 13, maxWidth: 120 }}>{on ? on.label : 'Spent'}</span>
        <span className="num" style={{ fontSize: 22, fontWeight: 700 }}>{rupees(on ? on.value : total)}</span>
        <span className="sub" style={{ fontSize: 13 }}>{on ? `${pct(on.value, total)}% of the month` : 'this month'}</span>
      </div>
      <style jsx>{`
        .donut { position: relative; width: min(100%, 240px); margin: 0 auto; aspect-ratio: 1; }
        svg { width: 100%; height: 100%; display: block; overflow: visible; }
        .mid { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; text-align: center; pointer-events: none; }
      `}</style>
    </div>
  );
}

// Change against last month, in words and an arrow (not colour alone).
function Delta({ now, before, short }: { now: number; before: number; short: string }) {
  if (!before) return <span className="sub" style={{ fontSize: 13 }}>{now ? `New this month` : ''}</span>;
  const d = now - before;
  if (!d) return <span className="sub" style={{ fontSize: 13 }}>Same as {short}</span>;
  const Icon = d > 0 ? TrendingUp : TrendingDown;
  return (
    <span className="sub" style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      <Icon size={14} aria-hidden="true" />{rupees(Math.abs(d))} {d > 0 ? 'more' : 'less'} than {short}
    </span>
  );
}

export default function Insights() {
  const today = ymd(new Date());
  const thisMonth = ym(new Date());
  const [view, setView] = useState<'calendar' | 'categories'>('calendar');
  const [month, setMonth] = useState(thisMonth);
  const [day, setDay] = useState(today);
  const [catOpen, setCatOpen] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [dir, setDir] = useState(1); // which way the month content slides

  const txns = monthTxns(month);
  const counted = txns.filter((t) => t.status !== 'FAILURE');
  const spent = spentOf(txns);
  const received = counted.filter((t) => t.direction === 'credit').reduce((a, t) => a + t.amount, 0);
  const scale = chartScale();

  function shift(n: number) {
    haptic();
    setDir(n);
    const [y, m] = month.split('-').map(Number);
    const next = ym(new Date(y, m - 1 + n, 1));
    setMonth(next);
    setDay(next === thisMonth ? today : `${next}-01`);
  }

  // The month as a grid of days, shaded on one fixed scale: the same shade means the same rupees in every month.
  const [y, m] = month.split('-').map(Number);
  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7; // Monday first
  const byDay = Array.from({ length: new Date(y, m, 0).getDate() }, (_, i) => spentOf(txns.filter((t) => +t.created_at.slice(8, 10) === i + 1)));
  const level = (v: number) => (v <= 0 ? 0 : Math.min(4, Math.ceil((v / scale.day) * 4)));
  const dayList = txns.filter((t) => t.created_at.startsWith(day));

  const cats = [...debitsByCat(counted)].sort((a, b) => b[1].amt - a[1].amt);
  // last month, for comparison
  const prev = ym(new Date(y, m - 2, 1));
  const prevShort = monthName(prev).split(' ')[0];
  const prevTxns = monthTxns(prev);
  const prevBy = debitsByCat(prevTxns);
  const prevSpent = spentOf(prevTxns);
  const colorOf = (cat: string) => { const i = cats.findIndex(([c]) => c === cat); return i >= 0 && i < SLOTS.length ? SLOTS[i] : REST; };
  const rest = cats.slice(SLOTS.length);
  const slices = [
    ...cats.slice(0, SLOTS.length).map(([c, v], i) => ({ key: c, label: c, value: v.amt, color: SLOTS[i] })),
    ...(rest.length ? [{ key: '__rest', label: `${rest.length} more`, value: rest.reduce((a, [, v]) => a + v.amt, 0), color: REST }] : []),
  ];
  const debits = counted.filter((t) => t.direction === 'debit');
  const days = month === thisMonth ? +today.slice(8, 10) : new Date(y, m, 0).getDate();
  const biggest = debits.reduce<typeof debits[number] | null>((a, t) => (!a || t.amount > a.amount ? t : a), null);
  const payees = [...debits.reduce((mp, t) => { const k = t.payee_name || t.note || t.category; return mp.set(k, (mp.get(k) ?? 0) + t.amount); }, new Map<string, number>())]
    .sort((a, b) => b[1] - a[1]).slice(0, 5);
  const catTxns = counted.filter((t) => t.category === catOpen && t.direction === 'debit');
  const catTotal = catTxns.reduce((a, t) => a + t.amount, 0);
  const subs = new Map<string, number>();
  for (const t of catTxns) subs.set(t.subcategory || 'No subcategory', (subs.get(t.subcategory || 'No subcategory') ?? 0) + t.amount);
  const catSubs = [...subs].sort((a, b) => b[1] - a[1]);

  return (
    <div className="page">
      <NavBar title="Insights" />

      <div className="month row">
        <button className="icon-btn" aria-label="Previous month" onClick={() => shift(-1)}><ChevronLeft size={20} strokeWidth={2.4} /></button>
        <h2 className="grow center">{monthName(month)}</h2>
        <button className="icon-btn" aria-label="Next month" disabled={month >= thisMonth} onClick={() => shift(1)}><ChevronRight size={20} strokeWidth={2.4} /></button>
      </div>

      <div key={month} className="slide-in" style={{ ['--dir' as string]: dir }}>
        <div className="center" style={{ margin: '14px 0 18px' }}>
          <p className="num" style={{ fontSize: 48, lineHeight: 1.05, fontWeight: 700, letterSpacing: '-0.04em' }}>{rupees(spent)}</p>
          <p className="sub">spent{received ? ` · ${rupees(received)} received` : ''}{view === 'categories' && cats.length ? ` · ${cats.length} categories` : ''}</p>
        </div>

        <div style={{ marginBottom: 14 }}>
          <Segmented options={[['calendar', 'Calendar'], ['categories', 'Categories']] as const} value={view} onChange={setView} />
        </div>

        {view === 'calendar' ? (
          <div className="split">
            <div className="card side">
              <div className="cal">
                {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i} className="wd">{d}</span>)}
                {Array.from({ length: lead }, (_, i) => <span key={`l${i}`} />)}
                {byDay.map((v, i) => {
                  const iso = `${month}-${String(i + 1).padStart(2, '0')}`;
                  return (
                    <button key={iso} className={`day lv${level(v)}${iso === day ? ' sel' : ''}${iso === today ? ' today' : ''}`} disabled={iso > today}
                      aria-label={`${shortDate(iso)}, ${v ? `spent ${rupees(v)}` : 'no spending'}`} aria-pressed={iso === day}
                      onClick={() => { haptic(); setDay(iso); }}>{i + 1}</button>
                  );
                })}
              </div>
              <div className="legend" aria-hidden="true">Less {[0, 1, 2, 3, 4].map((lv) => <i key={lv} className={`lv${lv}`} />)} More</div>
            </div>
            <section>
              <h2 className="eyebrow"><span>{shortDate(day)}</span>{spentOf(dayList) > 0 && <span className="num" style={{ letterSpacing: 0 }}>{rupees(spentOf(dayList))}</span>}</h2>
              {dayList.length
                ? <div className="list wide">{dayList.map((t) => <TxnRow key={t.id} t={t} onClick={() => setNav({ editing: t })} />)}</div>
                : <p className="sub" style={{ margin: '0 16px' }}>No payments on this day.</p>}
            </section>
          </div>
        ) : cats.length ? (
          <div className="split">
            <div className="side">
              <div className="card" style={{ padding: 20 }}>
                <Donut slices={slices} total={spent} active={active} onActive={setActive}
                  onPick={(k) => { haptic(); if (k === '__rest') setActive(k); else setCatOpen(k); }} />
              </div>
              <div className="tiles">
                <div className="card tile"><span className="sub">Daily average</span><span className="num">{rupees(Math.round(spent / days / 100) * 100)}</span><span className="sub small">over {days} day{days > 1 ? 's' : ''}</span></div>
                <div className="card tile"><span className="sub">vs {prevShort}</span>
                  <span className="num">{prevSpent ? `${spent >= prevSpent ? '+' : '−'}${Math.abs(pct(spent - prevSpent, prevSpent))}%` : '–'}</span>
                  <span className="sub small">{prevSpent ? `${rupees(prevSpent)} in ${prevShort}` : `Nothing in ${prevShort}`}</span></div>
                <div className="card tile"><span className="sub">Payments</span><span className="num">{debits.length}</span><span className="sub small">{rupees(Math.round(spent / (debits.length || 1) / 100) * 100)} on average</span></div>
                {biggest && (
                  <button className="card tile" onClick={() => setNav({ editing: biggest })}><span className="sub">Biggest</span><span className="num">{rupees(biggest.amount)}</span>
                    <span className="sub small ellipsis">{biggest.payee_name || biggest.note || biggest.category}</span></button>
                )}
              </div>
            </div>
            <section>
              <h2 className="eyebrow">By category</h2>
              <div className="list wide">
                {cats.map(([cat, { amt, n }]) => (
                  <button key={cat} className={`item catrow${active && active !== cat && !(active === '__rest' && colorOf(cat) === REST) ? ' dim' : ''}`}
                    onPointerEnter={() => setActive(colorOf(cat) === REST ? '__rest' : cat)} onPointerLeave={() => setActive(null)}
                    onClick={() => { haptic(); setCatOpen(cat); }} aria-label={`${cat}, ${rupees(amt)}, ${pct(amt, spent)} percent, ${n} payments`}>
                    <CatIcon cat={cat} size={40} />
                    <span className="grow" style={{ minWidth: 0 }}>
                      <span className="row" style={{ gap: 8 }}><i className="sw" style={{ background: colorOf(cat) }} /><span className="ellipsis">{cat}</span></span>
                      <span className="share"><i style={{ width: `${Math.max(2, pct(amt, cats[0][1].amt))}%`, background: colorOf(cat) }} /></span>
                      <Delta now={amt} before={prevBy.get(cat)?.amt ?? 0} short={prevShort} />
                    </span>
                    <span style={{ display: 'grid', justifyItems: 'end' }}>
                      <span className="num">{rupees(amt)}</span>
                      <span className="sub num" style={{ fontSize: 13 }}>{pct(amt, spent)}% · {n}×</span>
                    </span>
                  </button>
                ))}
              </div>
              {payees.length > 1 && (
                <>
                  <h2 className="eyebrow">Where it went most</h2>
                  <div className="list flush">
                    {payees.map(([name, v]) => (
                      <div key={name} className="item" style={{ minHeight: 52 }}>
                        <span className="grow ellipsis">{name}</span>
                        <span className="sub num">{pct(v, spent)}%</span>
                        <span className="num">{rupees(v)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </section>
          </div>
        ) : (
          <div className="card center" style={{ padding: '32px 20px' }}>
            <p style={{ fontWeight: 600 }}>No spending yet</p>
            <p className="sub">Each category you spend in this month gets a tile here.</p>
          </div>
        )}
      </div>

      {catOpen && (
        <Sheet onClose={() => setCatOpen(null)}>
          <div className="row" style={{ marginBottom: 8 }}>
            <CatIcon cat={catOpen} size={56} />
            <div className="grow">
              <p style={{ fontWeight: 600 }}>{catOpen}</p>
              <p className="num" style={{ fontSize: 32, lineHeight: 1.1 }}>{rupees(catTotal)}</p>
              <p className="sub">{monthName(month)} · <Delta now={catTotal} before={prevBy.get(catOpen)?.amt ?? 0} short={prevShort} /></p>
            </div>
          </div>
          <h3 className="eyebrow">Subcategories</h3>
          <div className="list flush">
            {catSubs.map(([sub, v]) => (
              <div key={sub} className="item" style={{ minHeight: 52 }}>
                <span className={`grow${sub === 'No subcategory' ? ' faint' : ''}`} style={{ minWidth: 0 }}>{sub}
                  <span className="share"><i style={{ width: `${Math.max(2, pct(v, catSubs[0][1]))}%`, background: colorOf(catOpen) }} /></span></span>
                <span className="sub num">{pct(v, catTotal)}%</span>
                <span className="num">{rupees(v)}</span>
              </div>
            ))}
          </div>
          <h3 className="eyebrow">Payments</h3>
          <div className="list wide">{catTxns.map((t) => <TxnRow key={t.id} t={t} showDate onClick={() => { setCatOpen(null); setNav({ editing: t }); }} />)}</div>
        </Sheet>
      )}

      <style jsx>{`
        .month { gap: 8px; }
        .month h2 { font-size: 17px; font-weight: 600; }
        .cal { display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px; }
        .wd { text-align: center; font-size: 12px; color: var(--sub); font-weight: 500; padding-bottom: 4px; }
        .day { aspect-ratio: 1; border-radius: 50%; font-size: 13px; font-weight: 500; display: grid; place-items: center; transition: transform .35s var(--spring), box-shadow .2s; }
        .day:active { transform: scale(.86); transition-duration: .1s; }
        .day:disabled { opacity: .3; }
        .lv0 { background: var(--raised); }
        .lv1 { background: color-mix(in srgb, var(--green) 22%, var(--card)); }
        .lv2 { background: color-mix(in srgb, var(--green) 45%, var(--card)); }
        .lv3 { background: color-mix(in srgb, var(--green) 72%, var(--card)); color: #0B0B0B; }
        .lv4 { background: var(--green); color: #0B0B0B; }
        .day.today { font-weight: 700; text-decoration: underline 2px; text-underline-offset: 3px; }
        .day.sel { box-shadow: 0 0 0 2px var(--card), 0 0 0 3.5px var(--ink); font-weight: 700; transform: scale(1.02); }
        .legend { display: flex; justify-content: flex-end; align-items: center; gap: 4px; font-size: 12px; color: var(--sub); margin-top: 10px; }
        .legend i { width: 12px; height: 12px; border-radius: 50%; }
        .tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
        .tile { display: grid; gap: 2px; text-align: left; padding: 14px 16px; min-width: 0; }
        .tile .num { font-size: 22px; font-weight: 600; }
        .small { font-size: 13px; }
        .catrow { transition: opacity .2s; }
        .catrow.dim { opacity: .45; }
        .sw { width: 10px; height: 10px; border-radius: 3px; flex-shrink: 0; }
        .page :global(.share) { display: block; height: 4px; border-radius: 2px; background: var(--raised); margin: 6px 0 4px; overflow: hidden; }
        .page :global(.share i) { display: block; height: 100%; border-radius: 2px; }
      `}</style>
    </div>
  );
}
