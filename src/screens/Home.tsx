'use client';
import { ArrowUp, ChevronRight, Clock, FileText, FileUp, Luggage, Plus, ReceiptText, Repeat, Send, Smartphone, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import Avatar from '@/components/Avatar';
import NavBar from '@/components/NavBar';
import TxnRow from '@/components/TxnRow';
import { ME } from '@/lib/calc';
import { getSetting, listGroups, listPeople, listSubs, listTrips, monthTxns, toConfirm, unpaidSplits } from '@/lib/db';
import { openPay, setNav, type Tab } from '@/lib/nav';
import { readNote } from '@/lib/ocr';
import { peek, whoFor } from '@/lib/receipt';
import { canOpenApps, haptic, longDate, preferredApp, shortDate, spentOf, toast, ym, ymd } from '@/lib/ui';
import { rupees } from '@/lib/upi';

// Type or paste a note in any shape ("tomatoes 70 onions 60 palak 20, palak for me rest for all");
// Gemini reads it and the payment form opens filled in, so it's confirmed before saving.
function QuickNote() {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0); // which loader caption is showing
  const said = /roommate|split|share|with|for (me|all|every)/i.test(text);
  const captions = ['Spotting the rupees…', 'Adding it up…', ...(said ? ['Working out who had what…'] : []), 'Picking a category…', 'Almost there…'];
  const bits = busy ? peek(text) : [];
  useEffect(() => {
    if (!busy) return;
    setStep(0);
    const t = setInterval(() => setStep((s) => s + 1), 1100);
    return () => clearInterval(t);
  }, [busy]);
  async function send() {
    if (!text.trim() || busy) return;
    haptic();
    setBusy(true);
    try {
      const people = listPeople(), groups = listGroups();
      const r = await readNote(text, [...groups, ...people].map((x) => x.name));
      const items = r.items.map((it) => ({ name: it.name, amount: it.amount, who: whoFor(it.for, people, groups) }));
      // everyone in it: who it's shared "with", plus anyone an item names
      const named = [...new Set([...whoFor(r.with, people, groups), ...items.flatMap((it) => it.who)].filter((id) => id !== ME))];
      if (!r.total && !items.length) { toast('No amounts in that note'); return; }
      openPay(null, true, { payee: r.shop, amount: r.total || items.reduce((a, it) => a + it.amount, 0), items, date: r.date,
        category: r.category, place: r.place, method: r.method, note: r.note, people: named });
      setText('');
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className={`note${busy ? ' busy' : ''}`} onSubmit={(e) => { e.preventDefault(); send(); }}>
      <div className="body">
        {/* reading: the note blurs away and folds up, and its items take its place */}
        <div className="unfold"><div className="fold">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} aria-label="Write what you spent" disabled={busy}
            placeholder="Write it like a note: tomatoes 70, onions 60, palak 20. Palak for me, rest for all"
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(); }} />
        </div></div>
        {busy && (
          // while Gemini reads: the note's own items pop out one by one, then the running total
          <div className="peek" role="status">
            {bits.length ? (
              <div className="chips">
                {bits.map((b, i) => <span key={i} className="chip" style={{ animationDelay: `${0.3 + i * 0.28}s` }}>{b.name} <b className="num">{rupees(b.amount)}</b></span>)}
                {bits.length > 1 && <span className="chip sum" style={{ animationDelay: `${0.45 + bits.length * 0.28}s` }}>= <b className="num">{rupees(bits.reduce((a, b) => a + b.amount, 0))}</b></span>}
              </div>
            ) : <div className="dots" aria-hidden="true"><i /><i /><i /></div>}
            <p key={Math.min(step, captions.length - 1)} className="caption">{captions[Math.min(step, captions.length - 1)]}</p>
          </div>
        )}
      </div>
      <button type="submit" aria-label="Read note" disabled={busy || !text.trim()}>
        {busy ? <Sparkles size={19} className="twinkle" /> : <ArrowUp size={20} strokeWidth={2.4} />}
      </button>
      <style jsx>{`
        .note { position: relative; isolation: isolate; overflow: hidden; display: flex; align-items: flex-end; gap: 8px; margin-top: 12px;
          padding: 10px 10px 10px 16px; border-radius: 24px; background: var(--card); box-shadow: inset 0 0 0 .5px rgb(255 255 255 / .05); }
        /* reading: the same card, with a faint light sweeping across it */
        .note.busy::before { content: ''; position: absolute; inset: 0; z-index: -1; pointer-events: none;
          background: linear-gradient(100deg, transparent 35%, color-mix(in srgb, var(--lime) 9%, transparent) 50%, transparent 65%) 0 0 / 250% 100%;
          animation: sweep 1.8s linear infinite; }
        @keyframes sweep { from { background-position: 100% 0; } to { background-position: -150% 0; } }
        .body { flex: 1; min-width: 0; }
        .unfold { display: grid; grid-template-rows: 1fr; transition: grid-template-rows .45s var(--ease) .1s; }
        .busy .unfold { grid-template-rows: 0fr; }
        .fold { min-height: 0; overflow: hidden; }
        textarea { display: block; width: 100%; min-height: 44px; resize: none; max-height: 40dvh; padding: 10px 0; font: inherit; font-size: 16px;
          color: var(--ink); background: none; border: 0; outline: 0; field-sizing: content; transition: filter .4s, opacity .4s; }
        .busy textarea { filter: blur(6px); opacity: 0; }
        textarea::placeholder { color: var(--sub); }
        button { width: 40px; height: 40px; flex-shrink: 0; border-radius: 50%; display: grid; place-items: center; background: var(--lime); color: var(--on-lime);
          transition: transform .3s var(--spring), opacity .2s; }
        button:active:not(:disabled) { transform: scale(.9); }
        button:disabled { opacity: .35; }
        .busy button:disabled { opacity: 1; }
        .busy button :global(.twinkle) { animation: twinkle 1.1s var(--ease) infinite; }
        @keyframes twinkle { 50% { scale: .75; rotate: 20deg; opacity: .6; } }
        .peek { display: grid; gap: 8px; padding: 6px 0 4px; }
        .chips { display: flex; flex-wrap: wrap; gap: 6px; }
        .chip { padding: 5px 10px; border-radius: 999px; font-size: 13px; text-transform: capitalize; background: var(--raised); color: var(--ink);
          opacity: 0; animation: pop .45s var(--spring) forwards; }
        .chip b { color: var(--lime); font-weight: 600; }
        .chip.sum { background: var(--lime); color: var(--on-lime); }
        .chip.sum b { color: inherit; }
        @keyframes pop { from { opacity: 0; transform: translateY(8px) scale(.6); } to { opacity: 1; transform: none; } }
        .dots { display: flex; gap: 6px; padding: 6px 2px; }
        .dots i { width: 7px; height: 7px; border-radius: 50%; background: var(--lime); animation: hop .9s var(--ease) infinite; }
        .dots i:nth-child(2) { animation-delay: .15s; }
        .dots i:nth-child(3) { animation-delay: .3s; }
        @keyframes hop { 30% { transform: translateY(-6px); opacity: .5; } }
        .caption { font-size: 13px; color: var(--sub); animation: fade .35s var(--ease); }
        @keyframes fade { from { opacity: 0; transform: translateY(4px); } }
        @media (prefers-reduced-motion: reduce) {
          .note.busy::before { animation: none; }
          .unfold, textarea { transition: none; }
          .chip, .caption, .dots i, .busy button :global(.twinkle) { animation: none; opacity: 1; }
        }
      `}</style>
    </form>
  );
}

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
  const trips = listTrips();

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

          {/* Add payment: cash, card or UPI with every detail (UPI can then open the app to pay). Scanning a QR is the round button. */}
          <div className="actions">
            <button className="action main" onClick={() => { haptic(); openPay(null, true); }}><Plus size={22} strokeWidth={2.4} /><span>Add payment</span></button>
            <button className="action" onClick={() => { haptic(); setNav({ scanMode: 'bill' }); goTab('scan'); }}><ReceiptText size={22} /><span>Scan bill</span></button>
            <button className="action" onClick={() => { haptic(); setNav({ importing: true }); }}><FileUp size={22} /><span>Statement</span></button>
            {canOpenApps && <button className="action" onClick={() => { haptic(); openPay(null); }}><Smartphone size={22} /><span>Open {app.label}</span></button>}
          </div>
          <QuickNote />

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
                <button className="item" onClick={() => setNav({ importing: true })}>
                  <span className="mini-icon"><FileText size={17} /></span>
                  <span className="grow"><b className="t">{unconfirmed} unconfirmed this month</b><br /><span className="sub">Upload a statement to confirm them</span></span>
                  <ChevronRight size={18} strokeWidth={2.5} className="chev" />
                </button>
              )}
            </div>
          )}

          <div className="list" style={{ marginTop: 14 }}>
            <button className="item" onClick={() => { setNav({ peopleView: 'trips' }); goTab('people'); }}>
              <span className="mini-icon"><Luggage size={17} /></span>
              <span className="grow"><b className="t">Trips and events</b><br /><span className="sub">{trips.length ? `${trips.slice(0, 2).join(', ')}${trips.length > 2 ? ` +${trips.length - 2}` : ''}` : 'Goa trip, a party: split it all in one place'}</span></span>
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
              <button className="link" style={{ margin: '10px 16px' }} onClick={() => goTab('history')}>All history</button>
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
        .actions:has(> :nth-child(4)) { grid-template-columns: 1fr 1fr; }
        .action { display: grid; justify-items: center; gap: 8px; padding: 16px 6px 14px; border-radius: 24px; background: var(--card); box-shadow: inset 0 0 0 .5px rgb(255 255 255 / .05); font-size: 13px; font-weight: 500;
          letter-spacing: -0.08px; transition: transform .45s var(--spring); }
        .action:active { transform: scale(.94); transition-duration: .1s; }
        .action.main { background: var(--lime); color: var(--on-lime); }
        .t { font-weight: 600; }
      `}</style>
    </div>
  );
}
