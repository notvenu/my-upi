'use client';
import { ArrowDownLeft, Link2, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import Avatar from '@/components/Avatar';
import Sheet from '@/components/Sheet';
import { groupShare, listPeople, type Group } from '@/lib/db';
import { openPay } from '@/lib/nav';
import { shareUrl, sync, syncNow } from '@/lib/sync';
import { haptic, shareText, toast } from '@/lib/ui';
import { rupees } from '@/lib/upi';
import PersonSheet from './PersonSheet';

// One group (Roommates): add an expense split between them, see who owes what, ask them, share the group's monthly link.
export default function GroupSheet({ g, onClose, onEdit }: { g: Group; onClose: () => void; onEdit: () => void }) {
  const people = listPeople();
  const members = g.memberIds.map((id) => people.find((p) => p.id === id)).filter((p) => !!p);
  const owedTotal = members.reduce((a, p) => a + Math.max(0, p.owed), 0);
  const [asking, setAsking] = useState<number | null>(null);
  const asked = people.find((p) => p.id === asking);

  function add() {
    haptic();
    onClose();
    openPay(null, true, { people: g.memberIds });
  }
  async function link() {
    const def = groupShare(g);
    await syncNow();
    const how = await shareText(`${g.name}: what everyone owes`, shareUrl(def.uuid));
    if (how) toast(how === 'copied' ? 'Link copied' : 'Link shared');
  }

  return (
    <>
      <Sheet full title={g.name} onClose={onClose} trailing={<button className="icon-btn" aria-label={`Edit ${g.name}`} onClick={onEdit}><Pencil size={17} /></button>}>
        <section className="card head">
          <p className="sub">Owed to you</p>
          <p className="num big">{rupees(owedTotal)}</p>
          <div className="faces">
            <Avatar name="You" size={30} />
            {members.map((p) => <Avatar key={p.id} name={p.name} size={30} />)}
            <button className="link" style={{ fontSize: 14, minHeight: 32, marginLeft: 6 }} onClick={onEdit}>{members.length ? `You + ${members.length}` : 'Add people'}</button>
          </div>
        </section>

        <div className="acts">
          <button className="btn lime" disabled={!members.length} onClick={add}><Plus size={18} strokeWidth={2.4} /> Add expense</button>
          {sync.email && members.length > 0 && <button className="btn soft" onClick={link}><Link2 size={17} /> Share link</button>}
        </div>
        {sync.email && members.length > 0 && <p className="hint">One link for {g.name}: this month&apos;s splits, anything unpaid carried over, and each person&apos;s history.</p>}

        {members.length > 0 && (
          <>
            <h3 className="eyebrow">Who owes you</h3>
            <div className="list wide">
              {members.map((p) => (
                <button key={p.id} className="item" disabled={p.owed <= 0} onClick={() => setAsking(p.id)}>
                  <Avatar name={p.name} size={40} />
                  <span className="grow ellipsis">{p.name}</span>
                  {p.owed > 0 ? <><span className="num" style={{ color: 'var(--lime)' }}>{rupees(p.owed)}</span><ArrowDownLeft size={18} className="faint" /></>
                    : <span className="sub">{p.owed < 0 ? `You owe ${rupees(-p.owed)}` : 'Settled'}</span>}
                </button>
              ))}
            </div>
            {owedTotal > 0 && <p className="hint">Tap someone to request what they owe in one message.</p>}
          </>
        )}
        <style jsx>{`
          .head { text-align: center; padding: 22px; }
          .big { font-size: 40px; font-weight: 700; letter-spacing: -0.03em; margin: 2px 0; color: var(--lime); }
          .faces { display: flex; justify-content: center; align-items: center; margin-top: 14px; }
          .faces :global(.av) { box-shadow: 0 0 0 2px var(--card); }
          .faces :global(.av + .av) { margin-left: -8px; }
          .acts { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; margin-top: 12px; }
        `}</style>
      </Sheet>
      {asked && <PersonSheet p={asked} start="request" onClose={() => setAsking(null)} />}
    </>
  );
}
