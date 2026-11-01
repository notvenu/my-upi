'use client';
import { Plus, X } from 'lucide-react';
import { ME } from '@/lib/calc';
import { listPeople } from '@/lib/db';
import type { Split } from '@/lib/split';
import { haptic, toPaise } from '@/lib/ui';
import { cleanAmount, rupees } from '@/lib/upi';

const EVERYONE = -1; // the "Everyone" pill on an item

// What was bought, line by line with prices. Works on its own; when split "By item" with people,
// each line gets pills for who had it (Everyone, You, then each person).
export default function ItemsEditor({ split }: { split: Split }) {
  const people = listPeople();
  const first = (id: number) => (id === ME ? 'You' : people.find((p) => p.id === id)?.name ?? '?').split(' ')[0];
  const everyone = [ME, ...split.picked];
  const pills = split.mode === 'items' && split.picked.length > 0;
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

  return (
    <>
      <div className="bill">
        {split.items.map((it, i) => {
          const n = (it.who.length ? it.who : everyone).length, price = toPaise(it.amount);
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
              {pills && (
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
          <div className="line rest">
            <span className="grow">Rest of the bill<br /><span className="sub">Tax and anything not listed{split.mode === 'items' ? ' · shared by everyone' : ''}</span></span>
            <span className="num">{rupees(rest)}</span>
          </div>
        )}
      </div>
      {split.overItems && <p className="hint" style={{ color: 'var(--red)' }}>Items add up to {rupees(split.itemised)}, more than the {rupees(split.total)} paid.</p>}
      <style jsx>{`
        /* the bill: one card, a line per item, the faces it's for underneath */
        .bill { background: var(--card); border-radius: var(--radius); box-shadow: inset 0 0 0 .5px rgb(255 255 255 / .05); overflow: hidden; }
        .line { padding: 12px 12px 12px 16px; }
        .line + .line, .line + .add, .rest { border-top: .5px solid var(--line); }
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
