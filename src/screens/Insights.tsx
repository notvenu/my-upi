'use client';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import CatIcon from '@/components/CatIcon';
import NavBar from '@/components/NavBar';
import Segmented from '@/components/Segmented';
import Sheet from '@/components/Sheet';
import TxnRow from '@/components/TxnRow';
import { chartScale, monthTxns } from '@/lib/db';
import { setNav } from '@/lib/nav';
import { catHue, haptic, monthName, shortDate, spentOf, ym, ymd } from '@/lib/ui';
import { rupees } from '@/lib/upi';

const pct = (v: number, of: number) => Math.round((v / (of || 1)) * 100);

export default function Insights() {
  const today = ymd(new Date());
  const thisMonth = ym(new Date());
  const [view, setView] = useState<'calendar' | 'categories'>('calendar');
  const [month, setMonth] = useState(thisMonth);
  const [day, setDay] = useState(today);
  const [catOpen, setCatOpen] = useState<string | null>(null);
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

  const by = new Map<string, { amt: number; n: number }>();
  for (const t of counted) {
    if (t.direction !== 'debit') continue;
    const c = by.get(t.category) ?? { amt: 0, n: 0 };
    by.set(t.category, { amt: c.amt + t.amount, n: c.n + 1 });
  }
  const cats = [...by].sort((a, b) => b[1].amt - a[1].amt);
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
          <div className="cats">
            {cats.map(([cat, { amt, n }], i) => (
              <button key={cat} className="card cat rise" style={{ animationDelay: `${i * 30}ms` }} onClick={() => { haptic(); setCatOpen(cat); }}
                aria-label={`${cat}, ${rupees(amt)}, ${pct(amt, spent)} percent, ${n} payments`}>
                <span className="row" style={{ justifyContent: 'space-between' }}><CatIcon cat={cat} size={40} /><span className="sub num">{pct(amt, spent)}%</span></span>
                <span style={{ fontWeight: 500, marginTop: 12 }}>{cat}</span>
                <span className="num" style={{ fontSize: 22 }}>{rupees(amt)}</span>
                <span className="sub">{n} payment{n > 1 ? 's' : ''}</span>
                {/* bar lengths share one scale across months */}
                <span className="bar"><i style={{ width: `${Math.max(3, (amt / scale.category) * 100)}%`, background: catHue(cat) }} /></span>
              </button>
            ))}
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
              <p className="sub">{monthName(month)}</p>
            </div>
          </div>
          <h3 className="eyebrow">Subcategories</h3>
          <div className="list flush">
            {catSubs.map(([sub, v]) => (
              <div key={sub} className="item" style={{ minHeight: 52 }}>
                <span className={`grow${sub === 'No subcategory' ? ' faint' : ''}`}>{sub}</span>
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
        .cats { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 160px), 1fr)); gap: 10px; }
        @media (min-width: 1100px) { .cats { grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); } }
        .cat { display: grid; text-align: left; gap: 1px; transition: transform .45s var(--spring); }
        .cat:active { transform: scale(.95); transition-duration: .1s; background: var(--card) !important; }
        .bar { height: 6px; border-radius: 3px; background: var(--raised); margin-top: 12px; overflow: hidden; display: block; }
        .bar i { display: block; height: 100%; border-radius: 3px; }
      `}</style>
    </div>
  );
}
