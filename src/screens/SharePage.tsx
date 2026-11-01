'use client';
import { Check, ChevronDown, QrCode } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { renderSVG } from 'uqr';
import Avatar from '@/components/Avatar';
import type { HistoryLine, LedgerMonth, ShareView } from '@/lib/share';
import { supabase } from '@/lib/sync';
import { rupees, simplePayUri } from '@/lib/upi';

const monthName = (ym: string) => new Date(`${ym}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
const day = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60e3);
  return m < 2 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : day(iso.slice(0, 10));
};

// One person's split history by month: each payment with the bill, their share, who else was in it, and the items.
function History({ lines }: { lines: HistoryLine[] }) {
  return (
    <div className="hist">
      {lines.map((h, i) => {
        const month = h.date.slice(0, 7);
        const sub = [day(h.date), h.payee && h.payee !== h.what ? h.payee : '', h.category, h.place, h.trip].filter(Boolean).join(' · ');
        return (
          <div key={i} className="w">
            {month !== lines[i - 1]?.date.slice(0, 7) && <h3 className="eyebrow">{monthName(month)}</h3>}
            <div className="entry">
              <div className="top">
                <span className="grow" style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 600 }}>{h.what}</span>
                  <span className="sub" style={{ display: 'block', fontSize: 14 }}>{sub}</span>
                </span>
                <span className="amt">
                  <span className={`num${h.paid ? ' paid' : ''}`}>{rupees(h.share)}</span>
                  <span className={`tag${h.paid ? ' done' : ''}`}>{h.paid ? <><Check size={12} /> Paid</> : 'Due'}</span>
                </span>
              </div>
              <p className="sub meta">Bill {rupees(h.total)} · split with {h.with.join(', ')}</p>
              {h.items.length > 0 && (
                <ul className="items">
                  {h.items.map((it, j) => (
                    <li key={j}><span className="grow">{it.name}<span className="sub"> · {it.who.join(', ')}</span></span><span className="num">{rupees(it.amount)}</span></li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        );
      })}
      <style jsx>{`
        .hist { margin-top: 4px; }
        .hist .eyebrow { margin: 14px 0 6px; }
        .entry { padding: 10px 0; }
        .w + .w .entry { border-top: .5px solid var(--line); }
        .w + .w .eyebrow + .entry { border-top: 0; }
        .top { display: flex; gap: 12px; align-items: flex-start; }
        .amt { display: grid; justify-items: end; gap: 4px; }
        .tag { display: inline-flex; align-items: center; gap: 3px; font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: 999px;
          background: var(--raised); color: var(--sub); }
        .tag.done { background: var(--lime); color: var(--on-lime); }
        .paid { color: var(--faint); text-decoration: line-through; }
        .meta { font-size: 14px; margin-top: 4px; }
        .items { list-style: none; margin: 8px 0 0; padding: 8px 12px; border-radius: 12px; background: var(--bg); display: grid; gap: 6px; font-size: 14px; }
        .items li { display: flex; gap: 10px; }
      `}</style>
    </div>
  );
}

// A room link: one person's months side by side, like columns in a spreadsheet, scrolled to this month.
// Each month: its items with their share, the total, the balance carried in, what they paid, and what's carried on.
function Months({ months }: { months: LedgerMonth[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) ref.current.scrollLeft = ref.current.scrollWidth; }, [months]);
  const short = (ym: string) => monthName(ym).split(' ')[0];
  const noDate = (what: string) => what === 'Marked paid' || what === 'Settled';
  return (
    <div className="months" ref={ref} tabIndex={0} aria-label="Month by month">
      {months.map((m, i) => {
        const last = i === months.length - 1;
        return (
          <section key={m.month} className="card mo" aria-label={monthName(m.month)}>
            <h3>{monthName(m.month)}</h3>
            <table>
              <tbody>
                {m.items.map((it, j) => (
                  <tr key={j}><td className="n">{j + 1}</td><td className="d">{day(it.date)}</td><td className="w">{it.what}</td><td className="num a">{rupees(it.amount)}</td></tr>
                ))}
                {!m.items.length && <tr><td colSpan={4} className="sub none">Nothing new this month</td></tr>}
              </tbody>
              <tfoot>
                <tr className="tot"><td colSpan={3}>Total</td><td className="num a">{rupees(m.total)}</td></tr>
                {m.old !== 0 && <tr><td colSpan={3}>{i ? `From ${short(months[i - 1].month)}` : 'Earlier balance'}</td><td className="num a">{rupees(m.old)}</td></tr>}
                {m.paid.map((x, j) => (
                  <tr key={j} className="minus"><td colSpan={3}>{noDate(x.what) ? x.what : `${day(x.date)} · ${x.what}`}</td><td className="num a">−{rupees(x.amount)}</td></tr>
                ))}
                <tr className="bal"><td colSpan={3}>{last ? 'Due now' : `Carried to ${short(months[i + 1].month)}`}</td>
                  <td className="num a">{m.balance < 0 ? `−${rupees(-m.balance)}` : rupees(m.balance)}</td></tr>
              </tfoot>
            </table>
          </section>
        );
      })}
      <style jsx>{`
        .months { display: flex; gap: 10px; overflow-x: auto; scroll-snap-type: x mandatory; margin: 0 -16px; padding: 2px 16px 8px; scrollbar-width: thin; }
        .mo { flex: 0 0 min(86%, 340px); scroll-snap-align: end; padding: 16px; }
        h3 { font-size: 17px; font-weight: 600; margin-bottom: 8px; }
        table { width: 100%; border-collapse: collapse; font-size: 15px; }
        td { padding: 6px 0; vertical-align: top; }
        tbody tr + tr td { border-top: .5px solid var(--line); }
        .n { width: 22px; color: var(--faint); font-size: 13px; padding-top: 8px; }
        .d { width: 58px; color: var(--sub); font-size: 13px; padding-top: 8px; white-space: nowrap; }
        .w { padding-right: 10px; overflow-wrap: anywhere; }
        .a { text-align: right; white-space: nowrap; }
        .none { padding: 8px 0; }
        tfoot td { color: var(--sub); }
        tfoot .a { color: var(--ink); }
        .tot td { border-top: 1px solid var(--line); padding-top: 10px; font-weight: 600; color: var(--ink); }
        .bal td { border-top: 1px solid var(--line); padding-top: 10px; font-weight: 700; color: var(--ink); font-size: 16px; }
      `}</style>
    </div>
  );
}

// The page a split link opens: what everyone shares equally, what's on each person, what's carried over, how to pay,
// and each person's full history.
export default function SharePage({ id }: { id: string }) {
  const [view, setView] = useState<ShareView | null>(null);
  const [failed, setFailed] = useState('');
  const [qrFor, setQrFor] = useState<number | null>(null);
  const [histFor, setHistFor] = useState<number | null>(null);
  const [pick, setPick] = useState<number | null>(null);

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

  const period = view ? (view.trip ? view.trip : view.month ? monthName(view.month) : '') : '';
  useEffect(() => { document.title = view ? `${view.title} · ${period}` : 'Split'; }, [view, period]);
  // a room link shows one person at a time, picked from chips
  const room = !!view?.people.some((p) => p.ledger);
  const sel = view && room ? view.people.find((p) => p.id === pick) ?? view.people[0] : undefined;
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
                        {qrFor === p.id && (
                          <div className="qr">
                            <div className="code" dangerouslySetInnerHTML={{ __html: renderSVG(payUri(p.due), { border: 1 }) }} />
                            <p className="sub">Scan with any UPI app · {view.from.vpa}</p>
                          </div>
                        )}
                      </>
                    )}
                    {!!p.history?.length && (
                      <>
                        <button className="hist-btn" aria-expanded={histFor === p.id} onClick={() => setHistFor(histFor === p.id ? null : p.id)}>
                          <span className="grow">History · {p.history.length} {p.history.length === 1 ? 'payment' : 'payments'}</span>
                          <ChevronDown size={17} className={histFor === p.id ? 'up' : ''} />
                        </button>
                        {histFor === p.id && <History lines={p.history} />}
                      </>
                    )}
                  </article>
                ))}
              </section>

              {sel?.ledger && (
                <>
                  <h2 className="eyebrow">Month by month</h2>
                  <Months months={sel.ledger} />
                </>
              )}

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
              <p className="hint center" style={{ margin: '32px 0' }}>Made with MyUPI</p>
            </>
          )}
      </main>
      <style jsx>{`
        .scroller { position: fixed; inset: 0; overflow-y: auto; }
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
        .qr { display: grid; justify-items: center; gap: 8px; margin-top: 14px; }
        .code :global(svg) { width: 200px; height: 200px; background: #fff; border-radius: 12px; padding: 6px; display: block; }
        .line { gap: 12px; }
        .paid { color: var(--faint); text-decoration: line-through; }
        .hist-btn { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 44px; margin-top: 12px; padding-top: 10px;
          border-top: .5px solid var(--line); color: var(--sub); font-size: 15px; text-align: left; }
        .hist-btn :global(.up) { transform: rotate(180deg); }
        .chips { display: flex; gap: 8px; overflow-x: auto; margin: 0 -16px 12px; padding: 2px 16px; scrollbar-width: none; }
        .chip { flex-shrink: 0; display: grid; gap: 1px; text-align: left; padding: 8px 14px; border-radius: 16px; background: var(--card); font-weight: 600; min-height: 48px; }
        .chip .num { font-size: 13px; font-weight: 500; color: var(--sub); }
        .chip.on { background: var(--lime); color: var(--on-lime); }
        .chip.on .num { color: var(--on-lime); opacity: .75; }
      `}</style>
    </div>
  );
}
