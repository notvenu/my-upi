'use client';
import { LocateFixed, MapPin, MessageSquareText } from 'lucide-react';
import { useState } from 'react';
import Avatar from '@/components/Avatar';
import BillField from '@/components/BillField';
import CategoryPicker from '@/components/CategoryPicker';
import Combobox from '@/components/Combobox';
import Segmented from '@/components/Segmented';
import Sheet from '@/components/Sheet';
import SplitEditor from '@/components/SplitEditor';
import TripField from '@/components/TripField';
import { addTxn, type Method } from '@/lib/db';
import { setNav } from '@/lib/nav';
import { useSplit } from '@/lib/split';
import { currentPlace, haptic, markOpened, openUpiApp, preferredApp, removeBill, setPreferredApp, toast, toPaise, UPI_APPS } from '@/lib/ui';
import { cleanAmount, rupees, type UpiQr } from '@/lib/upi';

const METHODS: [Method, string][] = [['cash', 'Cash'], ['card', 'Card'], ['upi', 'UPI']];

// pay: open the UPI app with nothing filled in; you scan and pay there, and add amount, category and split after.
// record: cash, card, or anything already paid, with all the details now.
export default function PayForm({ qr: q, record = false, onClose }: { qr: UpiQr | null; record?: boolean; onClose: (saved: boolean) => void }) {
  const [mode, setMode] = useState<'pay' | 'record'>(record ? 'record' : 'pay');
  const [amount, setAmount] = useState('');
  const [payee, setPayee] = useState(q?.name ?? '');
  const [direction, setDirection] = useState<'debit' | 'credit'>('debit');
  const [method, setMethod] = useState<Method>(record ? 'cash' : 'upi');
  const [note, setNote] = useState('');
  const [category, setCategory] = useState('Other');
  const [subcategory, setSubcategory] = useState<string | null>(null);
  const [bill, setBill] = useState<string | null>(null);
  const [place, setPlace] = useState('');
  const [trip, setTrip] = useState('');
  const [locating, setLocating] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [app, setApp] = useState(preferredApp);

  const total = toPaise(amount);
  const split = useSplit(total);
  const name = payee.trim() || q?.name || '';
  const bad = split.myShare < 0 || split.overItems;

  async function locate() {
    setLocating(true);
    try {
      const r = await currentPlace();
      if (r) { setCoords({ lat: r.lat, lng: r.lng }); setPlace((p) => p || r.place); }
    } catch { toast("Couldn't get your location"); }
    setLocating(false);
  }

  const cancel = () => { removeBill(bill); onClose(false); };

  // Saved as unconfirmed, then the UPI app opens like tapping its icon. Coming back asks "did you pay?" and the details.
  function pay() {
    const id = addTxn({ amount: 0, payee_vpa: q?.vpa ?? null, payee_name: name || 'Payment', status: 'PENDING', source: 'app', method: 'upi', app: app.label });
    setPreferredApp(app.pkg);
    markOpened(id);
    onClose(true);
    openUpiApp(app.pkg);
  }

  function save() {
    const paid = split.total;
    if (!paid) return;
    const rows = direction === 'debit' ? split.rows() : [];
    const id = addTxn({
      amount: paid, direction, note, category, subcategory, bill_uri: bill, place, trip, lat: coords?.lat, lng: coords?.lng,
      payee_vpa: q?.vpa ?? null, payee_name: name || null, status: 'SUCCESS', source: 'manual',
      method, app: method === 'upi' ? app.label : null, items: split.itemsData(),
    }, rows);
    toast(`${direction === 'credit' ? 'Received' : 'Spent'} ${rupees(paid)} saved`);
    onClose(true);
    if (rows.length) setNav({ requestFor: id }); // already paid: offer to ask for the shares now
  }

  if (mode === 'pay') return (
    <Sheet title="Pay" onClose={cancel} footer={
      <div className="stack" style={{ gap: 4 }}>
        <button className="btn lime" onClick={pay}>Open {app.label}</button>
        <button className="btn ghost" onClick={() => { haptic(); setMethod('cash'); setMode('record'); }}>Paid by cash or card instead</button>
      </div>
    }>
      <div className="center payee">
        <Avatar name={name || '?'} size={64} />
        {q ? (
          <>
            <div style={{ fontSize: 20, fontWeight: 600, marginTop: 10 }} className="ellipsis">{q.name}</div>
            <div className="sub ellipsis">{q.vpa}</div>
          </>
        ) : <input className="payee-input" value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="Who are you paying?" aria-label="Paying" />}
      </div>
      <p className="sub center" style={{ margin: '14px 8px 18px' }}>Scan and pay in your UPI app. When you&apos;re back, add the amount, what it was for, and any split.</p>
      <h3 className="eyebrow">Pay with</h3>
      <Combobox label="UPI app" options={UPI_APPS.map((a) => ({ value: a, label: a.label }))} value={app} onChange={setApp} />
      <style jsx>{`
        .payee { display: grid; justify-items: center; margin-top: 4px; }
        .payee-input { width: 100%; font-size: 22px; font-weight: 600; text-align: center; min-height: 56px; margin-top: 6px; letter-spacing: -0.02em; }
      `}</style>
    </Sheet>
  );

  return (
    <Sheet full title="New entry" onClose={cancel} footer={<>
      {split.myShare < 0 && <p className="sub center" style={{ color: 'var(--red)', marginBottom: 6 }}>Shares are more than the total. Lower someone&apos;s share.</p>}
      <button className="btn" disabled={!split.total || bad} onClick={save}>{split.total ? `Save ${rupees(split.total)}` : 'Enter an amount'}</button>
    </>}>
      <Segmented options={[['debit', 'I paid'], ['credit', 'I received']] as const} value={direction}
        onChange={(d) => { setDirection(d); if (d === 'credit') split.set({ on: false }); }} />
      <input className="payee-input" value={payee} onChange={(e) => setPayee(e.target.value)} placeholder={direction === 'debit' ? 'Paid to (name or shop)' : 'Received from'}
        aria-label={direction === 'debit' ? 'Paid to' : 'Received from'} />

      {/* the amount: the biggest thing on the screen */}
      <label className="amount">
        <span className={`rs${total ? '' : ' dim'}`}>₹</span>
        <input className="num" inputMode="decimal" placeholder="0" aria-label="Amount in rupees" data-autofocus value={amount}
          onChange={(e) => setAmount(cleanAmount(e.target.value))} style={{ width: `${Math.max(1, amount.length || 1) * 0.62 + 0.2}em` }} />
      </label>

      <div style={{ marginTop: 14 }}><Segmented options={METHODS} value={method} onChange={setMethod} label="Paid by" /></div>

      <div className="reason">
        <MessageSquareText size={18} className="faint" />
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={80} placeholder="What's it for?" aria-label="Reason" />
      </div>

      <h3 className="eyebrow">Category</h3>
      <CategoryPicker category={category} subcategory={subcategory} onChange={(c, s) => { setCategory(c); setSubcategory(s); }} />

      {direction === 'debit' && (
        <>
          <h3 className="eyebrow">Split</h3>
          <SplitEditor split={split} />
        </>
      )}

      <h3 className="eyebrow">Details</h3>
      <div className="list">
        <div className="item">
          <span className="mini-icon"><MapPin size={17} /></span>
          <input className="grow" style={{ padding: '8px 0' }} value={place} onChange={(e) => setPlace(e.target.value)} placeholder={locating ? 'Finding your location…' : 'Add a place'} aria-label="Place" />
          <button className="icon-btn plain" aria-label="Use my location" disabled={locating} onClick={locate}><LocateFixed size={18} /></button>
        </div>
        <TripField value={trip} onChange={setTrip} />
        <BillField uri={bill} onChange={(u) => { removeBill(bill); setBill(u); }} />
      </div>
      <style jsx>{`
        .payee-input { width: 100%; font-size: 22px; font-weight: 600; text-align: center; min-height: 56px; margin-top: 6px; letter-spacing: -0.02em; }
        .amount { display: flex; justify-content: center; align-items: flex-start; margin-top: 8px; font-size: 68px; line-height: 1; cursor: text; }
        .amount input { font-size: inherit; text-align: center; max-width: 100%; padding: 0; caret-color: var(--green); }
        .rs { font-size: 32px; font-weight: 500; margin-top: 8px; margin-right: 2px; }
        .dim { color: var(--faint); }
        .reason { display: flex; align-items: center; gap: 10px; background: var(--card); border-radius: 999px; padding: 0 20px; min-height: 54px; margin: 14px 0 0; }
        .reason input { flex: 1; font-size: 16px; padding: 14px 0; }
      `}</style>
    </Sheet>
  );
}
