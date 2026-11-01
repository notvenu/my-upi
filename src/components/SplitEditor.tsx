'use client';
import { useState } from 'react';
import { ME } from '@/lib/calc';
import { listGroups, listPeople } from '@/lib/db';
import type { Split } from '@/lib/split';
import { haptic, toPaise } from '@/lib/ui';
import { cleanAmount, rupees } from '@/lib/upi';
import Avatar from './Avatar';
import Combobox from './Combobox';
import PersonForm from './PersonForm';
import Segmented from './Segmented';

const MODES = [['me', 'Just me'], ['equal', 'Equally'], ['items', 'By item']] as const;
const ABOUT = {
  me: 'Only you pay. Nothing to ask back.',
  equal: "Everyone in it pays the same. Type a share to change someone's.",
  items: 'Tap who had each item in Items above. Tax and anything not listed is shared by everyone.',
};

// Who pays for this: just you, everyone equally (or typed shares), or item by item.
// By item uses the Items list (ItemsEditor), which shows who-had-it pills once people are picked here.
export default function SplitEditor({ split }: { split: Split }) {
  const people = listPeople();
  const groups = listGroups().filter((g) => g.memberIds.length);
  const [adding, setAdding] = useState<string | null>(null); // a new person's name, while their form is open
  const nameOf = (id: number) => (id === ME ? 'You' : people.find((p) => p.id === id)?.name ?? '?');
  // Groups and trips sit in the same list as negative ids: picking one adds its people.
  const pickOptions = [
    ...groups.map((g) => ({ value: -g.id, label: g.name, hint: `${g.trip ? 'Trip · ' : ''}${g.memberIds.length} people` })),
    ...people.map((p) => ({ value: p.id, label: p.name })),
  ];
  const pick = (ids: number[]) => {
    haptic();
    const picked = [...new Set(ids.flatMap((id) => (id < 0 ? groups.find((g) => g.id === -id)?.memberIds ?? [] : [id])))];
    split.set({ picked, items: split.items.map((it) => ({ ...it, who: it.who.filter((id) => id === ME || picked.includes(id)) })) });
  };

  const everyone = [ME, ...split.picked];
  // the items each person is in, for the summary
  const forWhom = (who: number[]) => (who.length ? who : everyone);
  const theirItems = (id: number) => split.items.filter((it) => toPaise(it.amount) && forWhom(it.who).includes(id)).map((it) => it.name.trim() || 'Item');
  const others = split.picked.length > 0;

  return (
    <>
      <Segmented options={MODES} value={split.mode} onChange={split.setMode} label="Who pays" />
      <p className="hint">{ABOUT[split.mode]}</p>

      {split.mode !== 'me' && (
        <div style={{ marginTop: 10 }}>
          <Combobox multiple label="Who's in it" placeholder={people.length ? 'Who else was in it? A group, trip or people' : 'Type a name to add someone'}
            options={pickOptions} values={split.picked} onChange={pick} onAdd={(n) => { setAdding(n); }} addLabel="New person" />
        </div>
      )}

      {split.mode === 'equal' && split.picked.length > 0 && (
        <div className="list" style={{ marginTop: 10 }}>
          {split.picked.map((id) => (
            <div key={id} className="item">
              <Avatar name={nameOf(id)} size={32} />
              <span className="grow ellipsis">{nameOf(id)}</span>
              <label className="share"><span className="sub">₹</span>
                <input className="num" inputMode="decimal" value={split.shares[id] ?? ''} placeholder={(split.equalShare / 100).toFixed(2)} aria-label={`${nameOf(id)}'s share`}
                  onChange={(e) => split.set({ shares: { ...split.shares, [id]: cleanAmount(e.target.value) } })} />
              </label>
            </div>
          ))}
          <div className="item">
            <Avatar name="You" size={32} />
            <span className="grow" style={{ fontWeight: 600 }}>Your share</span>
            <span className="num" style={{ color: split.myShare < 0 ? 'var(--red)' : undefined }}>{rupees(split.myShare)}</span>
          </div>
        </div>
      )}

      {split.mode === 'items' && (
        <>
          {!others && <p className="hint">Add who was in it, then tap who had each item in Items.</p>}

          {others && (
            <>
              <h3 className="eyebrow">Who pays what</h3>
              <div className="list">
                {[...split.picked, ME].map((id) => {
                  const mine = theirItems(id);
                  const amt = id === ME ? split.myShare : split.shareOf(id);
                  return (
                    <div key={id} className="item">
                      <Avatar name={nameOf(id)} size={32} />
                      <span className="grow" style={{ minWidth: 0 }}>
                        <span className="ellipsis" style={{ display: 'block', fontWeight: id === ME ? 600 : 400 }}>{id === ME ? 'You' : nameOf(id)}</span>
                        <span className="sub ellipsis" style={{ display: 'block', fontSize: 13 }}>{mine.length ? mine.join(', ') : 'Only the shared part'}</span>
                      </span>
                      <span className="num" style={{ color: amt < 0 ? 'var(--red)' : undefined }}>{rupees(amt)}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      {adding !== null && <PersonForm person={{ name: adding }} onClose={(id) => { setAdding(null); if (id) split.set({ picked: [...split.picked, id] }); }} />}
      <style jsx>{`
        .share { display: flex; align-items: center; gap: 4px; width: 112px; min-height: 40px; padding: 0 12px; border-radius: 12px; background: var(--bg); }
        .share input { flex: 1; text-align: right; font-size: 16px; width: 100%; }
      `}</style>
    </>
  );
}
