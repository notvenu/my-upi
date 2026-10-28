'use client';
import { Check, X } from 'lucide-react';
import { useState } from 'react';
import Avatar from '@/components/Avatar';
import Sheet from '@/components/Sheet';
import { confirmPaid, db, deleteTxn, toConfirm, type Txn } from '@/lib/db';
import { setNav } from '@/lib/nav';
import { openUpiApp, preferredApp, removeBill, shortDate, time12, toast, toPaise, UPI_APPS } from '@/lib/ui';
import { cleanAmount, rupees } from '@/lib/upi';

// "Did you pay?" for payments started here and finished in a UPI app. The one just paid comes first;
// marking it paid opens its details (what for, category, split).
export default function ConfirmSheet({ focus = null, onClose }: { focus?: number | null; onClose: () => void }) {
  const list = toConfirm().sort((a, b) => Number(b.id === focus) - Number(a.id === focus));
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const typed = (t: Txn) => amounts[t.id] ?? (t.amount ? String(t.amount / 100) : '');
  const appOf = (t: Txn) => UPI_APPS.find((a) => a.label === t.app) ?? preferredApp();
  const title = list.length === 1 ? `Did you pay ${list[0].payee_name || 'them'}?` : 'Did these go through?';

  function paid(t: Txn, amount: number) {
    confirmPaid(t.id, amount);
    toast(`Paid ${rupees(amount)}${t.payee_name ? ` to ${t.payee_name}` : ''}`);
    if (!toConfirm().length) onClose();
    setNav({ editing: db.txns.find((x) => x.id === t.id) ?? null }); // now the details
  }
  function notPaid(t: Txn) {
    removeBill(t.bill_uri);
    deleteTxn(t.id);
    toast('Removed');
    if (!toConfirm().length) onClose();
  }

  return (
    <Sheet title={title} onClose={onClose}>
      <p className="sub" style={{ margin: '0 4px 16px', fontSize: 15 }}>Enter what you paid. Not sure? Check the app&apos;s history first.</p>
      <div className="stack">
        {list.map((t, i) => {
          const amount = toPaise(typed(t));
          return (
            <div key={t.id} className="card">
              <div className="row">
                <Avatar name={t.payee_name || '?'} size={42} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="ellipsis" style={{ fontWeight: 600 }}>{t.payee_name || 'Payment'}</div>
                  <div className="sub ellipsis">{[t.app, `${shortDate(t.created_at)}, ${time12(t.created_at)}`].filter(Boolean).join(' · ')}</div>
                </div>
              </div>
              <label className="amt">
                <span className="rs">₹</span>
                <input className="num" inputMode="decimal" placeholder="0" value={typed(t)} data-autofocus={(i === 0 && !typed(t)) || undefined}
                  aria-label={`Amount paid to ${t.payee_name ?? 'payee'}`} onChange={(e) => setAmounts({ ...amounts, [t.id]: cleanAmount(e.target.value) })} />
              </label>
              <div className="btns">
                <button className="btn lime" disabled={!amount} onClick={() => paid(t, amount)}><Check size={18} /> {amount ? `Paid ${rupees(amount)}` : 'Paid'}</button>
                <button className="btn danger" onClick={() => notPaid(t)}><X size={18} /> Didn&apos;t pay</button>
              </div>
              <button className="link check" onClick={() => openUpiApp(appOf(t).pkg)}>Check in {appOf(t).label}</button>
            </div>
          );
        })}
      </div>
      <style jsx>{`
        .amt { display: flex; align-items: center; gap: 6px; margin-top: 14px; min-height: 56px; padding: 0 16px; border-radius: 16px; background: var(--bg); }
        .rs { font-size: 22px; color: var(--sub); }
        .amt input { flex: 1; width: 100%; min-width: 0; font-size: 26px; font-weight: 600; }
        .btns { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
        .btns .btn { min-width: 0; padding-left: 8px; padding-right: 8px; white-space: nowrap; }
        .check { display: block; margin: 10px auto 0; font-size: 14px; }
      `}</style>
    </Sheet>
  );
}
