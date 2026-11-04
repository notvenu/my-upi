'use client';
import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import CatIcon from '@/components/CatIcon';
import Sheet from '@/components/Sheet';
import { budgetSuggestions, getBudgets, listCategories, setBudgets, spentByCategory } from '@/lib/db';
import { haptic, toast, toPaise } from '@/lib/ui';
import { cleanAmount, rupees } from '@/lib/upi';

// A monthly limit per category. Home turns them into "safe to spend today"; going near or over one is pointed out.
export default function Budgets({ onClose }: { onClose: () => void }) {
  const saved = getBudgets();
  const suggested = budgetSuggestions();
  const spent = spentByCategory();
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(saved).map(([c, v]) => [c, String(v / 100)])));
  // categories with a limit or a suggestion first, the rest after
  const cats = listCategories().sort((a, b) => Number(!(a in saved || a in suggested)) - Number(!(b in saved || b in suggested)));
  const total = Object.values(vals).reduce((a, v) => a + toPaise(v), 0);
  const thisMonth = (c: string) => spent[c] ?? 0;

  function save() {
    setBudgets(Object.fromEntries(Object.entries(vals).map(([c, v]) => [c, toPaise(v)])));
    toast(total ? `Budget saved: ${rupees(total)} a month` : 'Budgets cleared');
    onClose();
  }

  return (
    <Sheet full title="Budgets" onClose={onClose} footer={<button className="btn" onClick={save}>{total ? `Save · ${rupees(total)} a month` : 'Save'}</button>}>
      <p className="sub" style={{ margin: '0 4px 14px', fontSize: 15 }}>A monthly limit for the categories you want to watch. Leave the rest empty.</p>
      {Object.keys(suggested).length > 0 && (
        <button className="btn soft" style={{ width: '100%', marginBottom: 14 }} onClick={() => { haptic(); setVals({ ...vals, ...Object.fromEntries(Object.entries(suggested).map(([c, v]) => [c, String(v / 100)])) }); }}>
          <Sparkles size={17} /> Use my usual months
        </button>
      )}
      <div className="list wide">
        {cats.map((c) => {
          const limit = toPaise(vals[c] ?? ''), used = thisMonth(c);
          return (
            <label key={c} className="item">
              <CatIcon cat={c} size={40} />
              <span className="grow" style={{ minWidth: 0 }}>
                <span className="ellipsis" style={{ display: 'block' }}>{c}</span>
                <span className="sub" style={{ display: 'block', fontSize: 13 }}>
                  {rupees(used)} this month{suggested[c] ? ` · usually ${rupees(suggested[c])}` : ''}
                </span>
                {limit > 0 && <span className="bar"><i className={used >= limit ? 'over' : used >= limit * 0.9 ? 'near' : ''} style={{ width: `${Math.min(100, (used / limit) * 100)}%` }} /></span>}
              </span>
              <span className="amt"><span className="sub">₹</span>
                <input className="num" inputMode="decimal" placeholder="—" value={vals[c] ?? ''} aria-label={`${c} monthly limit`}
                  onChange={(e) => setVals({ ...vals, [c]: cleanAmount(e.target.value) })} />
              </span>
            </label>
          );
        })}
      </div>
      <style jsx>{`
        .amt { display: flex; align-items: center; gap: 2px; background: var(--bg); border-radius: 12px; padding: 0 10px; min-height: 44px; }
        .amt input { width: 72px; font-size: 17px; text-align: right; }
        .bar { display: block; height: 4px; border-radius: 2px; background: var(--raised); margin-top: 6px; overflow: hidden; }
        .bar i { display: block; height: 100%; background: var(--lime); }
        .bar i.near { background: var(--amber); }
        .bar i.over { background: var(--red); }
      `}</style>
    </Sheet>
  );
}
