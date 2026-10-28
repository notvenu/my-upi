'use client';
import { Plus, Users, X } from 'lucide-react';
import { useState } from 'react';
import { ME } from '@/lib/calc';
import { listGroups, listPeople } from '@/lib/db';
import type { Split } from '@/lib/split';
import { haptic } from '@/lib/ui';
import { cleanAmount, rupees } from '@/lib/upi';
import Avatar from './Avatar';
import Combobox from './Combobox';
import PersonForm from './PersonForm';
import Segmented from './Segmented';

// Who was in it, and how it splits: equally (or typed shares), or item by item.
export default function SplitEditor({ split }: { split: Split }) {
  const people = listPeople();
  const groups = listGroups().filter((g) => g.memberIds.length);
  const [adding, setAdding] = useState<string | null>(null); // a new person's name, while their form is open

  // Groups sit in the same list as negative ids: picking one adds its members.
  const pickOptions = [
    ...groups.map((g) => ({ value: -g.id, label: g.name, hint: `${g.memberIds.length} people` })),
    ...people.map((p) => ({ value: p.id, label: p.name })),
  ];
  const pick = (ids: number[]) => {
    haptic();
    const picked = [...new Set(ids.flatMap((id) => (id < 0 ? groups.find((g) => g.id === -id)?.memberIds ?? [] : [id])))];
    split.set({ picked, items: split.items.map((it) => ({ ...it, who: it.who.filter((id) => id === ME || picked.includes(id)) })) });
  };
  // An item is for everyone (no one listed) or the people chosen.
  const whoOptions = [{ value: ME, label: 'Me' }, ...split.picked.map((id) => ({ value: id, label: people.find((p) => p.id === id)?.name ?? '' }))];
  const rest = split.total - split.itemised;
  const setItem = (i: number, patch: Partial<Split['items'][number]>) => split.set({ items: split.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });

  return (
    <>
      <div className="list">
        <label className="item">
          <span className="mini-icon"><Users size={17} /></span>
          <span className="grow">Split with others</span>
          <input type="checkbox" role="switch" className="switch" checked={split.on} onChange={(e) => { haptic(); split.set({ on: e.target.checked }); }} />
        </label>

        {split.on && (
          <>
            <div style={{ padding: 12 }}>
              <Combobox multiple label="Split with" placeholder={people.length ? 'Who was in it?' : 'Type a name to add someone'} options={pickOptions}
                values={split.picked} onChange={pick} onAdd={(n) => { setAdding(n); }} addLabel="New person" />
            </div>

            {split.picked.length > 0 && (
              <div style={{ padding: '6px 12px 12px' }}>
                <Segmented options={[['equal', 'Equally'], ['items', 'By item']] as const} value={split.byItem ? 'items' : 'equal'} label="How to split"
                  onChange={(v) => {
                    const byItem = v === 'items';
                    split.set({ byItem, items: byItem && !split.items.length ? [{ name: '', amount: '', who: [] }] : split.items });
                  }} />
              </div>
            )}

            {split.byItem && split.picked.length > 0 && (
              <>
                {split.items.map((it, i) => (
                  <div key={i} className="bill-item">
                    <div className="row" style={{ gap: 8 }}>
                      <input className="grow name" value={it.name} onChange={(e) => setItem(i, { name: e.target.value })} placeholder="Item, like tomatoes" aria-label={`Item ${i + 1}`} />
                      <label className="share"><span className="sub">₹</span>
                        <input className="num" inputMode="decimal" value={it.amount} placeholder="0" aria-label={`Item ${i + 1} amount`}
                          onChange={(e) => setItem(i, { amount: cleanAmount(e.target.value) })} />
                      </label>
                      <button className="icon-btn plain" aria-label={`Remove item ${i + 1}`} onClick={() => split.set({ items: split.items.filter((_, j) => j !== i) })}><X size={18} /></button>
                    </div>
                    <div className="who">
                      <Combobox multiple label={`Item ${i + 1} is for`} placeholder="Everyone" options={whoOptions} values={it.who} onChange={(who) => setItem(i, { who })} />
                    </div>
                  </div>
                ))}
                <button className="item add-item" onClick={() => { haptic(); split.addItem(); }}><Plus size={18} /> Add item</button>
                {split.overItems
                  ? <p className="hint" style={{ color: 'var(--red)', padding: '0 16px 8px' }}>Items add up to {rupees(split.itemised)}, more than the {rupees(split.total)} paid.</p>
                  : rest > 0 && split.itemised > 0 && <p className="hint" style={{ padding: '0 16px 8px' }}>{rupees(rest)} not itemised is shared by everyone.</p>}
              </>
            )}

            {split.picked.map((id) => {
              const p = people.find((x) => x.id === id);
              if (!p) return null;
              return (
                <div key={id} className="item">
                  <Avatar name={p.name} size={32} />
                  <span className="grow ellipsis">{p.name}</span>
                  {split.byItem ? <span className="num">{rupees(split.shareOf(id))}</span> : (
                    <label className="share"><span className="sub">₹</span>
                      <input className="num" inputMode="decimal" value={split.shares[id] ?? ''} placeholder={(split.equalShare / 100).toFixed(2)} aria-label={`${p.name}'s share`}
                        onChange={(e) => split.set({ shares: { ...split.shares, [id]: cleanAmount(e.target.value) } })} />
                    </label>
                  )}
                </div>
              );
            })}
            {split.picked.length > 0 && (
              <div className="item">
                <Avatar name="You" size={32} />
                <span className="grow" style={{ fontWeight: 600 }}>Your share</span>
                <span className="num" style={{ color: split.myShare < 0 ? 'var(--red)' : undefined }}>{rupees(split.myShare)}</span>
              </div>
            )}
          </>
        )}
      </div>
      {split.on && split.picked.length > 0 && (
        <p className="hint">{split.byItem ? 'Tag each item with who it was for. ' : split.total ? 'Split equally unless you type a share. ' : ''}Send requests from People when you&apos;re ready.</p>
      )}
      {adding !== null && <PersonForm person={{ name: adding }} onClose={(id) => { setAdding(null); if (id) split.set({ picked: [...split.picked, id] }); }} />}
      <style jsx>{`
        .share { display: flex; align-items: center; gap: 4px; width: 112px; min-height: 40px; padding: 0 12px; border-radius: 12px; background: var(--bg); }
        .share input { flex: 1; text-align: right; font-size: 16px; width: 100%; }
        .bill-item { padding: 10px 12px 8px 16px; border-top: .5px solid var(--line); }
        .bill-item .name { min-width: 0; font-size: 16px; padding: 8px 0; }
        .who { margin-top: 8px; }
        .add-item { color: var(--lime); font-weight: 600; gap: 8px; }
      `}</style>
    </>
  );
}
