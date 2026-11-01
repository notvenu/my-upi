'use client';
import { Check, ChevronDown, Copy, QrCode } from 'lucide-react';
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

// A room link: one person's sheet, a month at a time like a spreadsheet's tabs (this month first); on a wide
// screen every month sits side by side. Each month: its items with their share, the total, the balance carried in,
// what they paid, and what's carried on.
function Months({ months }: { months: LedgerMonth[] }) {
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
                      <span className="grow" style={{ minWidth: 0 }}><span className="w">{it.what}</span><span className="d">{day(it.date)}</span></span>
                      <span className="num">{rupees(it.amount)}</span>
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
        .items li { display: flex; align-items: center; gap: 12px; padding: 10px 0; }
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
                          <ChevronDown size={17} className={histFor === p.id ? 'up' : ''} />
                        </button>
                        {histFor === p.id && <History lines={p.history} />}
                      </>
                    )}
                  </article>
                ))}
              </section>

                </aside>
                <div className="body">
              {sel?.ledger && (sel.ledger.length ? (
                <>
                  <h2 className="eyebrow first">What&apos;s unpaid, month by month</h2>
                  <Months months={sel.ledger} />
                </>
              ) : (
                <div className="card done">
                  <Check size={26} style={{ color: 'var(--lime)' }} />
                  <p style={{ fontWeight: 600, fontSize: 18 }}>{sel.name.split(' ')[0]} is all paid up</p>
                  <p className="sub">Nothing unpaid{view.until ? ` up to ${day(view.until)}` : ''}.</p>
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
        .hist-btn :global(.up) { transform: rotate(180deg); }
        .chips { display: flex; gap: 8px; overflow-x: auto; margin: 0 -16px 12px; padding: 2px 16px; scrollbar-width: none; }
        .chip { flex-shrink: 0; display: grid; gap: 1px; text-align: left; padding: 8px 14px; border-radius: 16px; background: var(--card); font-weight: 600; min-height: 48px; }
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
          .chips { flex-direction: column; overflow: visible; margin: 0 0 12px; padding: 0; gap: 6px; }
          .chip { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 16px; }
          .chip:not(.on):hover { background: var(--raised); }
          .chip .num { font-size: 14px; }
          .people { grid-template-columns: 1fr; }
          .pay { display: none; } /* a UPI link can't open on a computer: the QR is up instead */
          .qr { display: grid; }
          .first { margin-top: 0; }
          .done { margin-top: 0; }
        }
      `}</style>
    </div>
  );
}
