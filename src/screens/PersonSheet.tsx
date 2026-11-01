'use client';
import { ArrowDownLeft, CircleCheck, IndianRupee, MessageCircle, MessageSquare, Pencil, QrCode, Send, Share2, Users } from 'lucide-react';
import { useState } from 'react';
import { renderSVG } from 'uqr';
import Avatar from '@/components/Avatar';
import Combobox from '@/components/Combobox';
import Segmented from '@/components/Segmented';
import Sheet from '@/components/Sheet';
import { allocate } from '@/lib/calc';
import { getSetting, markSplits, recordRepayment, setSetting, settleAll, unpaidSplits, type Group, type Method, type Person } from '@/lib/db';
import { openPay } from '@/lib/nav';
import { inScope, scopesFor } from '@/lib/scope';
import { ask, ddmon, haptic, shareText, toast, toPaise, VPA_RE, vpaError, ymd } from '@/lib/ui';
import { cleanAmount, personQr, requestMessage, requestReason, rupees, simplePayUri } from '@/lib/upi';

// One sheet with an inner navigation stack: person → request → QR; steps push in from the right and pop back to the left.
// scope / txnId / start: open straight on a request for one payment (right after paying), a month, or a trip.
const ORDER = ['person', 'repay', 'request', 'qr'] as const;
const METHODS: [Method, string][] = [['upi', 'UPI'], ['cash', 'Cash'], ['card', 'Card'], ['bank', 'Bank']];
type Mode = (typeof ORDER)[number];

export default function PersonSheet({ p, groups = [], onClose, onEdit, scope: initialScope = 'all', txnId, start = 'person' }: {
  p: Person; groups?: Group[]; onClose: () => void; onEdit?: () => void; scope?: string; txnId?: number; start?: Mode;
}) {
  const [mode, setMode] = useState<Mode>(start);
  const [scope, setScope] = useState(initialScope);
  const [dir, setDir] = useState(1);
  const [draftVpa, setDraftVpa] = useState('');
  const go = (m: Mode) => { setDir(ORDER.indexOf(m) >= ORDER.indexOf(mode) ? 1 : -1); setMode(m); };

  const all = unpaidSplits(p.id);
  const scopes = scopesFor(all, new Date(), txnId);
  const current = scopes.find((s) => s.key === scope) ?? scopes[0];
  const items = all.filter((x) => inScope(current.key, x));
  // asking for everything also carries their previous balance and takes off what they've paid in part
  const isAll = current.key === 'all';
  const opening = p.opening ?? 0, credit = p.credit ?? 0, owe = p.owe ?? 0;
  // what you owe them back nets against what they owe, like a payment already made
  const adjust = isAll ? { opening, paid: credit + owe } : { opening: 0, paid: 0 };
  const total = Math.max(0, items.reduce((a, x) => a + x.amount, 0) + adjust.opening - adjust.paid);
  const [repay, setRepay] = useState({ amount: '', date: ymd(new Date()), method: 'upi' as Method, note: '' });
  const repaid = toPaise(repay.amount);
  const effect = allocate(repaid, opening, credit, all.map((x) => ({ id: x.id, amount: x.amount })));
  const lastAsked = items.map((x) => x.requested_at).filter(Boolean).sort().pop();
  const fresh = items.filter((x) => !x.requested_at).length;
  const first = p.name.split(' ')[0];
  const myVpa = getSetting('my_vpa');
  const reason = current.key.startsWith('t:') ? current.label.slice(0, 50) : requestReason(items.map((x) => x.note || x.payee_name || ''));
  const msg = requestMessage(p.name, items, myVpa, current.phrase, reason, adjust);
  const step = (mode === 'request' || mode === 'qr') && !VPA_RE.test(myVpa) ? 'vpa' : mode;
  // opened straight on a request: closing it closes the sheet instead of showing the person first
  const back = mode === 'qr' ? () => go('request') : (mode === 'request' && start === 'person') || mode === 'repay' ? () => go('person') : undefined;
  const TITLES = { person: undefined, vpa: 'Where should they pay?', request: `Request ${rupees(total)}`, qr: 'Scan to pay', repay: `Payment from ${first}` };

  function saveRepay() {
    recordRepayment(p.id, repaid, repay);
    toast(effect.opening + all.filter((x) => !effect.paid.includes(x.id)).reduce((a, x) => a + x.amount, 0) - effect.credit <= 0
      ? `${first} is settled up` : `${rupees(repaid)} from ${first} recorded`);
    setRepay({ amount: '', date: ymd(new Date()), method: 'upi', note: '' });
    go('person');
  }

  function sent(how: string) {
    markSplits(items.map((x) => x.id), 'requested_at');
    toast(`Request for ${rupees(total)} ${how}`);
    if (start === 'request') onClose(); else go('person');
  }
  const whatsapp = () => { window.open(`https://wa.me/91${p.phone}?text=${encodeURIComponent(msg)}`, '_blank'); sent('opened in WhatsApp'); };
  const sms = () => { location.href = `sms:${p.phone}?body=${encodeURIComponent(msg)}`; sent('opened in Messages'); };
  async function share() {
    const how = await shareText(msg);
    if (how) sent(how);
  }
  async function settle() {
    const what = current.about && items.length < all.length ? `Their items from ${current.about}` : 'All their pending items';
    if (!(await ask(`Did ${first} pay you ${rupees(total)}?`, `${what} will be marked settled.`, 'Yes, settled'))) return;
    if (isAll) settleAll(p.id); else markSplits(items.map((x) => x.id), 'paid_at');
    toast(current.key === 'all' || items.length === all.length ? `${first} is settled up` : `${current.label} settled with ${first}`);
    setScope('all');
  }

  // what to ask for: everything, one payment, a week, a month, or a trip
  const scopePicker = scopes.length > 1 && (
    <div style={{ margin: step === 'person' ? '14px 0 4px' : '0 0 4px' }}>
      <Combobox label="Request for" options={scopes.map((sc) => ({ value: sc.key, label: sc.label, hint: rupees(sc.key === 'all' ? Math.max(0, p.owed) : sc.total) }))} value={scope} onChange={setScope} />
    </div>
  );

  return (
    <Sheet title={TITLES[step]} onClose={onClose} back={back}>
      <div key={step} className="slide-in" style={{ ['--dir' as string]: dir }}>
        {step === 'person' ? (
          <>
            <div className="center" style={{ display: 'grid', justifyItems: 'center', marginBottom: 20 }}>
              <Avatar name={p.name} size={84} />
              <h2 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '.36px', marginTop: 12 }}>{p.name}</h2>
              <p className="sub">{[p.vpa, p.phone && `+91 ${p.phone}`].filter(Boolean).join(' · ') || 'No contact details yet'}</p>
              {p.groupIds.length > 0 && (
                <div className="chips" style={{ justifyContent: 'center', marginTop: 10 }}>
                  {groups.filter((g) => p.groupIds.includes(g.id)).map((g) => <span key={g.id} className="chip"><Users size={14} /> {g.name}</span>)}
                </div>
              )}
            </div>

            <div className="acts">
              <button disabled={!p.vpa} onClick={() => { haptic(); onClose(); openPay(personQr(p.vpa!, p.name)); }}><Send size={22} />Pay</button>
              <button disabled={p.owed <= 0} onClick={() => go('request')}><ArrowDownLeft size={22} />Request</button>
              <button disabled={!onEdit} onClick={onEdit}><Pencil size={21} />Edit</button>
            </div>
            {!p.vpa && <p className="hint center">Add their UPI ID (Edit) to pay them from here.</p>}

            {scopePicker}
            <h3 className="eyebrow">
              <span>Owes you{current.about ? ` · ${current.label}` : ''}</span>
              {total > 0 && <span style={{ textTransform: 'none', letterSpacing: 0 }}>{lastAsked ? `Asked ${ddmon(lastAsked)}${fresh ? ` · ${fresh} new` : ''}` : 'Not asked yet'}</span>}
            </h3>
            {items.length || adjust.opening || adjust.paid ? (
              <>
                <div className="list flush">
                  {adjust.opening > 0 && (
                    <div className="item" style={{ minHeight: 52 }}>
                      <span className="sub" style={{ minWidth: 48 }}>Before</span>
                      <span className="grow">Previous balance</span>
                      <span className="num">{rupees(adjust.opening)}</span>
                    </div>
                  )}
                  {items.map((x) => (
                    <div key={x.id} className="item" style={{ minHeight: 52 }}>
                      <span className="sub" style={{ minWidth: 48 }}>{ddmon(x.created_at)}</span>
                      <span className="grow">
                        <span className="ellipsis" style={{ display: 'block' }}>{x.note || x.payee_name || 'Expense'}</span>
                        {x.trip && !current.key.startsWith('t:') && <span className="sub ellipsis" style={{ display: 'block', fontSize: 13 }}>{x.trip}</span>}
                      </span>
                      {!x.requested_at && <span className="badge">New</span>}
                      <span className="num">{rupees(x.amount)}</span>
                    </div>
                  ))}
                  {isAll && credit > 0 && (
                    <div className="item" style={{ minHeight: 52 }}>
                      <span className="sub" style={{ minWidth: 48 }}>Paid</span>
                      <span className="grow">Paid in part</span>
                      <span className="num" style={{ color: 'var(--green)' }}>−{rupees(credit)}</span>
                    </div>
                  )}
                  {isAll && owe > 0 && (
                    <div className="item" style={{ minHeight: 52 }}>
                      <span className="sub" style={{ minWidth: 48 }}>Lent</span>
                      <span className="grow">You owe {first} back</span>
                      <span className="num" style={{ color: 'var(--green)' }}>−{rupees(owe)}</span>
                    </div>
                  )}
                  <div className="item"><b className="grow" style={{ fontWeight: 600 }}>{total || !adjust.paid ? 'Total' : `You owe ${first}`}</b>
                    <span className="num" style={{ fontSize: 20, color: total || !adjust.paid ? 'var(--lime)' : 'var(--red)' }}>{rupees(total || Math.max(0, -p.owed))}</span></div>
                </div>
                <div className="stack" style={{ marginTop: 16, gap: 4 }}>
                  {total > 0 && <button className="btn" onClick={() => go('request')}><ArrowDownLeft size={18} /> {lastAsked && !fresh ? `Remind ${first}` : `Request ${rupees(total)}`}</button>}
                  <button className="btn soft" onClick={() => { setRepay((r) => ({ ...r, amount: r.amount || (p.owed > 0 ? String(p.owed / 100) : '') })); go('repay'); }}>
                    <IndianRupee size={18} /> Record a payment</button>
                  {total > 0 && <button className="btn ghost" onClick={settle}>{isAll ? 'Mark all as paid' : `Mark ${current.label} as paid`}</button>}
                </div>
              </>
            ) : (
              <div className="card center" style={{ display: 'grid', justifyItems: 'center', gap: 4, padding: 24 }}>
                <CircleCheck size={30} style={{ color: 'var(--lime)' }} />
                <p style={{ fontWeight: 600 }}>All settled</p>
                <p className="sub">Splits you add with {first} show up here.</p>
              </div>
            )}
          </>
        ) : step === 'repay' ? (
          <>
            <label className="big">
              <span className={`rs${repaid ? '' : ' dim'}`}>₹</span>
              <input className="num" inputMode="decimal" placeholder="0" aria-label={`Amount ${first} paid`} autoFocus value={repay.amount}
                onChange={(e) => setRepay({ ...repay, amount: cleanAmount(e.target.value) })} style={{ width: `${Math.max(1, repay.amount.length || 1) * 0.62 + 0.2}em` }} />
            </label>
            <p className="sub center">{p.owed > 0 ? `${first} owes you ${rupees(p.owed)} in all. Part of it is fine.` : `${first} doesn't owe you anything now; this counts toward their next split.`}</p>
            <div style={{ marginTop: 16 }}><Segmented options={METHODS} value={repay.method} onChange={(method) => setRepay({ ...repay, method })} label="Paid by" /></div>
            <div className="list" style={{ marginTop: 12 }}>
              <label className="item"><span className="grow">Date</span>
                <input type="date" value={repay.date} max={ymd(new Date())} onChange={(e) => setRepay({ ...repay, date: e.target.value || ymd(new Date()) })} aria-label="Date" className="date" /></label>
              <label className="item"><input className="grow" style={{ padding: '8px 0' }} value={repay.note} onChange={(e) => setRepay({ ...repay, note: e.target.value })} maxLength={80} placeholder="Note (optional)" aria-label="Note" /></label>
            </div>
            {repaid > 0 && (
              <>
                <h3 className="eyebrow">This clears</h3>
                <div className="list flush">
                  {opening - effect.opening > 0 && <div className="item"><span className="grow">Previous balance{effect.opening ? ' (part)' : ''}</span><span className="num">{rupees(opening - effect.opening)}</span></div>}
                  {all.filter((x) => effect.paid.includes(x.id)).map((x) => (
                    <div key={x.id} className="item"><span className="sub" style={{ minWidth: 48 }}>{ddmon(x.created_at)}</span><span className="grow ellipsis">{x.note || x.payee_name || 'Expense'}</span><span className="num">{rupees(x.amount)}</span></div>
                  ))}
                  {effect.credit > 0 && <div className="item"><span className="grow">Kept as part payment<br /><span className="sub">Counts toward {all.some((x) => !effect.paid.includes(x.id)) ? 'their next split' : 'future splits'}</span></span><span className="num">{rupees(effect.credit)}</span></div>}
                </div>
              </>
            )}
            <p className="hint">It&apos;s added to History as money received from {first}, so your bank statement matches it later instead of adding it twice.</p>
            <button className="btn" style={{ marginTop: 12 }} disabled={!repaid} onClick={saveRepay}>Record {repaid ? rupees(repaid) : 'payment'}</button>
          </>
        ) : step === 'vpa' ? (
          <>
            <p className="sub" style={{ margin: '0 4px 16px', fontSize: 15 }}>Add your UPI ID once. It goes in every request so {first} knows where to send the money.</p>
            <div className="list"><div className="field">
              <label htmlFor="my-vpa">UPI ID</label>
              <input id="my-vpa" value={draftVpa} onChange={(e) => setDraftVpa(e.target.value)} autoFocus autoCapitalize="none" spellCheck={false} placeholder="you@okaxis" />
            </div></div>
            {draftVpa && vpaError(draftVpa) && <p className="hint" style={{ color: 'var(--red)' }}>{vpaError(draftVpa)}</p>}
            <button className="btn" style={{ marginTop: 16 }} disabled={!draftVpa.trim() || !!vpaError(draftVpa)} onClick={() => setSetting('my_vpa', draftVpa.trim().toLowerCase())}>Save and continue</button>
          </>
        ) : step === 'qr' ? (
          <>
            <div className="card center" style={{ display: 'grid', justifyItems: 'center', padding: 24 }}>
              {/* QR stays dark-on-white so every scanner reads it */}
              <div className="qr" role="img" aria-label={`Payment QR for ${rupees(total)} to ${myVpa}`}
                dangerouslySetInnerHTML={{ __html: renderSVG(simplePayUri(myVpa, getSetting('my_name') || myVpa, total / 100, reason), { border: 1 }) }} />
              <p className="num" style={{ fontSize: 36, marginTop: 16 }}>{rupees(total)}</p>
              <p className="sub">{reason}</p>
              <p className="sub" style={{ marginTop: 10, maxWidth: 280 }}>{first} scans this with any UPI app. Amount and reason are already filled in.</p>
            </div>
            <div className="stack" style={{ marginTop: 16, gap: 4 }}>
              <button className="btn" onClick={() => sent('shown as QR')}>Done, mark as requested</button>
            </div>
          </>
        ) : (
          <>
            {scopePicker}
            <p className="sub" style={{ margin: '0 4px 14px' }}>{items.length} item{items.length > 1 ? 's' : ''}{current.about ? ` from ${current.about}` : ''} · send it however {first} likes</p>
            <div className="list">
              {p.phone && (
                <>
                  <button className="item" onClick={whatsapp}><span className="mini-icon"><MessageCircle size={17} /></span><span className="grow">WhatsApp<br /><span className="sub">+91 {p.phone}</span></span></button>
                  <button className="item" onClick={sms}><span className="mini-icon"><MessageSquare size={17} /></span><span className="grow">Text message</span></button>
                </>
              )}
              <button className="item" onClick={share}><span className="mini-icon"><Share2 size={17} /></span><span className="grow">Another app</span></button>
              <button className="item" onClick={() => go('qr')}><span className="mini-icon lime"><QrCode size={17} /></span><span className="grow">Show a QR to scan<br /><span className="sub">For settling in person</span></span></button>
            </div>
            {!p.phone && <p className="hint" style={{ marginBottom: 6 }}>Add {first}&apos;s phone number to send on WhatsApp directly.</p>}
            {/* the message as it will appear: an outgoing chat bubble */}
            <h3 className="eyebrow">Message</h3>
            <div className="bubble-wrap">
              <p className="bubble">{msg.replace(/\*/g, '')}</p>
              <p className="sub" style={{ margin: '4px 4px 0' }}>To {p.name}</p>
            </div>
          </>
        )}
      </div>
      <style jsx>{`
        .acts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
        /* Contacts-style action buttons: tinted glyph and label on a card */
        .acts button { display: grid; justify-items: center; gap: 6px; padding: 12px 6px 10px; background: var(--card); border-radius: 16px; font-size: 12px; font-weight: 500;
          letter-spacing: 0; color: var(--tint); transition: transform .45s var(--spring), background .3s; }
        .acts button:active:not(:disabled) { transform: scale(.94); background: var(--pressed); transition-duration: .1s; }
        .acts button:disabled { color: var(--faint); opacity: .5; }
        .big { display: flex; justify-content: center; align-items: flex-start; font-size: 60px; line-height: 1; cursor: text; margin-bottom: 6px; }
        .big input { font-size: inherit; text-align: center; max-width: 100%; padding: 0; caret-color: var(--green); }
        .rs { font-size: 30px; font-weight: 500; margin-top: 8px; margin-right: 2px; }
        .dim { color: var(--faint); }
        .date { color: var(--ink); color-scheme: dark; font-size: 16px; }
        .qr { width: 240px; padding: 12px; background: #fff; border-radius: 18px; color: #141413; }
        .qr :global(svg) { display: block; width: 100%; height: auto; }
        .bubble-wrap { display: grid; justify-items: end; }
        .bubble { max-width: 92%; white-space: pre-wrap; font-size: 15px; line-height: 1.5; padding: 14px; border-radius: 20px 20px 6px 20px;
          background: var(--raised); color: var(--ink); user-select: text; }
      `}</style>
    </Sheet>
  );
}
