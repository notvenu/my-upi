'use client';
import { MapPin, MessageSquareText, Trash2 } from 'lucide-react';
import { useState } from 'react';
import BillField from '@/components/BillField';
import CategoryPicker from '@/components/CategoryPicker';
import CatIcon from '@/components/CatIcon';
import Segmented from '@/components/Segmented';
import Sheet from '@/components/Sheet';
import SplitEditor from '@/components/SplitEditor';
import TripField from '@/components/TripField';
import { ME } from '@/lib/calc';
import { addSplits, db, deleteTxn, methodOf, txnSplits, updateTxn, type Method, type Txn } from '@/lib/db';
import { setNav } from '@/lib/nav';
import { useSplit } from '@/lib/split';
import { ask, removeBill, shortDate, time12, toast } from '@/lib/ui';
import { rupees } from '@/lib/upi';

const STATUSES = [['SUCCESS', 'Paid'], ['PENDING', 'Unconfirmed'], ['FAILURE', "Didn't pay"]] as const;
const METHODS: [Method, string][] = [['upi', 'UPI'], ['cash', 'Cash'], ['card', 'Card'], ['bank', 'Bank']];

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
  const existing = txnSplits(t.id);
  const unasked = existing.filter((x) => x.person_id && !x.paid_at && !x.requested_at).length;
  const split = useSplit(t.amount);
  // fresh from "did you pay?": nothing filled in yet, so this is the details step
  const [fresh] = useState(() => t.source === 'app' && t.category === 'Other' && !t.note && !existing.length);
  const who = (ids: number[]) =>
    ids.length ? ids.map((id) => (id === ME ? 'You' : db.people.find((p) => p.id === id)?.name.split(' ')[0] ?? '?')).join(', ') : 'Everyone';

  // Photos picked here but not saved get deleted; the saved one is removed only once a save replaces it.
  const changeBill = (u: string | null) => { if (bill !== t.bill_uri) removeBill(bill); setBill(u); };
  const cancel = () => { if (bill !== t.bill_uri) removeBill(bill); onClose(); };
  function save() {
    if (bill !== t.bill_uri) removeBill(t.bill_uri);
    const rows = split.rows();
    updateTxn(t.id, {
      category, subcategory, note: note.trim() || null, status, bill_uri: bill, place: place.trim() || null, trip: trip.trim() || null, method,
      ...(rows.length ? { items: split.itemsData() } : {}),
    });
    if (rows.length) addSplits(t.id, rows);
    toast(rows.length ? `Saved · ${rows.length} split${rows.length > 1 ? 's' : ''} added` : 'Saved');
    onClose();
    if (rows.length && status !== 'FAILURE') setNav({ requestFor: t.id }); // offer to ask for the new shares right away
  }
  async function remove() {
    if (!(await ask('Delete this entry?', "Its splits and bill photo are deleted too. This can't be undone.", 'Delete', true))) return;
    removeBill(bill); removeBill(t.bill_uri); deleteTxn(t.id);
    toast('Entry deleted');
    onClose();
  }

  return (
    <Sheet title={fresh ? 'Add details' : undefined} onClose={cancel}
      footer={<button className="btn" disabled={split.myShare < 0 || split.overItems} onClick={save}>{fresh ? 'Done' : 'Save changes'}</button>}>
      <div className="center" style={{ display: 'grid', justifyItems: 'center', marginBottom: 22 }}>
        <CatIcon cat={category} status={status} size={60} />
        <p className="num" style={{ fontSize: 46, marginTop: 12, lineHeight: 1.1, color: t.direction === 'credit' ? 'var(--green)' : undefined }}>
          {t.direction === 'credit' ? '+' : ''}{rupees(t.amount)}
        </p>
        <p className="sub">{[t.payee_name, t.payee_vpa].filter(Boolean).join(' · ')}</p>
        <p className="sub">{shortDate(t.created_at)}, {time12(t.created_at)}{t.app ? ` · ${t.app}` : ''}{t.sub_id ? ' · Autopay' : ''}{t.bank_ref ? ` · UPI ref ${t.bank_ref}` : ''}</p>
      </div>

      <label className="reason">
        <MessageSquareText size={18} className="faint" />
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={80} placeholder="What was it for?" aria-label="Reason" />
      </label>

      <h3 className="eyebrow">Category</h3>
      <CategoryPicker category={category} subcategory={subcategory} onChange={(c, s) => { setCategory(c); setSubcategory(s); }} />

      {t.direction === 'debit' && (
        <>
          <h3 className="eyebrow">Split</h3>
          {existing.length ? (
            <>
              {t.items?.length ? (
                <div className="list flush" style={{ marginBottom: 10 }}>
                  {t.items.map((it, i) => (
                    <div key={i} className="item"><span className="grow">{it.name}<br /><span className="sub">{who(it.who)}</span></span><span className="num">{rupees(it.amount)}</span></div>
                  ))}
                </div>
              ) : null}
              <div className="list flush">
                {existing.map((x) => (
                  <div key={x.id} className="item">
                    <span className="grow">{x.name}</span>
                    <span className="sub">{x.paid_at ? 'Paid' : x.requested_at ? 'Requested' : 'Not requested'}</span>
                    <span className="num">{rupees(x.amount)}</span>
                  </div>
                ))}
              </div>
              {unasked > 0 && (
                <button className="btn soft" style={{ marginTop: 10 }} onClick={() => { onClose(); setNav({ requestFor: t.id }); }}>Request {unasked === 1 ? 'their share' : 'shares'} now</button>
              )}
            </>
          ) : <SplitEditor split={split} />}
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
      `}</style>
    </Sheet>
  );
}
