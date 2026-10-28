'use client';
import { ChartPie, CircleCheck, History as HistoryIcon, House, ScanLine, UserRound, Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { logDueSubs, toConfirm } from '@/lib/db';
import { nav, openPay, setNav, type Tab } from '@/lib/nav';
import { setScrollY, useStore } from '@/lib/store';
import { startSync, supabase, sync } from '@/lib/sync';
import { answer, askState, chrome, haptic, pushLayer, takeJustReturned, toast, toastState, ymd } from '@/lib/ui';
import ConfirmSheet from './ConfirmSheet';
import EditTxn from './EditTxn';
import History from './History';
import Home from './Home';
import Import from './Import';
import Insights from './Insights';
import Login from './Login';
import Me from './Me';
import PayForm from './PayForm';
import People from './People';
import Scan from './Scan';
import SplitRequestSheet from './SplitRequestSheet';
import Subs from './Subs';

const TABS = [
  { key: 'home', label: 'Home', icon: House },
  { key: 'history', label: 'History', icon: HistoryIcon },
  { key: 'insights', label: 'Insights', icon: ChartPie },
  { key: 'people', label: 'People', icon: Users },
  { key: 'me', label: 'You', icon: UserRound },
] as const;

startSync();

export default function App() {
  useStore(); // any change to data, navigation, toasts or sync re-renders the app
  const main = useRef<HTMLElement>(null);
  const scrollMemory = useRef<Partial<Record<Tab, number>>>({}); // each tab keeps its own scroll position, like UITabBarController
  const releaseTab = useRef<(() => void) | null>(null);
  const restore = useRef<Tab | null>(null);
  const lensAt = TABS.findIndex((t) => t.key === nav.tab);

  // Back from any other tab returns Home (one history entry while away from Home); Back on Home leaves the app.
  function goTab(t: Tab) {
    const m = main.current;
    if (!m) return;
    if (t === nav.tab) { m.scrollTo({ top: 0, behavior: 'smooth' }); return; } // tapping the open tab scrolls to top
    haptic();
    scrollMemory.current[nav.tab] = m.scrollTop;
    if (t === 'home') { const r = releaseTab.current; releaseTab.current = null; setNav({ tab: 'home' }); r?.(); }
    else { releaseTab.current ??= pushLayer(() => { releaseTab.current = null; setNav({ tab: 'home' }); }); setNav({ tab: t }); }
    restore.current = t;
  }
  // after the new tab renders: put back its scroll position
  useEffect(() => {
    const m = main.current;
    if (!m || restore.current !== nav.tab) return;
    m.scrollTop = scrollMemory.current[nav.tab] ?? 0;
    setScrollY(m.scrollTop);
    restore.current = null;
  });

  // Back from the UPI app MyUPI opened: ask "did you pay?" right away. Also logs autopays that came due while away.
  const goTabRef = useRef(goTab);
  goTabRef.current = goTab;
  useEffect(() => {
    const check = () => {
      if (document.visibilityState !== 'visible') return;
      const logged = logDueSubs(ymd(new Date()));
      if (logged) toast(`${logged} autopay${logged > 1 ? 's' : ''} logged`);
      const id = takeJustReturned();
      if (id !== null && toConfirm().some((t) => t.id === id)) { goTabRef.current('home'); setNav({ confirmId: id, confirming: true }); }
    };
    check(); // also on a fresh load, in case Android discarded the tab while the UPI app was open
    document.addEventListener('visibilitychange', check);
    navigator.storage?.persist?.(); // ask the browser not to evict the data
    return () => document.removeEventListener('visibilitychange', check);
  }, []);

  // toast banner: shown for each new message, then lifts away
  const [toastShown, setToastShown] = useState(false);
  useEffect(() => {
    if (!toastState.n) return;
    setToastShown(true);
    const t = setTimeout(() => setToastShown(false), 2800);
    return () => clearTimeout(t);
  }, [toastState.n]);

  const askDlg = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = askDlg.current;
    if (askState.q && d && !d.open) d.showModal();
    if (!askState.q && d?.open) d.close();
  });

  // Laptop shortcuts, when not typing and nothing is open: 1–5 tabs, S scan, N new entry, H history, A autopays, I import a statement.
  useEffect(() => {
    const shortcut = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || chrome.sheets || askState.q || !sync.checked || (supabase && !sync.email)) return;
      if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) return;
      const k = e.key.toLowerCase();
      const tab = ({ 1: 'home', 2: 'history', 3: 'insights', 4: 'people', 5: 'me', h: 'history', s: 'scan' } as Record<string, Tab>)[k];
      if (tab) goTabRef.current(tab);
      else if (k === 'n') openPay(null, true);
      else if (k === 'a') setNav({ subs: true });
      else if (k === 'i') setNav({ importing: true });
      else return;
      e.preventDefault();
    };
    addEventListener('keydown', shortcut);
    return () => removeEventListener('keydown', shortcut);
  }, []);

  const signedOut = !!supabase && !sync.email;
  return (
    <>
      {!sync.checked ? null /* checking the saved session: blank for a moment, not a flash of the login form */ : signedOut ? <Login /> : (
        <>
          <div className={`app${chrome.sheets > 0 ? ' receded' : ''}`}>
            <main ref={main} onScroll={(e) => setScrollY(e.currentTarget.scrollTop)}>
              <div key={nav.tab} className="tab-view">
                {nav.tab === 'home' ? <Home goTab={goTab} />
                  : nav.tab === 'history' ? <History />
                  : nav.tab === 'insights' ? <Insights />
                  : nav.tab === 'scan' ? <Scan />
                  : nav.tab === 'people' ? <People />
                  : <Me />}
              </div>
            </main>

            {/* iOS 26 tab bar: a floating glass capsule with a lens that slides to the open tab, and Scan as its own button; a sidebar on a laptop */}
            <nav aria-label="Main">
              <div className="capsule glass" style={{ ['--i' as string]: lensAt, ['--n' as string]: TABS.length }}>
                <span className={`lens${lensAt < 0 ? ' hidden' : ''}`} />
                {TABS.map((t, i) => {
                  const Icon = t.icon;
                  const on = nav.tab === t.key;
                  return (
                    <button key={t.key} className="tab" title={`${t.label} (${i + 1})`} aria-current={on ? 'page' : undefined} onClick={() => goTab(t.key)}>
                      <span className={`ic${on ? ' bounce' : ''}`}><Icon size={23} strokeWidth={on ? 2.3 : 1.9} fill={on ? 'currentColor' : 'none'} fillOpacity={on ? 0.18 : 0} /></span>
                      <span className="lbl">{t.label}</span>
                    </button>
                  );
                })}
              </div>
              <button className={`scan-btn${nav.tab === 'scan' ? ' on' : ''}`} aria-label="Scan and pay" title="Scan and pay (S)"
                aria-current={nav.tab === 'scan' ? 'page' : undefined} onClick={() => goTab('scan')}>
                <ScanLine size={26} strokeWidth={2.2} /><span className="scan-lbl">Scan &amp; pay</span>
              </button>
            </nav>
          </div>

          {nav.pay && <PayForm qr={nav.pay.qr} record={nav.pay.record} draft={nav.pay.draft} onClose={(saved) => { setNav({ pay: null }); if (saved) goTab('home'); }} />}
          {nav.importing && <Import onClose={() => setNav({ importing: false })} />}
          {nav.subs && <Subs onClose={() => setNav({ subs: false })} />}
          {nav.confirming && <ConfirmSheet focus={nav.confirmId} onClose={() => setNav({ confirming: false, confirmId: null })} />}
          {nav.editing && <EditTxn key={nav.editing.id} t={nav.editing} onClose={() => setNav({ editing: null })} />}
          {nav.requestFor !== null && <SplitRequestSheet key={nav.requestFor} txnId={nav.requestFor} onClose={() => setNav({ requestFor: null })} />}

          {/* banner that drops from the top, like an iOS system notification */}
          {toastShown && <div key={toastState.n} className="toast glass" role="status"><CircleCheck size={20} style={{ color: 'var(--lime)' }} /> <span>{toastState.msg}</span></div>}
        </>
      )}

      <dialog ref={askDlg} className="alert" onCancel={(e) => { e.preventDefault(); answer(false); }}>
        {askState.q && (
          <>
            <div className="alert-body">
              <h2>{askState.q.title}</h2>
              <p>{askState.q.text}</p>
            </div>
            <div className="alert-btns">
              <button onClick={() => answer(false)} className={askState.q.danger ? 'bold' : ''}>Cancel</button>
              <button onClick={() => answer(true)} className={askState.q.danger ? 'destructive' : 'bold'}>{askState.q.ok}</button>
            </div>
          </>
        )}
      </dialog>

      <style jsx>{`
        .app { position: fixed; inset: 0; transform-origin: 50% 0; transition: transform .5s var(--ease), border-radius .5s var(--ease); overflow: hidden; background: var(--bg); }
        /* the presenting screen recedes behind a sheet, like an iOS card stack */
        .app.receded { transform: translateY(calc(env(safe-area-inset-top) + 12px)) scale(.92); border-radius: 18px; }
        main { position: absolute; inset: 0; overflow-y: auto; overscroll-behavior-y: contain; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
        .tab-view { animation: tab-in .28s var(--ease); min-height: 100%; }
        @keyframes tab-in { from { opacity: 0; } }

        nav { position: absolute; left: 0; right: 0; bottom: 0; z-index: 10; padding: 0 16px calc(12px + env(safe-area-inset-bottom));
          display: flex; gap: 10px; align-items: flex-end; justify-content: center; pointer-events: none; }
        .capsule { pointer-events: auto; position: relative; flex: 1; max-width: 360px; display: grid; grid-template-columns: repeat(var(--n), 1fr);
          border-radius: 999px; padding: 4px; border: .5px solid rgb(255 255 255 / .08); }
        .lens { position: absolute; top: 4px; bottom: 4px; left: 4px; width: calc((100% - 8px) / var(--n)); border-radius: 999px;
          background: rgb(255 255 255 / .09); transform: translateX(calc(var(--i) * 100%));
          transition: transform .55s var(--spring), opacity .2s; }
        .lens.hidden { opacity: 0; transition: opacity .2s; }
        .tab { position: relative; display: grid; justify-items: center; gap: 1px; min-height: 54px; align-content: center; font-size: 10.5px; font-weight: 500;
          letter-spacing: 0; color: var(--ink); opacity: .62; transition: opacity .2s; }
        .tab[aria-current='page'] { opacity: 1; color: var(--tint); }
        .tab:active .ic { transform: scale(.82); transition-duration: .1s; }
        .ic { display: grid; transition: transform .4s var(--spring); }
        /* SF Symbols-style bounce when a tab becomes active */
        .bounce { animation: bounce .5s var(--spring); }
        @keyframes bounce { 0% { transform: scale(.8); } 55% { transform: scale(1.14); } 100% { transform: scale(1); } }
        .scan-btn { pointer-events: auto; width: 62px; height: 62px; border-radius: 50%; display: grid; place-items: center; flex-shrink: 0;
          background: var(--lime); color: var(--on-lime); box-shadow: inset 0 1px 0 rgb(255 255 255 / .5), 0 8px 28px rgb(210 244 90 / .22), 0 2px 6px rgb(0 0 0 / .4);
          transition: transform .45s var(--spring); }
        .scan-btn:active { transform: scale(.88); transition-duration: .1s; }
        .scan-btn.on { box-shadow: inset 0 1px 0 rgb(255 255 255 / .6), 0 0 0 3px var(--bg), 0 0 0 5px var(--lime); }
        .scan-lbl { display: none; }

        /* laptop: the tab bar becomes a sidebar, sheets stop pushing the page back */
        @media (min-width: 900px) {
          main { left: 232px; }
          .app.receded { transform: none; border-radius: 0; }
          nav { top: 0; right: auto; width: 232px; flex-direction: column; justify-content: flex-start; align-items: stretch; gap: 12px;
            padding: 28px 16px; border-right: .5px solid var(--line); }
          .scan-btn { width: 100%; height: 52px; border-radius: 18px; gap: 10px; display: flex; justify-content: center; font-weight: 600; }
          .scan-btn.on { box-shadow: inset 0 1px 0 rgb(255 255 255 / .5); }
          .scan-lbl { display: inline; }
          .capsule { flex: none; grid-template-columns: 1fr; border-radius: 22px; max-width: none; }
          .lens { width: calc(100% - 8px); height: calc((100% - 8px) / var(--n)); bottom: auto; transform: translateY(calc(var(--i) * 100%)); border-radius: 18px; }
          .tab { grid-auto-flow: column; justify-content: start; gap: 12px; padding: 0 14px; min-height: 48px; font-size: 15px; }
        }

        .toast { position: fixed; top: calc(env(safe-area-inset-top) + 10px); left: 16px; right: 16px; margin: 0 auto; max-width: 400px; z-index: 1000;
          display: flex; align-items: center; gap: 10px; padding: 14px 18px; border-radius: 26px; font-weight: 500; font-size: 15px; letter-spacing: -0.24px;
          animation: drop .6s var(--spring), lift .35s var(--ease) 2.45s forwards; pointer-events: none; }
        @keyframes drop { from { transform: translateY(-140%) scale(.9); } }
        @keyframes lift { to { transform: translateY(-140%) scale(.9); opacity: 0; } }

        /* UIAlertController */
        .alert { border: 0; padding: 0; width: 280px; margin: auto; border-radius: 22px; overflow: hidden; color: var(--ink);
          background: rgb(30 30 30 / .9); backdrop-filter: blur(30px) saturate(1.8); -webkit-backdrop-filter: blur(30px) saturate(1.8); }
        .alert[open] { animation: alert-in .35s var(--spring); }
        .alert::backdrop { background: rgb(0 0 0 / .55); }
        @keyframes alert-in { from { transform: scale(1.15); opacity: 0; } }
        .alert-body { padding: 20px 16px 18px; text-align: center; }
        .alert h2 { font-size: 17px; font-weight: 600; letter-spacing: -0.41px; }
        .alert p { font-size: 13px; margin-top: 4px; letter-spacing: -0.08px; }
        .alert-btns { display: grid; grid-template-columns: 1fr 1fr; border-top: .5px solid var(--line); }
        .alert-btns button { min-height: 46px; font-size: 17px; color: var(--tint); }
        .alert-btns button + button { border-left: .5px solid var(--line); }
        .alert-btns button:active { background: rgb(255 255 255 / .08); }
        .bold { font-weight: 600; }
        .destructive { color: var(--red) !important; font-weight: 600; }
      `}</style>
    </>
  );
}
