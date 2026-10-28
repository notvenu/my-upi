'use client';
import { Banknote, ChevronRight, Clock, FileText, History, Repeat, ScanLine, Send, Smartphone } from 'lucide-react';
import Avatar from '@/components/Avatar';
import NavBar from '@/components/NavBar';
import TxnRow from '@/components/TxnRow';
import { db, getSetting, listSubs, monthTxns, toConfirm, unpaidSplits } from '@/lib/db';
import { openPay, setNav, type Tab } from '@/lib/nav';
import { canOpenApps, haptic, longDate, preferredApp, shortDate, spentOf, ym, ymd } from '@/lib/ui';
import { rupees } from '@/lib/upi';

export default function Home({ goTab }: { goTab: (t: Tab) => void }) {
  const today = ymd(new Date());
  const thisMonth = ym(new Date());
  const monthList = monthTxns(thisMonth);
  const todayList = monthList.filter((t) => t.created_at.startsWith(today));
  const earlier = monthList.filter((t) => !t.created_at.startsWith(today)).slice(0, 12);
  const unpaid = unpaidSplits();
  const pending = toConfirm();
  const owed = unpaid.reduce((a, x) => a + x.amount, 0);
  const dueNow = unpaid.filter((x) => !x.requested_at && x.created_at.slice(0, 7) < thisMonth);
  const owers = new Set(dueNow.map((x) => x.person_id ?? x.name)).size;
  const unconfirmed = monthList.filter((t) => ['PENDING', 'SUBMITTED', 'UNKNOWN'].includes(t.status)).length;
  const app = preferredApp();
  const nextSub = listSubs()[0];

  return (
    <div className="page">
      <NavBar title="Today" subtitle={longDate(today)}
        trailing={<button aria-label="You and settings" onClick={() => goTab('me')} className="me-btn"><Avatar name={getSetting('my_name') || 'Me'} size={36} /></button>} />

      <div className="split">
        <div className="side">
          {/* hero: today's spend, with the month and what you're owed one tap away */}
          <section className="hero rise" aria-label={`Spent ${rupees(spentOf(todayList))} today`}>
            <p className="hero-label">Spent today</p>
            <p className="num hero-amt">{rupees(spentOf(todayList))}</p>
            <p className="hero-label">{todayList.length ? `${todayList.length} payment${todayList.length > 1 ? 's' : ''}` : 'Nothing yet'}</p>
            <div className="hero-split">
              <button onClick={() => goTab('insights')}><span className="hero-label">This month</span><span className="num">{rupees(spentOf(monthList))}</span></button>
              <button onClick={() => goTab('people')}><span className="hero-label">Owed to you</span><span className="num">{rupees(owed)}</span></button>
            </div>
          </section>

          <div className="actions">
            <button className="action main" onClick={() => { haptic(); goTab('scan'); }}><ScanLine size={22} /><span>Scan QR</span></button>
            {canOpenApps && <button className="action" onClick={() => { haptic(); openPay(null); }}><Smartphone size={22} /><span>Pay in {app.label}</span></button>}
            <button className="action" onClick={() => { haptic(); openPay(null, true); }}><Banknote size={22} /><span>Cash or card</span></button>
          </div>

          {(pending.length > 0 || dueNow.length > 0 || unconfirmed > 0) && (
            <div className="list" style={{ marginTop: 14 }}>
              {pending.length > 0 && (
                <button className="item" onClick={() => setNav({ confirming: true })}>
                  <span className="mini-icon amber"><Clock size={17} /></span>
                  <span className="grow"><b className="t">{pending.length} payment{pending.length > 1 ? 's' : ''} to confirm</b><br /><span className="sub">Did they go through? Mark them paid.</span></span>
                  <ChevronRight size={18} strokeWidth={2.5} className="chev" />
                </button>
              )}
              {dueNow.length > 0 && (
                <button className="item" onClick={() => goTab('people')}>
                  <span className="mini-icon"><Send size={17} /></span>
                  <span className="grow"><b className="t">New month: send split requests</b><br />
                    <span className="sub">{owers === 1 ? '1 person owes' : `${owers} people owe`} you {rupees(dueNow.reduce((a, x) => a + x.amount, 0))} from earlier months</span></span>
                  <ChevronRight size={18} strokeWidth={2.5} className="chev" />
                </button>
              )}
              {!pending.length && unconfirmed > 0 && (
                <button className="item" onClick={() => goTab('me')}>
                  <span className="mini-icon"><FileText size={17} /></span>
                  <span className="grow"><b className="t">{unconfirmed} unconfirmed this month</b><br /><span className="sub">Import a bank statement to confirm them</span></span>
                  <ChevronRight size={18} strokeWidth={2.5} className="chev" />
                </button>
              )}
            </div>
          )}

          <div className="list" style={{ marginTop: 14 }}>
            <button className="item" onClick={() => setNav({ history: true })}>
              <span className="mini-icon"><History size={17} /></span>
              <span className="grow"><b className="t">History</b><br /><span className="sub">{db.txns.length} entries · UPI, cash and card</span></span>
              <ChevronRight size={18} strokeWidth={2.5} className="chev" />
            </button>
            <button className="item" onClick={() => setNav({ subs: true })}>
              <span className="mini-icon"><Repeat size={17} /></span>
              <span className="grow"><b className="t">Autopays</b><br /><span className="sub">{nextSub ? `Next: ${nextSub.name} on ${shortDate(`${nextSub.next}T00:00:00`)}` : 'Subscriptions, EMIs, mandates'}</span></span>
              <ChevronRight size={18} strokeWidth={2.5} className="chev" />
            </button>
          </div>
        </div>

        <section>
          <h2 className="eyebrow">Today&apos;s payments</h2>
          {todayList.length
            ? <div className="list wide">{todayList.map((t) => <TxnRow key={t.id} t={t} onClick={() => setNav({ editing: t })} />)}</div>
            : <p className="sub" style={{ margin: '0 16px' }}>Payments you record today show up here.</p>}
          {earlier.length > 0 && (
            // laptop only: the right column has room for the rest of the month
            <div className="wide-only">
              <h2 className="eyebrow">Earlier this month</h2>
              <div className="list wide">{earlier.map((t) => <TxnRow key={t.id} t={t} showDate onClick={() => setNav({ editing: t })} />)}</div>
              <button className="link" style={{ margin: '10px 16px' }} onClick={() => setNav({ history: true })}>All history</button>
            </div>
          )}
        </section>
      </div>

      <style jsx>{`
        .page :global(.me-btn) { border-radius: 50%; transition: transform .4s var(--spring); }
        .page :global(.me-btn:active) { transform: scale(.88); transition-duration: .1s; }
        /* the one loud number on the screen; everything around it stays quiet */
        .hero { position: relative; overflow: hidden; border-radius: 30px; padding: 22px 22px 6px; background: var(--card);
          box-shadow: inset 0 0 0 .5px rgb(255 255 255 / .06); }
        .hero-label { font-size: 15px; color: var(--sub); letter-spacing: -0.24px; }
        .hero-amt { font-size: 54px; line-height: 1.05; color: var(--lime); margin: 4px 0 2px; letter-spacing: -0.04em; font-weight: 700; }
        .hero-split { display: grid; grid-template-columns: 1fr 1fr; margin: 18px -12px 0; border-top: .5px solid var(--line); }
        .hero-split button { display: grid; gap: 2px; text-align: left; padding: 14px 12px; border-radius: 16px; transition: background .3s; }
        .hero-split button:active { background: var(--pressed); transition: none; }
        .hero-split button + button { border-left: .5px solid var(--line); padding-left: 16px; border-radius: 0 16px 16px 0; }
        .hero-split .num { font-size: 21px; }
        .actions { display: grid; grid-template-columns: repeat(auto-fit, minmax(0, 1fr)); gap: 10px; margin-top: 12px; }
        .action { display: grid; justify-items: center; gap: 8px; padding: 16px 6px 14px; border-radius: 24px; background: var(--card); box-shadow: inset 0 0 0 .5px rgb(255 255 255 / .05); font-size: 13px; font-weight: 500;
          letter-spacing: -0.08px; transition: transform .45s var(--spring); }
        .action:active { transform: scale(.94); transition-duration: .1s; }
        .action.main { background: var(--lime); color: var(--on-lime); }
        .t { font-weight: 600; }
      `}</style>
    </div>
  );
}
