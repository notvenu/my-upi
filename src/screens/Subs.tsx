'use client';
import { ChevronRight, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';
import CategoryPicker from '@/components/CategoryPicker';
import CatIcon from '@/components/CatIcon';
import Segmented from '@/components/Segmented';
import Sheet from '@/components/Sheet';
import { nextDue, perMonth, type Every } from '@/lib/calc';
import { deleteSub, dismissSub, listSubs, logDueSubs, saveSub, suggestedSubs, type Method } from '@/lib/db';
import { ask, ddmon as day, haptic, toast, toPaise, ymd } from '@/lib/ui';
import { cleanAmount, rupees } from '@/lib/upi';

type Draft = { id?: number; name: string; amount: string; every: Every; next: string; method: Method; category: string };
const EVERY: [Every, string][] = [['month', 'Monthly'], ['week', 'Weekly'], ['year', 'Yearly']];
const METHODS: [Method, string][] = [['upi', 'UPI autopay'], ['card', 'Card'], ['bank', 'Bank mandate']];
const how = (m: Method) => METHODS.find(([k]) => k === m)?.[1] ?? '';

// Autopays, mandates and subscriptions. Banks and UPI apps don't share mandates with other apps, so the free way:
// you add each once, MyUPI logs it on every due date, and it spots repeating payments in your history and statements to suggest adding.
export default function Subs({ onClose }: { onClose: () => void }) {
  const today = ymd(new Date());
  const subs = listSubs();
  const found = suggestedSubs(today);
  const monthly = subs.reduce((a, s) => a + perMonth(s.amount, s.every), 0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const edit = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  function save() {
    if (!draft) return;
    saveSub({ ...draft, amount: toPaise(draft.amount), day: 0 });
    const n = logDueSubs(today);
    toast(n ? `Saved · ${n} charge${n > 1 ? 's' : ''} logged` : 'Autopay saved');
    setDraft(null);
  }
  async function remove() {
    if (!draft?.id || !(await ask('Stop tracking this?', 'Charges already logged stay in your history.', 'Remove', true))) return;
    deleteSub(draft.id);
    setDraft(null);
  }

  return (
    <>
      <Sheet full title="Autopays" onClose={onClose}>
        <section className="card total">
          <p className="sub">Every month, about</p>
          <p className="num big">{rupees(Math.round(monthly))}</p>
          <p className="sub">{subs.length ? `${subs.length} tracked` : 'Add subscriptions, EMIs, SIPs, rent: anything that charges on its own.'}</p>
        </section>

        {subs.length > 0 && (
          <div className="list wide" style={{ marginTop: 14 }}>
            {subs.map((s) => (
              <button key={s.id} className="item" onClick={() => setDraft({ id: s.id, name: s.name, amount: String(s.amount / 100), every: s.every, next: s.next, method: s.method, category: s.category })}>
                <CatIcon cat={s.category} size={40} />
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className="ellipsis" style={{ display: 'block' }}>{s.name}</span>
                  <span className="sub ellipsis" style={{ display: 'block', fontSize: 14 }}>Next {day(s.next)} · {how(s.method)}</span>
                </span>
                <span className="num">{rupees(s.amount)}<span className="sub" style={{ fontSize: 13 }}>/{s.every}</span></span>
                <ChevronRight size={18} strokeWidth={2.5} className="chev" />
              </button>
            ))}
          </div>
        )}
        <button className="btn soft" style={{ marginTop: 14 }} onClick={() => { haptic(); setDraft({ name: '', amount: '', every: 'month', next: today, method: 'upi', category: 'Bills' }); }}>
          <Plus size={18} /> Add autopay
        </button>

        {found.length > 0 && (
          <>
            <h3 className="eyebrow"><span style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Sparkles size={13} /> Looks like a repeat payment</span></h3>
            <div className="list wide">
              {found.map((r) => (
                <div key={r.key} className="item">
                  <CatIcon cat={r.category} size={40} />
                  <span className="grow" style={{ minWidth: 0 }}>
                    <span className="ellipsis" style={{ display: 'block' }}>{r.name}</span>
                    <span className="sub" style={{ display: 'block', fontSize: 14 }}>{rupees(r.amount)} · last {day(r.last)}</span>
                  </span>
                  <button className="link" style={{ color: 'var(--sub)' }} onClick={() => dismissSub(r.key)}>Not one</button>
                  <button className="link" onClick={() => setDraft({ name: r.name, amount: String(r.amount / 100), every: 'month', next: nextDue(r.last, 'month', Number(r.last.slice(8))), method: 'upi', category: r.category })}>Add</button>
                </div>
              ))}
            </div>
            <p className="hint">Found in payments you recorded and bank statements you imported.</p>
          </>
        )}
        <style jsx>{`
          .total { text-align: center; padding: 22px; }
          .big { font-size: 40px; font-weight: 700; color: var(--lime); letter-spacing: -0.03em; margin: 2px 0; }
        `}</style>
      </Sheet>

      {draft && (
        <Sheet title={draft.id ? 'Autopay' : 'New autopay'} onClose={() => setDraft(null)}
          footer={<button className="btn" disabled={!draft.name.trim() || !toPaise(draft.amount) || !draft.next} onClick={save}>Save</button>}>
          <div className="list">
            <div className="field"><label htmlFor="sub-name">Name</label>
              <input id="sub-name" value={draft.name} onChange={(e) => edit({ name: e.target.value })} placeholder="Netflix, SIP, Rent" autoCapitalize="words" /></div>
            <div className="field"><label htmlFor="sub-amt">Amount ₹</label>
              <input id="sub-amt" className="num" inputMode="decimal" value={draft.amount} placeholder="199" onChange={(e) => edit({ amount: cleanAmount(e.target.value) })} /></div>
            <div className="field"><label htmlFor="sub-next">Next charge</label>
              <input id="sub-next" type="date" value={draft.next} onChange={(e) => edit({ next: e.target.value })} /></div>
          </div>
          <h3 className="eyebrow">Repeats</h3>
          <Segmented options={EVERY} value={draft.every} onChange={(every) => edit({ every })} label="Repeats" />
          <h3 className="eyebrow">Paid by</h3>
          <Segmented options={METHODS} value={draft.method} onChange={(method) => edit({ method })} label="Paid by" />
          <h3 className="eyebrow">Category</h3>
          <CategoryPicker category={draft.category} subcategory={null} onChange={(category) => edit({ category })} />
          {draft.next < today && <p className="hint">The date has passed, so the charges since then get logged too.</p>}
          {draft.id && <button className="btn danger" style={{ marginTop: 24 }} onClick={remove}><Trash2 size={18} /> Stop tracking</button>}
        </Sheet>
      )}
    </>
  );
}
