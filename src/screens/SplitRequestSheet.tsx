'use client';
import { Check, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import Avatar from '@/components/Avatar';
import Sheet from '@/components/Sheet';
import { db, listPeople, txnSplits } from '@/lib/db';
import { rupees } from '@/lib/upi';
import PersonSheet from './PersonSheet';

// Right after a split payment: ask each person for their share now, or leave it for the monthly/trip request.
export default function SplitRequestSheet({ txnId, onClose }: { txnId: number; onClose: () => void }) {
  const t = db.txns.find((x) => x.id === txnId);
  const splits = txnSplits(txnId).filter((s) => s.person_id && !s.paid_at);
  const [asking, setAsking] = useState<number | null>(null);
  const person = listPeople().find((p) => p.id === asking);

  return (
    <>
      <Sheet title="Request your split now?" onClose={onClose}>
        <p className="sub" style={{ margin: '0 4px 16px', fontSize: 15 }}>
          {t?.note || t?.payee_name || 'This payment'}{t ? ` · ${rupees(t.amount)}` : ''}. Ask now, or later from People: they can pay for a whole month or trip in one go.
        </p>
        <div className="list wide">
          {splits.map((s) => (
            <button key={s.id} className="item" onClick={() => setAsking(s.person_id)}>
              <Avatar name={s.name} size={40} />
              <span className="grow"><span className="ellipsis" style={{ display: 'block' }}>{s.name}</span>
                <span className="sub" style={{ display: 'block', fontSize: 14 }}>{s.requested_at ? 'Requested' : 'Not asked yet'}</span></span>
              <span className="num" style={{ color: 'var(--lime)' }}>{rupees(s.amount)}</span>
              {s.requested_at ? <Check size={18} style={{ color: 'var(--lime)' }} /> : <ChevronRight size={18} strokeWidth={2.5} className="chev" />}
            </button>
          ))}
        </div>
        <button className="btn soft" style={{ marginTop: 18 }} onClick={onClose}>{splits.every((s) => s.requested_at) ? 'Done' : 'Later'}</button>
      </Sheet>
      {person && <PersonSheet p={person} start="request" scope={`x:${txnId}`} txnId={txnId} onClose={() => setAsking(null)} />}
    </>
  );
}
