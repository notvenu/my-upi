'use client';
import { Plus, X } from 'lucide-react';
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
  items: 'Tap who had each item. Tax and anything not listed is shared by everyone.',
};
const EVERYONE = -1; // the "Everyone" pill on an item

// Who pays for this: just you, everyone equally (or typed shares), or item by item.
// By item reads like the bill: each line with its price, and pills for who had it (Everyone, You, then each person).
export default function SplitEditor({ split }: { split: Split }) {
  const people = listPeople();
  const groups = listGroups().filter((g) => g.memberIds.length);
  const [adding, setAdding] = useState<string | null>(null); // a new person's name, while their form is open
  const nameOf = (id: number) => (id === ME ? 'You' : people.find((p) => p.id === id)?.name ?? '?');
  const first = (id: number) => nameOf(id).split(' ')[0];

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
  const setItem = (i: number, patch: Partial<Split['items'][number]>) => split.set({ items: split.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
  // who = [] means everyone, so people added later share it too. Tapping a name on an "Everyone" item makes it theirs alone.
  const isOn = (who: number[], id: number) => (id === EVERYONE ? !who.length : who.includes(id));
  const toggle = (i: number, id: number) => {
    haptic();
    const cur = split.items[i].who;
    let next = id === EVERYONE ? [] : !cur.length ? [id] : cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    if (everyone.every((x) => next.includes(x))) next = [];
    setItem(i, { who: next });
  };
  const rest = split.total - split.itemised;
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
          <div className="bill">
            {split.items.map((it, i) => {
              const n = forWhom(it.who).length, price = toPaise(it.amount);
              return (
                <div key={i} className="line">
                  <div className="top">
                    <input className="name" value={it.name} onChange={(e) => setItem(i, { name: e.target.value })} placeholder={`Item ${i + 1}, like paneer`} aria-label={`Item ${i + 1}`} />
                    <label className="price"><span className="sub">₹</span>
                      <input className="num" inputMode="decimal" value={it.amount} placeholder="0" aria-label={`Item ${i + 1} price`}
                        onChange={(e) => setItem(i, { amount: cleanAmount(e.target.value) })}
                        onKeyDown={(e) => { if (e.key === 'Enter' && i === split.items.length - 1) split.addItem(); }} />
                    </label>
                    <button className="icon-btn plain del" aria-label={`Remove item ${i + 1}`} onClick={() => split.set({ items: split.items.filter((_, j) => j !== i) })}><X size={16} /></button>
                  </div>
                  {others && (
                    <div className="for" role="group" aria-label={`Who had item ${i + 1}`}>
                      {[EVERYONE, ...everyone].map((id) => (
                        <button key={id} className={`who${isOn(it.who, id) ? ' on' : ''}`} aria-pressed={isOn(it.who, id)} onClick={() => toggle(i, id)}>
                          {id === EVERYONE ? 'Everyone' : first(id)}
                        </button>
                      ))}
                      {price > 0 && n > 1 && <span className="sub each">{rupees(Math.floor(price / n))} each</span>}
                    </div>
                  )}
                </div>
              );
            })}
            <button className="add" onClick={() => { haptic(); split.addItem(); }}><Plus size={17} /> Add item</button>
            {rest > 0 && split.itemised > 0 && (
              <div className="line rest"><span className="grow">Rest of the bill<br /><span className="sub">Tax and anything not listed · shared by everyone</span></span><span className="num">{rupees(rest)}</span></div>
            )}
          </div>
          {split.overItems && <p className="hint" style={{ color: 'var(--red)' }}>Items add up to {rupees(split.itemised)}, more than the {rupees(split.total)} paid.</p>}
          {!others && <p className="hint">Add who was in it above, then tap who had each item.</p>}

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
        /* the bill: one card, a line per item, the faces it's for underneath */
        .bill { margin-top: 10px; background: var(--card); border-radius: var(--radius); box-shadow: inset 0 0 0 .5px rgb(255 255 255 / .05); overflow: hidden; }
        .line { padding: 12px 12px 12px 16px; }
        .line + .line, .add, .rest { border-top: .5px solid var(--line); }
        .top { display: flex; align-items: center; gap: 8px; }
        .name { flex: 1; min-width: 0; font-size: 16px; padding: 6px 0; }
        .price { display: flex; align-items: center; gap: 4px; width: 104px; min-height: 40px; padding: 0 12px; border-radius: 12px; background: var(--bg); }
        .price input { flex: 1; width: 100%; text-align: right; font-size: 16px; }
        .del { width: 32px; height: 32px; color: var(--sub); }
        .for { display: flex; align-items: center; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
        .who { min-height: 34px; padding: 0 12px; border-radius: 999px; font-size: 14px; font-weight: 500; color: var(--sub);
          box-shadow: inset 0 0 0 1px var(--line); transition: background .2s, color .2s, transform .3s var(--spring); }
        .who.on { background: var(--lime); color: var(--on-lime); box-shadow: none; }
        .who:active { transform: scale(.92); }
        .each { font-size: 13px; margin-left: auto; }
        .add { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 50px; padding: 0 16px; color: var(--lime); font-weight: 600; }
        .rest { display: flex; align-items: center; gap: 12px; }
      `}</style>
    </>
  );
}
