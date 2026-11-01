'use client';
import { ChevronRight, Plus, Trash2, TrendingDown, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import Combobox from '@/components/Combobox';
import Sheet from '@/components/Sheet';
import { addToInvestment, deleteInvestment, listInvestments, saveInvestment } from '@/lib/db';
import { ask, ddmon as day, haptic, toast, toPaise } from '@/lib/ui';
import { cleanAmount, rupees } from '@/lib/upi';

const KINDS = ['Mutual fund', 'SIP', 'Stocks', 'FD', 'RD', 'PPF', 'NPS', 'EPF', 'Gold', 'Savings', 'Crypto', 'Other'];
type Draft = { id?: number; name: string; kind: string; invested: string; value: string; goal: string; note: string };
const str = (paise: number | null) => (paise ? String(paise / 100) : '');
const pctOf = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);

// Gain or loss, with an arrow and a word so it never rests on colour alone.
function Gain({ value, invested, size = 14 }: { value: number; invested: number; size?: number }) {
  const g = value - invested;
  if (!invested || !g) return <span className="sub" style={{ fontSize: size }}>No change</span>;
  const Icon = g > 0 ? TrendingUp : TrendingDown;
  return (
    <span style={{ fontSize: size, color: g > 0 ? 'var(--green)' : 'var(--red)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <Icon size={size + 1} aria-hidden="true" />{g > 0 ? '+' : '−'}{rupees(Math.abs(g))} ({Math.abs(pctOf(g, invested))}%)
    </span>
  );
}

// What you've put away: funds, FDs, stocks, savings pots. You update values yourself; nothing is fetched.
export default function Investments({ onClose }: { onClose: () => void }) {
  const list = listInvestments();
  const invested = list.reduce((a, i) => a + i.invested, 0);
  const value = list.reduce((a, i) => a + i.value, 0);
  const byKind = [...list.reduce((m, i) => m.set(i.kind, (m.get(i.kind) ?? 0) + i.value), new Map<string, number>())].sort((a, b) => b[1] - a[1]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [adding, setAdding] = useState('');
  const edit = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const open = draft?.id ? list.find((i) => i.id === draft.id) : undefined;

  function save() {
    if (!draft) return;
    const inv = toPaise(draft.invested);
    saveInvestment({ id: draft.id, name: draft.name, kind: draft.kind, invested: inv, value: draft.value ? toPaise(draft.value) : inv, goal: toPaise(draft.goal) || null, note: draft.note });
    toast('Saved');
    setDraft(null);
  }
  function addMoney() {
    if (!open || !toPaise(adding)) return;
    addToInvestment(open.id, toPaise(adding));
    toast(`Added ${rupees(toPaise(adding))} to ${open.name}`);
    setDraft({ ...draft!, invested: str(open.invested + toPaise(adding)), value: str(open.value + toPaise(adding)) });
    setAdding('');
  }
  async function remove() {
    if (!open || !(await ask(`Delete ${open.name}?`, 'It is removed from your investments.', 'Delete', true))) return;
    deleteInvestment(open.id);
    setDraft(null);
  }

  return (
    <>
      <Sheet full title="Investments and savings" onClose={onClose}>
        <section className="card total">
          <p className="sub">Worth now</p>
          <p className="num big">{rupees(value)}</p>
          {list.length ? <p className="sub">{rupees(invested)} put in · <Gain value={value} invested={invested} size={15} /></p>
            : <p className="sub">Add mutual funds, FDs, stocks, PPF, gold or a savings pot, and keep their values up to date.</p>}
        </section>

        {list.length > 0 && (
          <div className="list wide" style={{ marginTop: 14 }}>
            {list.map((i) => (
              <button key={i.id} className="item" onClick={() => setDraft({ id: i.id, name: i.name, kind: i.kind, invested: str(i.invested), value: str(i.value), goal: str(i.goal), note: i.note ?? '' })}>
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className="ellipsis" style={{ display: 'block' }}>{i.name}</span>
                  <span className="sub ellipsis" style={{ display: 'block', fontSize: 14 }}>{i.kind} · updated {day(i.updated)}</span>
                  {i.goal ? (
                    <span className="goal" role="meter" aria-valuenow={i.value} aria-valuemax={i.goal} aria-label={`${pctOf(i.value, i.goal)}% of the ${rupees(i.goal)} goal`}>
                      <i style={{ width: `${Math.min(100, pctOf(i.value, i.goal))}%` }} />
                    </span>
                  ) : null}
                  {i.goal ? <span className="sub" style={{ display: 'block', fontSize: 13 }}>{pctOf(i.value, i.goal)}% of {rupees(i.goal)}</span> : null}
                </span>
                <span style={{ display: 'grid', justifyItems: 'end' }}>
                  <span className="num">{rupees(i.value)}</span>
                  <Gain value={i.value} invested={i.invested} size={13} />
                </span>
                <ChevronRight size={18} strokeWidth={2.5} className="chev" />
              </button>
            ))}
          </div>
        )}
        <button className="btn soft" style={{ marginTop: 14 }} onClick={() => { haptic(); setDraft({ name: '', kind: 'Mutual fund', invested: '', value: '', goal: '', note: '' }); }}>
          <Plus size={18} /> Add investment or savings
        </button>

        {byKind.length > 1 && (
          <>
            <h3 className="eyebrow">By type</h3>
            <div className="list flush">
              {byKind.map(([k, v]) => (
                <div key={k} className="item" style={{ minHeight: 48 }}>
                  <span className="grow">{k}</span>
                  <span className="sub num">{Math.round(pctOf(v, value))}%</span>
                  <span className="num">{rupees(v)}</span>
                </div>
              ))}
            </div>
          </>
        )}
        <style jsx>{`
          .total { text-align: center; padding: 22px; }
          .big { font-size: 40px; font-weight: 700; color: var(--lime); letter-spacing: -0.03em; margin: 2px 0; }
          .goal { display: block; height: 6px; border-radius: 3px; background: var(--raised); margin-top: 8px; overflow: hidden; }
          .goal i { display: block; height: 100%; border-radius: 3px; background: var(--lime); }
        `}</style>
      </Sheet>

      {draft && (
        <Sheet title={draft.id ? draft.name || 'Investment' : 'New investment'} onClose={() => setDraft(null)}
          footer={<button className="btn" disabled={!draft.name.trim() || (!toPaise(draft.invested) && !toPaise(draft.value))} onClick={save}>Save</button>}>
          {open && (
            <>
              <div className="list">
                <div className="field"><label htmlFor="inv-add">Put in ₹</label>
                  <input id="inv-add" className="num" inputMode="decimal" value={adding} placeholder="5000" onChange={(e) => setAdding(cleanAmount(e.target.value))} /></div>
              </div>
              <button className="btn lime" style={{ marginTop: 10 }} disabled={!toPaise(adding)} onClick={addMoney}><Plus size={18} /> Add money</button>
              <h3 className="eyebrow">Details</h3>
            </>
          )}
          <div className="list">
            <div className="field"><label htmlFor="inv-name">Name</label>
              <input id="inv-name" data-autofocus={!open || undefined} value={draft.name} onChange={(e) => edit({ name: e.target.value })} placeholder="Nifty 50 index fund" autoCapitalize="words" /></div>
            <div className="field"><label htmlFor="inv-in">Put in ₹</label>
              <input id="inv-in" className="num" inputMode="decimal" value={draft.invested} placeholder="50000" onChange={(e) => edit({ invested: cleanAmount(e.target.value) })} /></div>
            <div className="field"><label htmlFor="inv-val">Worth now ₹</label>
              <input id="inv-val" className="num" inputMode="decimal" value={draft.value} placeholder={draft.invested || 'Same as put in'} onChange={(e) => edit({ value: cleanAmount(e.target.value) })} /></div>
            <div className="field"><label htmlFor="inv-goal">Goal ₹</label>
              <input id="inv-goal" className="num" inputMode="decimal" value={draft.goal} placeholder="Optional" onChange={(e) => edit({ goal: cleanAmount(e.target.value) })} /></div>
            <div className="field"><label htmlFor="inv-note">Note</label>
              <input id="inv-note" value={draft.note} onChange={(e) => edit({ note: e.target.value })} placeholder="Folio, bank, maturity date" /></div>
          </div>
          <h3 className="eyebrow">Type</h3>
          <Combobox label="Type" options={[...new Set([...KINDS, draft.kind])].map((k) => ({ value: k, label: k }))} value={draft.kind} onChange={(kind) => edit({ kind })}
            onAdd={(k) => k} addLabel="Use" />
          {open && <button className="btn danger" style={{ marginTop: 24 }} onClick={remove}><Trash2 size={18} /> Delete</button>}
        </Sheet>
      )}
    </>
  );
}
