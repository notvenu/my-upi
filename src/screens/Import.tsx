'use client';
import { ChevronDown, CircleAlert, CircleCheck, CirclePlus, FileUp, Lock, MessageSquareText, SkipForward, Users } from 'lucide-react';
import { useRef, useState } from 'react';
import CategoryPicker from '@/components/CategoryPicker';
import Sheet from '@/components/Sheet';
import TripField from '@/components/TripField';
import { applyImport, db, planImport, type ImportRow } from '@/lib/db';
import { setNav } from '@/lib/nav';
import { pdfLines } from '@/lib/pdf';
import { parsePdfStatement, parseStatement } from '@/lib/statement';
import { ddmon, haptic, toast } from '@/lib/ui';
import { rupees } from '@/lib/upi';

const SOURCES = [
  ['Bank', 'Netbanking or the bank app → Account statement → pick dates → download Excel, CSV or PDF.'],
  ['PhonePe, super.money, other UPI apps', 'In the app’s History, download the statement. It comes as a PDF.'],
];
const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);

async function sheetRows(f: File): Promise<string[][]> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(new Uint8Array(await f.arrayBuffer()), { type: 'array', raw: true });
  // CSV stays raw text; real Excel date cells are forced day-first, so neither gets read as a US date
  return wb.SheetNames.flatMap((n) => XLSX.utils.sheet_to_json<string[]>(wb.Sheets[n], { header: 1, raw: false, defval: '', dateNF: 'dd/mm/yyyy' }));
}

// Upload a bank or UPI app statement (Excel, CSV, PDF): every row is read, checked against history, then shown for review.
// Rows already here are skipped, ones matching a payment you recorded confirm it, and you add reasons before anything is saved.
export default function Import({ onClose }: { onClose: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState<string | null>(null); // asked for when the PDF is locked
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [plan, setPlan] = useState<ImportRow[] | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [result, setResult] = useState<ReturnType<typeof applyImport> | null>(null);

  async function read(f: File, pw?: string) {
    setFile(f); setBusy(true); setError('');
    try {
      const rows = isPdf(f) ? parsePdfStatement(await pdfLines(await f.arrayBuffer(), pw)) : parseStatement(await sheetRows(f));
      if (!rows.length) setError("Couldn't find payments in that file. Try the Excel or CSV version if your bank has one.");
      else { setPlan(planImport(rows).sort((a, b) => b.date.localeCompare(a.date))); setPassword(null); }
    } catch (e) {
      if ((e as Error).message === 'password') { setError(pw ? 'Wrong password, try again' : ''); setPassword(pw ?? ''); }
      else setError(`Couldn't read it: ${(e as Error).message}`);
    }
    setBusy(false);
  }
  function picked(f?: File | null) {
    if (input.current) input.current.value = '';
    if (f) { setPassword(null); read(f); }
  }

  const edit = (key: string, patch: Partial<ImportRow>) => setPlan((p) => p && p.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const of = (st: ImportRow['status']) => plan?.filter((r) => r.status === st) ?? [];
  const fresh = of('new'), maybe = of('maybe'), match = of('match'), dup = of('dup');
  const adding = [...fresh, ...maybe].filter((r) => r.include).length;
  const twin = (r: ImportRow) => db.txns.find((t) => t.id === r.txnId);

  function save() {
    if (!plan) return;
    haptic(20);
    setResult(applyImport(plan));
    toast(`${adding} added${match.length ? `, ${match.length} confirmed` : ''}`);
  }

  const row = (r: ImportRow) => {
    const open = openKey === r.key;
    const t = r.status === 'maybe' ? twin(r) : undefined;
    return (
      <div key={r.key} className={`imp-r${open ? ' open' : ''}`}>
        <div className="item">
          {r.status === 'match'
            ? <span className="mini-icon" style={{ color: 'var(--lime)' }}><CircleCheck size={17} /></span>
            : <input type="checkbox" className="imp-tick" checked={r.include} onChange={(e) => edit(r.key, { include: e.target.checked })} aria-label={`Add ${r.name} ${rupees(r.amount)}`} />}
          <button className="grow imp-txt" onClick={() => setOpenKey(open ? null : r.key)} aria-expanded={open}>
            <span className="ellipsis" style={{ display: 'block' }}>{r.note || r.name}</span>
            <span className="sub ellipsis" style={{ display: 'block', fontSize: 14 }}>
              {[ddmon(r.date), r.note && r.name, r.category, r.trip, t && `like ${t.payee_name || 'one'} on ${ddmon(t.created_at)}`].filter(Boolean).join(' · ')}
            </span>
          </button>
          <span className={`num txn-amt${r.direction === 'credit' ? ' credit' : ''}`}>{r.direction === 'credit' ? '+' : ''}{rupees(r.amount)}</span>
          <ChevronDown size={17} className="chev turn" />
        </div>
        {open && (
          <div className="imp-edit">
            <label className="imp-reason">
              <MessageSquareText size={18} className="faint" />
              <input value={r.note} onChange={(e) => edit(r.key, { note: e.target.value })} maxLength={80} placeholder="What was it for?" aria-label="Reason" data-autofocus />
            </label>
            <div className="list" style={{ margin: '8px 0' }}>
              <div className="field"><label htmlFor={`n-${r.key}`}>{r.direction === 'credit' ? 'From' : 'Paid to'}</label>
                <input id={`n-${r.key}`} value={r.name} onChange={(e) => edit(r.key, { name: e.target.value })} /></div>
              <TripField value={r.trip} onChange={(trip) => edit(r.key, { trip })} />
            </div>
            <CategoryPicker category={r.category} subcategory={r.subcategory} onChange={(category, subcategory) => edit(r.key, { category, subcategory })} />
            <p className="hint" style={{ wordBreak: 'break-word' }}>{r.desc}</p>
          </div>
        )}
      </div>
    );
  };

  const footer = plan && !result ? (
    <button className="btn lime" disabled={!adding && !match.length} onClick={save}>
      {adding ? `Add ${adding}` : ''}{adding && match.length ? ' · ' : ''}{match.length ? `Confirm ${match.length}` : ''}{!adding && !match.length ? 'Nothing new to add' : ''}
    </button>
  ) : result ? <button className="btn" onClick={onClose}>Done</button> : undefined;

  return (
    <Sheet full title={result ? 'Imported' : plan ? 'Check before adding' : 'Upload statement'} onClose={onClose} footer={footer}
      back={plan && !result ? () => { setPlan(null); setFile(null); } : undefined}>
      <input ref={input} type="file" hidden accept=".pdf,.xls,.xlsx,.csv,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
        onChange={(e) => picked(e.target.files?.[0])} />

      {result ? (
        <>
          <div className="list">
            <div className="item"><span className="mini-icon"><CirclePlus size={17} /></span><span className="grow">Added</span><b className="num">{result.added}</b></div>
            <div className="item"><span className="mini-icon" style={{ color: 'var(--lime)' }}><CircleCheck size={17} /></span><span className="grow">Confirmed<br /><span className="sub">Payments you&apos;d recorded</span></span><b className="num">{result.matched}</b></div>
            {result.settled > 0 && <div className="item"><span className="mini-icon lime"><Users size={17} /></span><span className="grow">Splits paid back<br /><span className="sub">Friends&apos; transfers matched what they owed</span></span><b className="num">{result.settled}</b></div>}
            <div className="item"><span className="mini-icon"><SkipForward size={17} /></span><span className="grow">Skipped<br /><span className="sub">Already in history, or left unticked</span></span><b className="num">{result.skipped}</b></div>
          </div>
          <button className="btn soft" style={{ marginTop: 14 }} onClick={() => { onClose(); setNav({ tab: 'history' }); }}>See them in History</button>
        </>
      ) : plan ? (
        <>
          <p className="sub" style={{ margin: '0 4px 6px', fontSize: 15 }}>
            {file?.name} · {plan.length} rows. Tap a row to add a reason, category or trip. Nothing is saved until you add them.
          </p>
          {fresh.length > 0 && (
            <>
              <h3 className="eyebrow"><span>New · {fresh.length}</span>
                <button className="link" style={{ fontSize: 13, minHeight: 0, textTransform: 'none' }} onClick={() => {
                  const all = fresh.every((r) => r.include);
                  setPlan((p) => p && p.map((r) => (r.status === 'new' ? { ...r, include: !all } : r)));
                }}>{fresh.every((r) => r.include) ? 'Untick all' : 'Tick all'}</button>
              </h3>
              <div className="list">{fresh.map(row)}</div>
            </>
          )}
          {maybe.length > 0 && (
            <>
              <h3 className="eyebrow">Might already be in history · {maybe.length}</h3>
              <div className="list">{maybe.map(row)}</div>
              <p className="hint">Same amount within a day of one imported from another statement. Left out unless you tick it.</p>
            </>
          )}
          {match.length > 0 && (
            <>
              <h3 className="eyebrow">Confirms payments you recorded · {match.length}</h3>
              <div className="list">{match.map(row)}</div>
            </>
          )}
          {dup.length > 0 && <p className="hint" style={{ marginTop: 18 }}>{dup.length} already imported earlier, skipped.</p>}
        </>
      ) : (
        <>
          <button className={`drop${busy ? ' busy' : ''}`} disabled={busy} onClick={() => input.current?.click()}
            onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); picked(e.dataTransfer.files[0]); }}>
            <span className="mini-icon lime" style={{ width: 52, height: 52, borderRadius: 16 }}><FileUp size={24} /></span>
            <b>{busy ? `Reading ${file?.name ?? ''}…` : 'Choose a statement'}</b>
            <span className="sub">PDF, Excel or CSV · from your bank, PhonePe, super.money or any UPI app</span>
          </button>

          {password !== null && (
            <div className="card" style={{ marginTop: 12 }}>
              <div className="row"><Lock size={18} className="faint" /><p className="grow" style={{ fontWeight: 600 }}>This PDF has a password</p></div>
              <p className="sub" style={{ margin: '4px 0 10px', fontSize: 14 }}>It&apos;s in the bank&apos;s email, often part of your name and date of birth, or your customer ID.</p>
              <div className="list" style={{ background: 'var(--bg)' }}><div className="field">
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" aria-label="PDF password" autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && file && password && read(file, password)} />
              </div></div>
              <button className="btn" style={{ marginTop: 10 }} disabled={!password || busy} onClick={() => file && read(file, password)}>Open</button>
            </div>
          )}
          {error && <div className="card row" role="alert" style={{ background: 'var(--red-soft)', marginTop: 12 }}><CircleAlert size={20} style={{ color: 'var(--red)' }} /><span className="grow">{error}</span></div>}

          <h3 className="eyebrow">Where to get it</h3>
          <div className="list flush">
            {SOURCES.map(([k, v]) => <div key={k} className="item" style={{ display: 'block', paddingTop: 12, paddingBottom: 12 }}><b style={{ fontWeight: 600 }}>{k}</b><p className="sub" style={{ fontSize: 14, marginTop: 2 }}>{v}</p></div>)}
          </div>
          <p className="hint">Overlapping dates are fine: anything already in your history is skipped, payments you recorded get confirmed, and friends who paid you back are marked paid. The file is read on this device.</p>
        </>
      )}
      <style jsx>{`
        .drop { width: 100%; display: grid; justify-items: center; gap: 8px; text-align: center; padding: 30px 20px; border-radius: var(--radius);
          background: var(--card); box-shadow: inset 0 0 0 1.5px var(--line); border: 0; transition: box-shadow .2s, background .2s; }
        .drop:active:not(:disabled), .drop:hover { background: var(--pressed); box-shadow: inset 0 0 0 1.5px var(--lime); }
        .drop b { font-size: 18px; font-weight: 600; margin-top: 4px; }
        .drop.busy { opacity: .7; }
        /* rows come from a helper function, which styled-jsx doesn't scope: these classes are prefixed and global */
        :global(.imp-tick) { width: 22px; height: 22px; accent-color: var(--lime); flex-shrink: 0; cursor: pointer; margin: 0 4px; }
        :global(.imp-txt) { text-align: left; min-height: 44px; }
        :global(.imp-r .turn) { transition: transform .25s var(--ease); }
        :global(.imp-r.open .turn) { transform: rotate(180deg); }
        :global(.imp-edit) { padding: 0 16px 14px; }
        :global(.imp-edit .field) { padding-left: 16px; }
        :global(.imp-reason) { display: flex; align-items: center; gap: 10px; background: var(--bg); border-radius: 999px; padding: 0 18px; min-height: 50px; }
        :global(.imp-reason input) { flex: 1; font-size: 16px; padding: 12px 0; }
      `}</style>
    </Sheet>
  );
}
