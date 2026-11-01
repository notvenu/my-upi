'use client';
import { Check, ChevronRight, HandCoins, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import Avatar from '@/components/Avatar';
import Segmented from '@/components/Segmented';
import Sheet from '@/components/Sheet';
import { db, deleteDebt, listDebts, payDebt, saveDebt, type Method } from '@/lib/db';
import { ask, ddmon as day, haptic, toast, toPaise, ymd } from '@/lib/ui';
import { cleanAmount, rupees } from '@/lib/upi';

type Draft = { id?: number; to: string; amount: string; note: string; due: string; paid: boolean };
const METHODS: [Method, string][] = [['upi', 'UPI'], ['cash', 'Cash'], ['card', 'Card'], ['bank', 'Bank']];

// Money you owe someone or somewhere (a friend, the landlord, a shop's tab) and will pay later.
export default function Debts({ onClose }: { onClose: () => void }) {
  const today = ymd(new Date());
  const debts = listDebts();
  const total = debts.filter((d) => !d.paid_at).reduce((a, d) => a + d.amount, 0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [method, setMethod] = useState<Method>('upi');
  const edit = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  function save() {
    if (!draft) return;
    saveDebt({ ...draft, amount: toPaise(draft.amount) });
    toast('Debt saved');
    setDraft(null);
  }
  function paid() {
    if (!draft?.id) return;
    payDebt(draft.id, method);
    toast('Marked paid · logged in History');
    setDraft(null);
  }
  async function remove() {
    if (!draft?.id || !(await ask('Delete this debt?', draft.paid ? 'The payment logged in History stays.' : 'It is removed for good.', 'Delete', true))) return;
    deleteDebt(draft.id);
    setDraft(null);
  }

  return (
    <>
      <Sheet full title="Debts" onClose={onClose}>
        <section className="card total">
          <p className="sub">You owe</p>
          <p className="num big">{rupees(total)}</p>
          <p className="sub">{debts.length ? `${debts.filter((d) => !d.paid_at).length} to pay` : 'Note money you owe someone, to pay back later.'}</p>
        </section>

        {debts.length > 0 && (
          <div className="list wide" style={{ marginTop: 14 }}>
            {debts.map((d) => (
              <button key={d.id} className="item" onClick={() => setDraft({ id: d.id, to: d.to, amount: String(d.amount / 100), note: d.note ?? '', due: d.due ?? '', paid: !!d.paid_at })}>
                <Avatar name={d.to} size={40} />
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className="ellipsis" style={{ display: 'block' }}>{d.to}</span>
                  <span className="sub ellipsis" style={{ display: 'block', fontSize: 14, color: !d.paid_at && d.due && d.due < today ? 'var(--red)' : undefined }}>
                    {[d.paid_at ? `Paid ${day(d.paid_at)}` : d.due ? `Due ${day(d.due)}` : `Since ${day(d.created_at)}`, d.note].filter(Boolean).join(' · ')}
                  </span>
                </span>
                {d.paid_at && <Check size={16} style={{ color: 'var(--lime)' }} aria-label="Paid" />}
                <span className={`num${d.paid_at ? ' paid' : ''}`}>{rupees(d.amount)}</span>
                <ChevronRight size={18} strokeWidth={2.5} className="chev" />
              </button>
            ))}
          </div>
        )}
        <button className="btn soft" style={{ marginTop: 14 }} onClick={() => { haptic(); setDraft({ to: '', amount: '', note: '', due: '', paid: false }); }}>
          <Plus size={18} /> Add a debt
        </button>
        <style jsx>{`
          .total { text-align: center; padding: 22px; }
          .big { font-size: 40px; font-weight: 700; color: var(--red); letter-spacing: -0.03em; margin: 2px 0; }
          .paid { color: var(--faint); text-decoration: line-through; }
        `}</style>
      </Sheet>

      {draft && (
        <Sheet title={draft.id ? 'Debt' : 'New debt'} onClose={() => setDraft(null)}
          footer={<button className="btn" disabled={!draft.to.trim() || !toPaise(draft.amount)} onClick={save}>Save</button>}>
          <div className="list">
            <div className="field"><label htmlFor="debt-to">To</label>
              <input id="debt-to" data-autofocus list="debt-people" value={draft.to} onChange={(e) => edit({ to: e.target.value })} placeholder="A person or a party" autoCapitalize="words" />
              <datalist id="debt-people">{db.people.map((p) => <option key={p.id} value={p.name} />)}</datalist></div>
            <div className="field"><label htmlFor="debt-amt">Amount ₹</label>
              <input id="debt-amt" className="num" inputMode="decimal" value={draft.amount} placeholder="500" onChange={(e) => edit({ amount: cleanAmount(e.target.value) })} /></div>
            <div className="field"><label htmlFor="debt-note">For</label>
              <input id="debt-note" value={draft.note} onChange={(e) => edit({ note: e.target.value })} placeholder="Concert tickets" /></div>
            <div className="field"><label htmlFor="debt-due">Pay by</label>
              <input id="debt-due" type="date" value={draft.due} onChange={(e) => edit({ due: e.target.value })} /></div>
          </div>
          {draft.id && !draft.paid && (
            <>
              <h3 className="eyebrow">Paid with</h3>
              <Segmented options={METHODS} value={method} onChange={setMethod} label="Paid with" />
              <button className="btn lime" style={{ marginTop: 12 }} onClick={paid}><HandCoins size={18} /> Mark paid</button>
              <p className="hint">Logs the payment in History, so a bank statement later matches it.</p>
            </>
          )}
          {draft.id && <button className="btn danger" style={{ marginTop: 24 }} onClick={remove}><Trash2 size={18} /> Delete</button>}
        </Sheet>
      )}
    </>
  );
}
