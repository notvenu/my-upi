'use client';
import { Check, QrCode } from 'lucide-react';
import { useEffect, useState } from 'react';
import { renderSVG } from 'uqr';
import Avatar from '@/components/Avatar';
import type { ShareView } from '@/lib/share';
import { supabase } from '@/lib/sync';
import { rupees, simplePayUri } from '@/lib/upi';

const monthName = (ym: string) => new Date(`${ym}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
const day = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60e3);
  return m < 2 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : day(iso.slice(0, 10));
};

// The page a split link opens: what everyone shares equally, what's on each person, what's carried over, and how to pay.
export default function SharePage({ id }: { id: string }) {
  const [view, setView] = useState<ShareView | null>(null);
  const [failed, setFailed] = useState('');
  const [qrFor, setQrFor] = useState<number | null>(null);

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
              </header>

              <section className="people">
                {view.people.map((p) => (
                  <article key={p.id} className="card person">
                    <div className="row">
                      <Avatar name={p.name} size={40} />
                      <div className="grow" style={{ minWidth: 0 }}>
                        <p className="ellipsis" style={{ fontWeight: 600 }}>{p.name}</p>
                        <p className="sub" style={{ fontSize: 14 }}>
                          {p.paid ? `${rupees(p.paid)} paid` : ''}{p.paid && p.carried.length ? ' · ' : ''}
                          {p.carried.map((c) => `${rupees(c.amount)} from ${monthName(c.month).split(' ')[0]}`).join(', ')}
                        </p>
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
                  </article>
                ))}
              </section>

              {view.shared.length > 0 && (
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

              {view.people.filter((p) => p.own.length).map((p) => (
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

              {!view.shared.length && !view.people.some((p) => p.own.length) && <p className="sub center" style={{ marginTop: 32 }}>Nothing split {view.month ? 'this month' : 'yet'}.</p>}
              {view.people.some((p) => p.carried.length) && <p className="hint" style={{ marginTop: 20 }}>Anything unpaid from an earlier month is carried into this one until it&apos;s paid.</p>}
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
      `}</style>
    </div>
  );
}
