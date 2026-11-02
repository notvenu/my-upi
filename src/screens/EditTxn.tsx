'use client';
import { MapPin, MessageSquareText, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import BillField from '@/components/BillField';
import CategoryPicker from '@/components/CategoryPicker';
import CatIcon from '@/components/CatIcon';
import Combobox from '@/components/Combobox';
import ItemsEditor from '@/components/ItemsEditor';
import Segmented from '@/components/Segmented';
import Sheet from '@/components/Sheet';
import SplitEditor from '@/components/SplitEditor';
import TripField from '@/components/TripField';
import { ME } from '@/lib/calc';
import { addSplits, db, deleteTxn, linkReceived, listPeople, markSplits, methodOf, replaceSplits, txnSplits, updateTxn, type Method, type Split, type Txn } from '@/lib/db';
import { setNav } from '@/lib/nav';
import { useSplit } from '@/lib/split';
import { ask, removeBill, toast, toPaise } from '@/lib/ui';
import { cleanAmount, rupees } from '@/lib/upi';

const STATUSES = [['SUCCESS', 'Paid'], ['PENDING', 'Unconfirmed'], ['FAILURE', "Didn't pay"]] as const;
const METHODS: [Method, string][] = [['upi', 'UPI'], ['cash', 'Cash'], ['card', 'Card'], ['bank', 'Bank']];
const LINKS = [['repay', 'Paid me back'], ['owe', 'I owe it back']] as const;
const NONE = -1; // "Counts toward": not with anyone

// Edit an entry; right after "did you pay?" it's the details step (what for, category, split).
export default function EditTxn({ t: initial, onClose }: { t: Txn; onClose: () => void }) {
  const [t] = useState(() => structuredClone(initial));
  const [category, setCategory] = useState(t.category);
  const [subcategory, setSubcategory] = useState(t.subcategory);
  const [note, setNote] = useState(t.note ?? '');
  const [place, setPlace] = useState(t.place ?? '');
  const [trip, setTrip] = useState(t.trip ?? '');
  const [status, setStatus] = useState(t.status);
  const [bill, setBill] = useState(t.bill_uri);
  const [method, setMethod] = useState<Method>(methodOf(t) ?? 'upi');
  // received: counted with a person, as them paying you back (credit) or their money you owe back (debit)
  const [linkTo, setLinkTo] = useState(t.repay_of ?? t.owe_to ?? NONE);
  const [linkKind, setLinkKind] = useState<'repay' | 'owe'>(t.owe_to ? 'owe' : 'repay');
  const [amount, setAmount] = useState(String(t.amount / 100));
  const [payee, setPayee] = useState(t.payee_name ?? '');
  const [when, setWhen] = useState(t.created_at.slice(0, 16)); // datetime-local: YYYY-MM-DDTHH:MM
  const total = toPaise(amount);
  const existing = txnSplits(t.id);
  const unasked = existing.filter((x) => x.person_id && !x.paid_at && !x.requested_at).length;
  const split = useSplit(total, t.items ?? undefined);
  // an existing split is shown with each person's status; "Change split" reopens it in the editor, filled in
  const [resplit, setResplit] = useState(false);
  const editingSplit = !existing.length || resplit;
  // split by item: the items set the shares, so they're edited together with the split. Otherwise items can be listed any time.
  const itemsLocked = !editingSplit && !!t.items?.some((it) => it.who.length);
  function changeSplit() {
    const people = existing.filter((x) => x.person_id !== null);
    const equal = people.every((x) => x.amount === people[0]?.amount) && people[0]?.amount === Math.floor(total / (people.length + 1));
    split.set({
      on: true, picked: people.map((x) => x.person_id!), byItem: !!t.items?.some((it) => it.who.length),
      shares: equal ? {} : Object.fromEntries(people.map((x) => [x.person_id!, String(x.amount / 100)])),
    });
    setResplit(true);
  }
  // fresh from "did you pay?": nothing filled in yet, so this is the details step
  const [fresh] = useState(() => t.source === 'app' && t.category === 'Other' && !t.note && !existing.length);
  const who = (ids: number[]) =>
    ids.length ? ids.map((id) => (id === ME ? 'You' : db.people.find((p) => p.id === id)?.name.split(' ')[0] ?? '?')).join(', ') : 'Everyone';

  // Photos picked here but not saved get deleted; the saved one is removed only once a save replaces it.
  const changeBill = (u: string | null) => { if (bill !== t.bill_uri) removeBill(bill); setBill(u); };
  const cancel = () => { if (bill !== t.bill_uri) removeBill(bill); onClose(); };
  function save() {
    if (bill !== t.bill_uri) removeBill(t.bill_uri);
    const rows = editingSplit ? split.rows() : [];
    const wasTo = t.repay_of ?? t.owe_to ?? NONE, wasKind = t.owe_to ? 'owe' : 'repay';
    // a received amount counted with someone: take the old amount off them before it changes, then count the new one
    const relink = t.direction === 'credit' && wasTo !== NONE && total !== t.amount;
    if (relink) linkReceived(t.id, null, wasKind);
    updateTxn(t.id, {
      amount: total, payee_name: payee.trim() || null, created_at: when.length === 16 ? `${when}:00` : t.created_at,
      category, subcategory, note: note.trim() || null, status, bill_uri: bill, place: place.trim() || null, trip: trip.trim() || null, method,
      ...(itemsLocked ? {} : { items: split.itemsData() }),
    });
    if (resplit) replaceSplits(t.id, rows);
    else if (rows.length) addSplits(t.id, rows);
    if (t.direction === 'credit' && (relink || linkTo !== wasTo || (linkTo !== NONE && linkKind !== wasKind))) linkReceived(t.id, linkTo === NONE ? null : linkTo, linkKind);
    toast(resplit ? 'Saved · split updated' : rows.length ? `Saved · ${rows.length} split${rows.length > 1 ? 's' : ''} added` : 'Saved');
    onClose();
    // offer to ask for new shares right away
    const fresh = txnSplits(t.id).some((x) => x.person_id && !x.paid_at && !x.requested_at);
    if (rows.length && fresh && status !== 'FAILURE') setNav({ requestFor: t.id });
  }
  async function markPaid(x: Split) {
    const first = x.name.split(' ')[0];
    if (!(await ask(`Did ${first} pay you ${rupees(x.amount)}?`, 'Only their share of this payment is marked settled.', 'Yes, paid'))) return;
    markSplits([x.id], 'paid_at');
    toast(`${first}'s share marked paid`);
  }
  async function remove() {
    if (!(await ask('Delete this entry?', "Its splits and bill photo are deleted too. This can't be undone.", 'Delete', true))) return;
    removeBill(bill); removeBill(t.bill_uri); deleteTxn(t.id);
    toast('Entry deleted');
    onClose();
  }

  return (
    <Sheet title={fresh ? 'Add details' : undefined} onClose={cancel}
      footer={<button className="btn" disabled={!total || (editingSplit && split.myShare < 0) || split.overItems} onClick={save}>{fresh ? 'Done' : 'Save changes'}</button>}>
      <div className="center" style={{ display: 'grid', justifyItems: 'center', marginBottom: 22 }}>
        <CatIcon cat={category} status={status} size={60} />
        {/* amount, who, when: all editable in place */}
        <label className="amt" style={{ color: t.direction === 'credit' ? 'var(--green)' : undefined }}>
          <span className="rs">{t.direction === 'credit' ? '+₹' : '₹'}</span>
          <input className="num" inputMode="decimal" value={amount} onChange={(e) => setAmount(cleanAmount(e.target.value))} aria-label="Amount in rupees"
            style={{ width: `${Math.max(1, amount.length || 1) * 0.62 + 0.2}em` }} />
        </label>
        <input className="who-in" value={payee} onChange={(e) => setPayee(e.target.value)} placeholder={t.direction === 'credit' ? 'Received from' : 'Paid to'}
          aria-label={t.direction === 'credit' ? 'Received from' : 'Paid to'} />
        <input type="datetime-local" className="when" value={when} onChange={(e) => setWhen(e.target.value)} aria-label="Date and time" />
        <p className="sub">{[t.payee_vpa, t.app, t.sub_id && 'Autopay', t.bank_ref && `UPI ref ${t.bank_ref}`].filter(Boolean).join(' · ')}</p>
      </div>

      <label className="reason">
        <MessageSquareText size={18} className="faint" />
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={80} placeholder="What was it for?" aria-label="Reason" />
      </label>

      <h3 className="eyebrow">Category</h3>
      <CategoryPicker category={category} subcategory={subcategory} onChange={(c, s) => { setCategory(c); setSubcategory(s); }} />

      {t.direction === 'credit' && (
        <>
          <h3 className="eyebrow">Counts toward</h3>
          <Combobox label="From a person" placeholder="Not with anyone" value={linkTo}
            options={[{ value: NONE, label: 'Not with anyone' }, ...listPeople().map((p) => ({ value: p.id, label: p.name, hint: p.owed > 0 ? `owes ${rupees(p.owed)}` : p.owed < 0 ? `you owe ${rupees(-p.owed)}` : undefined }))]}
            onChange={setLinkTo} />
          {linkTo !== NONE && (
            <>
              <div style={{ marginTop: 10 }}><Segmented options={LINKS} value={linkKind} onChange={setLinkKind} label="What it was" /></div>
              <p className="hint">{linkKind === 'repay'
                ? 'Credit: comes off what they owe you, clearing their oldest splits first. A part payment is fine.'
                : 'Debit: their money you owe back. It nets against what they owe; past that, you owe them.'}</p>
            </>
          )}
        </>
      )}

      {t.direction === 'debit' && (
        <>
          <h3 className="eyebrow">Items</h3>
          {itemsLocked ? (
            <div className="list flush">
              {t.items!.map((it, i) => (
                <div key={i} className="item"><span className="grow">{it.name}<br /><span className="sub">{who(it.who)}</span></span><span className="num">{rupees(it.amount)}</span></div>
              ))}
            </div>
          ) : <ItemsEditor split={split} />}

          <h3 className="eyebrow">Who pays</h3>
          {!editingSplit ? (
            <>
              <div className="list flush">
                {existing.map((x) => (
                  <button key={x.id} className="item" disabled={!!x.paid_at} onClick={() => markPaid(x)}>
                    <span className="grow">{x.name}</span>
                    <span className="sub">{x.paid_at ? 'Paid' : x.requested_at ? 'Requested · tap if paid' : 'Not requested · tap if paid'}</span>
                    <span className="num">{rupees(x.amount)}</span>
                  </button>
                ))}
              </div>
              <div className="stack" style={{ marginTop: 10, gap: 4 }}>
                {unasked > 0 && (
                  <button className="btn soft" onClick={() => { onClose(); setNav({ requestFor: t.id }); }}>Request {unasked === 1 ? 'their share' : 'shares'} now</button>
                )}
                <button className="btn ghost" onClick={changeSplit}><Pencil size={17} /> Change split</button>
              </div>
            </>
          ) : (
            <>
              <SplitEditor split={split} />
              {resplit && <p className="hint">Anyone who&apos;d already paid keeps it: as paid if their share is the same, or as credit toward what they owe.</p>}
            </>
          )}
        </>
      )}

      <h3 className="eyebrow">Paid by</h3>
      <Segmented options={METHODS} value={method} onChange={setMethod} label="Paid by" />

      <h3 className="eyebrow">Details</h3>
      <div className="list">
        <label className="item"><span className="mini-icon"><MapPin size={17} /></span>
          <input className="grow" style={{ padding: '8px 0' }} value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Add a place" aria-label="Place" /></label>
        <TripField value={trip} onChange={setTrip} />
        <BillField uri={bill} onChange={changeBill} />
      </div>

      {!fresh && (
        <>
          <h3 className="eyebrow">Status</h3>
          <Segmented options={STATUSES} value={status as (typeof STATUSES)[number][0]} onChange={setStatus} label="Status" />
          <button className="btn danger" style={{ marginTop: 28 }} onClick={remove}><Trash2 size={18} /> Delete entry</button>
        </>
      )}
      <style jsx>{`
        .reason { display: flex; align-items: center; gap: 10px; background: var(--card); border-radius: 999px; padding: 0 20px; min-height: 54px; }
        .reason input { flex: 1; font-size: 16px; padding: 14px 0; }
        .amt { display: flex; justify-content: center; align-items: flex-start; margin-top: 12px; font-size: 46px; line-height: 1.1; cursor: text; }
        .amt input { font-size: inherit; text-align: center; max-width: 100%; padding: 0; color: inherit; caret-color: var(--green); }
        .rs { font-size: 24px; font-weight: 500; margin-top: 6px; margin-right: 2px; }
        .who-in { width: 100%; text-align: center; font-size: 17px; font-weight: 500; padding: 4px 0; }
        .when { color: var(--sub); color-scheme: dark; font-size: 15px; text-align: center; padding: 2px 0; }
      `}</style>
    </Sheet>
  );
}
