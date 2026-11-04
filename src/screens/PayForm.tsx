'use client';
import { CalendarDays, LocateFixed, MapPin, MessageSquareText, ReceiptText } from 'lucide-react';
import { useRef, useState } from 'react';
import Avatar from '@/components/Avatar';
import BillField from '@/components/BillField';
import CategoryPicker from '@/components/CategoryPicker';
import Combobox from '@/components/Combobox';
import Segmented from '@/components/Segmented';
import Sheet from '@/components/Sheet';
import ItemsEditor from '@/components/ItemsEditor';
import SplitEditor from '@/components/SplitEditor';
import TripField from '@/components/TripField';
import { addTxn, guessFor, knownPayees, tripGroup, type Method } from '@/lib/db';
import { setNav, type PayDraft } from '@/lib/nav';
import { useSplit } from '@/lib/split';
import { canOpenApps, currentPlace, haptic, markOpened, openUpiApp, preferredApp, removeBill, setPreferredApp, toast, toPaise, UPI_APPS, ymd } from '@/lib/ui';
import { cleanAmount, rupees, type UpiQr } from '@/lib/upi';

const METHODS: [Method, string][] = [['cash', 'Cash'], ['card', 'Card'], ['upi', 'UPI']];

// pay: open the UPI app with nothing filled in; you scan and pay there, and add amount, category and split after.
// record: all the details now, then either save it (cash, card, already paid) or save and pay in the UPI app.
// draft: what a scanned bill filled in.
export default function PayForm({ qr: q, record = false, draft, onClose }: {
  qr: UpiQr | null; record?: boolean; draft?: PayDraft; onClose: (saved: boolean) => void;
}) {
  const [mode, setMode] = useState<'pay' | 'record'>(record ? 'record' : 'pay');
  const [amount, setAmount] = useState(draft?.amount ? String(draft.amount / 100) : q?.amount ? String(q.amount) : ''); // a QR with an amount fills it in
  const [payee, setPayee] = useState(q?.name ?? draft?.payee ?? '');
  const [vpa, setVpa] = useState(q?.vpa ?? null);
  // what history (or the QR's merchant code) says about this payee: fills category and note until you change them
  const [g0] = useState(() => guessFor({ vpa: q?.vpa, name: q?.name ?? draft?.payee, mcc: q?.mcc }));
  const touched = useRef({ cat: !!draft?.category, note: !!draft?.note, method: !!draft?.method || !!q });
  const [direction, setDirection] = useState<'debit' | 'credit'>('debit');
  const [method, setMethod] = useState<Method>(draft?.method ?? (q ? 'upi' : g0?.payee?.method ?? (record && !draft ? 'cash' : 'upi')));
  const [note, setNote] = useState(draft?.note ?? q?.note ?? g0?.note ?? '');
  const [category, setCategory] = useState(draft?.category ?? g0?.category ?? 'Other');
  const [subcategory, setSubcategory] = useState<string | null>(draft?.category ? null : g0?.subcategory ?? null);
  const [bill, setBill] = useState<string | null>(draft?.bill ?? null);
  const today = ymd(new Date());
  const [date, setDate] = useState(draft?.date && draft.date <= today ? draft.date : today);
  const [place, setPlace] = useState(draft?.place ?? '');
  const [trip, setTrip] = useState(draft?.trip ?? '');
  const [locating, setLocating] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [app, setApp] = useState(preferredApp);

  const total = toPaise(amount);
  const split = useSplit(total, draft?.items, draft?.people);
  const name = payee.trim() || q?.name || '';
  const bad = split.myShare < 0 || split.overItems;
  const known = name ? guessFor({ vpa, name }) : null;
  const seen = known?.payee;
  const recent = q ? [] : knownPayees().slice(0, 8);

  // A payee typed or picked: refill what you haven't set yourself from what you did last time with them.
  function pickPayee(n: string, v: string | null = null) {
    const match = v ? null : knownPayees().find((p) => p.name.toLowerCase() === n.trim().toLowerCase());
    v = v ?? match?.vpa ?? null;
    setPayee(n);
    setVpa(q?.vpa ?? v);
    const g = n.trim() ? guessFor({ vpa: v, name: n }) : null;
    if (!touched.current.cat) { setCategory(g?.category ?? 'Other'); setSubcategory(g?.subcategory ?? null); }
    if (!touched.current.note) setNote(g?.note ?? '');
    if (!touched.current.method && g?.payee?.method) setMethod(g.payee.method);
  }
  // known payee: who they are to you, and their usual amount one tap away
  const history = seen && (
    <div className="known">
      <span className="sub">Paid {seen.count}× · usually {rupees(seen.typical)}{seen.category !== 'Other' ? ` · ${seen.category}` : ''}</span>
      {!total && <button className="chip" onClick={() => { haptic(); setAmount(String(seen.amount / 100)); }}>{rupees(seen.amount)} again</button>}
      <style jsx>{`
        .known { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 8px; margin-top: 8px; font-size: 14px; }
        .chip { padding: 6px 12px; border-radius: 999px; background: var(--card); font-size: 14px; font-weight: 600; color: var(--lime); }
      `}</style>
    </div>
  );
  const recentChips = !q && !payee.trim() && recent.length > 0 && (
    <div className="recent" aria-label="Paid before">
      {recent.map((p) => (
        <button key={p.key} onClick={() => { haptic(); pickPayee(p.name, p.vpa); }}>
          <Avatar name={p.name} size={36} /><span className="ellipsis">{p.name}</span>
        </button>
      ))}
      <style jsx>{`
        .recent { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; margin: 10px -4px 0; padding: 0 4px; }
        .recent button { display: grid; justify-items: center; gap: 4px; flex-shrink: 0; width: 68px; font-size: 12px; font-weight: 500; }
        .recent span { max-width: 64px; }
      `}</style>
    </div>
  );
  const payeeList = (
    <datalist id="known-payees">{knownPayees().slice(0, 50).map((p) => <option key={p.key} value={p.name} />)}</datalist>
  );

  async function locate() {
    setLocating(true);
    try {
      const r = await currentPlace();
      if (r) { setCoords({ lat: r.lat, lng: r.lng }); setPlace((p) => p || r.place); }
    } catch { toast("Couldn't get your location"); }
    setLocating(false);
  }

  const cancel = () => { removeBill(bill); onClose(false); };

  // Saved as unconfirmed (with the scanned payee), then the app's Play Store page opens. Coming back asks "did you pay?".
  function pay() {
    // a payee you've paid before keeps their usual category and note, so coming back only asks the amount
    const learned = known?.from === 'history' ? { category: known.category, subcategory: known.subcategory, note: known.note } : {};
    const id = addTxn({ ...learned, ...(q?.note ? { note: q.note } : {}), amount: q?.amount ? toPaise(String(q.amount)) : 0, payee_vpa: vpa, payee_name: name || 'Payment', status: 'PENDING', source: 'app', method: 'upi', app: app.label });
    setPreferredApp(app.pkg);
    markOpened(id);
    onClose(true);
    openUpiApp(app.pkg);
  }

  const entry = () => ({
    amount: split.total, direction, note, category, subcategory, bill_uri: bill, place, trip, lat: coords?.lat, lng: coords?.lng,
    payee_vpa: vpa, payee_name: name || null, method, app: method === 'upi' ? app.label : null, items: split.itemsData(),
    created_at: date === today ? undefined : `${date}T12:00:00`, // an older bill keeps its own date
  });
  // Details first, then pay: saved as unconfirmed with everything filled in; coming back only asks "did it go through?".
  function saveAndPay() {
    const id = addTxn({ ...entry(), payee_name: name || 'Payment', status: 'PENDING', source: 'app', method: 'upi', app: app.label }, split.rows());
    setPreferredApp(app.pkg);
    markOpened(id);
    onClose(true);
    openUpiApp(app.pkg);
  }
  const payAfter = canOpenApps && direction === 'debit' && method === 'upi';

  function save() {
    const paid = split.total;
    if (!paid) return;
    const rows = direction === 'debit' ? split.rows() : [];
    const id = addTxn({ ...entry(), status: 'SUCCESS', source: 'manual' }, rows);
    toast(`${direction === 'credit' ? 'Received' : 'Spent'} ${rupees(paid)} saved`);
    onClose(true);
    if (rows.length) setNav({ requestFor: id }); // already paid: offer to ask for the shares now
  }

  if (mode === 'pay') return (
    <Sheet title="Pay" onClose={cancel} footer={
      <div className="stack" style={{ gap: 4 }}>
        <button className="btn lime" onClick={pay}>Open {app.label}</button>
        <button className="btn soft" onClick={() => { haptic(); setMode('record'); }}>Fill in details now, pay after</button>
        <button className="btn ghost" onClick={() => { haptic(); setMethod('cash'); setMode('record'); }}>Paid by cash or card instead</button>
      </div>
    }>
      <div className="center payee">
        <Avatar name={name || '?'} size={64} />
        {q ? (
          <>
            <div style={{ fontSize: 20, fontWeight: 600, marginTop: 10 }} className="ellipsis">{q.name}</div>
            <div className="sub ellipsis">{q.vpa}</div>
            {(q.amount || q.note) && <div className="sub ellipsis">{[q.amount && rupees(toPaise(String(q.amount))), q.note].filter(Boolean).join(' · ')}</div>}
          </>
        ) : <input className="payee-input" list="known-payees" value={payee} onChange={(e) => pickPayee(e.target.value)} placeholder="Who are you paying?" aria-label="Paying" />}
        {history}{recentChips}{payeeList}
      </div>
      <p className="sub center" style={{ margin: '14px 8px 18px' }}>Pay in your UPI app now and add the details when you&apos;re back, or fill them in first.</p>
      <h3 className="eyebrow">Pay with</h3>
      <Combobox label="UPI app" options={UPI_APPS.map((a) => ({ value: a, label: a.label }))} value={app} onChange={setApp} />
      <style jsx>{`
        .payee { display: grid; justify-items: center; margin-top: 4px; }
        .payee-input { width: 100%; font-size: 22px; font-weight: 600; text-align: center; min-height: 56px; margin-top: 6px; letter-spacing: -0.02em; }
      `}</style>
    </Sheet>
  );

  return (
    <Sheet full title={draft?.bill ? 'From your bill' : q ? `Pay ${q.name}` : draft?.trip ? `Add to ${draft.trip}` : 'Add payment'} onClose={cancel} footer={<>
      {split.myShare < 0 && <p className="sub center" style={{ color: 'var(--red)', marginBottom: 6 }}>Shares are more than the total. Lower someone&apos;s share.</p>}
      {payAfter ? (
        <div className="stack" style={{ gap: 4 }}>
          <button className="btn lime" disabled={bad} onClick={saveAndPay}>Save, then pay in {app.label}</button>
          <button className="btn ghost" disabled={!split.total || bad} onClick={save}>Already paid · Save {split.total ? rupees(split.total) : ''}</button>
        </div>
      ) : <button className="btn" disabled={!split.total || bad} onClick={save}>{split.total ? `Save ${rupees(split.total)}` : 'Enter an amount'}</button>}
    </>}>
      <Segmented options={[['debit', 'I paid'], ['credit', 'I received']] as const} value={direction}
        onChange={(d) => { setDirection(d); if (d === 'credit') split.set({ on: false }); }} />
      <input className="payee-input" list="known-payees" value={payee} onChange={(e) => pickPayee(e.target.value)} placeholder={direction === 'debit' ? 'Paid to (name or shop)' : 'Received from'}
        aria-label={direction === 'debit' ? 'Paid to' : 'Received from'} />
      {direction === 'debit' && <>{history}{recentChips}</>}{payeeList}

      {/* the amount: the biggest thing on the screen */}
      <label className="amount">
        <span className={`rs${total ? '' : ' dim'}`}>₹</span>
        <input className="num" inputMode="decimal" placeholder="0" aria-label="Amount in rupees" data-autofocus value={amount}
          onChange={(e) => setAmount(cleanAmount(e.target.value))} style={{ width: `${Math.max(1, amount.length || 1) * 0.62 + 0.2}em` }} />
      </label>

      <div style={{ marginTop: 14 }}><Segmented options={METHODS} value={method} onChange={(m) => { touched.current.method = true; setMethod(m); }} label="Paid by" /></div>
      {method === 'upi' && direction === 'debit' && (
        <div style={{ marginTop: 10 }}><Combobox label="UPI app" options={UPI_APPS.map((a) => ({ value: a, label: a.label }))} value={app} onChange={setApp} /></div>
      )}
      {draft?.bill && (
        <div className="card row read">
          <span className="mini-icon lime"><ReceiptText size={17} /></span>
          <span className="grow" style={{ fontSize: 15 }}>
            Read from your bill{draft.items?.length ? `: ${draft.items.length} item${draft.items.length > 1 ? 's' : ''}` : ''}. Check the amount before saving.
          </span>
          {!!draft.items?.length && split.mode !== 'items' && direction === 'debit' && (
            <button className="link" style={{ fontSize: 15, whiteSpace: 'nowrap' }} onClick={() => split.setMode('items')}>Split by item</button>
          )}
        </div>
      )}

      <div className="reason">
        <MessageSquareText size={18} className="faint" />
        <input value={note} onChange={(e) => { touched.current.note = true; setNote(e.target.value); }} maxLength={80} placeholder="What's it for?" aria-label="Reason" />
      </div>

      <h3 className="eyebrow">Category</h3>
      <CategoryPicker category={category} subcategory={subcategory} onChange={(c, s) => { touched.current.cat = true; setCategory(c); setSubcategory(s); }} />

      <h3 className="eyebrow">Trip or event</h3>
      <div className="list">
        <TripField value={trip} onChange={(v) => {
          setTrip(v);
          const g = v ? tripGroup(v) : undefined; // a trip's people join the split, unless you've already picked who
          if (g?.memberIds.length && !split.picked.length && direction === 'debit') split.set({ on: true, picked: g.memberIds });
        }} />
      </div>

      {direction === 'debit' && (
        <>
          <h3 className="eyebrow">Items</h3>
          <ItemsEditor split={split} />
          <h3 className="eyebrow">Who pays</h3>
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
        <label className="item">
          <span className="mini-icon"><CalendarDays size={17} /></span>
          <span className="grow">Date</span>
          <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value || today)} aria-label="Date" className="date" />
        </label>
        <BillField uri={bill} onChange={(u) => { removeBill(bill); setBill(u); }} />
      </div>
      <style jsx>{`
        .date { color: var(--ink); color-scheme: dark; font-size: 16px; }
        .read { margin-top: 14px; padding: 12px 14px; gap: 10px; }
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
