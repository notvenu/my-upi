'use client';
import { ArrowDownLeft, ChevronRight, Link2, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import Avatar from '@/components/Avatar';
import Sheet from '@/components/Sheet';
import TxnRow from '@/components/TxnRow';
import { addShare, db, listPeople, tripInfo } from '@/lib/db';
import { openPay, setNav } from '@/lib/nav';
import { shareUrl, sync, syncNow } from '@/lib/sync';
import { haptic, shareText, toast } from '@/lib/ui';
import { rupees } from '@/lib/upi';
import PersonSheet from './PersonSheet';

// One trip or event: add an expense (split between its people), see who owes what on it, ask them, share one link.
export default function TripSheet({ name, onClose, onEdit }: { name: string; onClose: () => void; onEdit: () => void }) {
  const { txns, people: ids, spent, owed } = tripInfo(name);
  const people = listPeople();
  const members = ids.map((id) => people.find((p) => p.id === id)).filter((p) => !!p);
  const [asking, setAsking] = useState<number | null>(null);
  const asked = people.find((p) => p.id === asking);
  const owedBy = (id: number) => owed.filter((x) => x.person_id === id).reduce((a, x) => a + x.amount, 0);
  const owedTotal = owed.reduce((a, x) => a + x.amount, 0);

  function add() {
    haptic();
    onClose();
    openPay(null, true, { trip: name, people: ids });
  }
  async function link() {
    const def = db.shares.find((s) => s.trip === name) ?? addShare(name, ids, name);
    await syncNow();
    const how = await shareText(`${name}: what everyone owes`, shareUrl(def.uuid));
    if (how) toast(how === 'copied' ? 'Link copied' : 'Link shared');
  }

  return (
    <>
      <Sheet full title={name} onClose={onClose} trailing={<button className="icon-btn" aria-label={`Edit ${name}`} onClick={onEdit}><Pencil size={17} /></button>}>
        <section className="card head">
          <p className="sub">Spent on this</p>
          <p className="num big">{rupees(spent)}</p>
          <p className="sub">{txns.length} payment{txns.length === 1 ? '' : 's'}{owedTotal ? ` · ${rupees(owedTotal)} owed to you` : ''}</p>
          <div className="faces">
            <Avatar name="You" size={30} />
            {members.map((p) => <Avatar key={p.id} name={p.name} size={30} />)}
            <button className="link" style={{ fontSize: 14, minHeight: 32, marginLeft: 6 }} onClick={onEdit}>{members.length ? `You + ${members.length}` : 'Add people'}</button>
          </div>
        </section>

        <div className="acts">
          <button className="btn lime" onClick={add}><Plus size={18} strokeWidth={2.4} /> Add expense</button>
          {sync.email && ids.length > 0 && <button className="btn soft" onClick={link}><Link2 size={17} /> Share link</button>}
        </div>

        {members.length > 0 && (
          <>
            <h3 className="eyebrow">Who owes you</h3>
            <div className="list wide">
              {members.map((p) => {
                const amt = owedBy(p.id);
                return (
                  <button key={p.id} className="item" disabled={!amt} onClick={() => setAsking(p.id)}>
                    <Avatar name={p.name} size={40} />
                    <span className="grow ellipsis">{p.name}</span>
                    {amt ? <><span className="num" style={{ color: 'var(--lime)' }}>{rupees(amt)}</span><ArrowDownLeft size={18} className="faint" /></>
                      : <span className="sub">Settled</span>}
                  </button>
                );
              })}
            </div>
            {owedTotal > 0 && <p className="hint">Tap someone to request their share of {name} in one message.</p>}
          </>
        )}

        <h3 className="eyebrow">Payments</h3>
        {txns.length
          ? <div className="list wide">{txns.map((t) => <TxnRow key={t.id} t={t} showDate onClick={() => setNav({ editing: t })} />)}</div>
          : (
            <button className="card empty" onClick={add}>
              <span className="grow" style={{ textAlign: 'left' }}><b style={{ fontWeight: 600 }}>Nothing yet</b><br /><span className="sub">Add the first expense: it splits equally between everyone here, or by item.</span></span>
              <ChevronRight size={18} strokeWidth={2.5} className="chev" />
            </button>
          )}
        <style jsx>{`
          .head { text-align: center; padding: 22px; }
          .big { font-size: 40px; font-weight: 700; letter-spacing: -0.03em; margin: 2px 0; }
          .faces { display: flex; justify-content: center; align-items: center; margin-top: 14px; }
          .faces :global(.av) { box-shadow: 0 0 0 2px var(--card); }
          .faces :global(.av + .av) { margin-left: -8px; }
          .acts { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; margin-top: 12px; }
          .empty { display: flex; align-items: center; gap: 12px; width: 100%; }
        `}</style>
      </Sheet>
      {asked && <PersonSheet p={asked} start="request" scope={`t:${name}`} onClose={() => setAsking(null)} />}
    </>
  );
}
