'use client';
import { CircleAlert, CircleCheck, CirclePlus, Cloud, CloudOff, Download, FileUp, SkipForward, Upload, Users } from 'lucide-react';
import { useRef, useState } from 'react';
import Avatar from '@/components/Avatar';
import Combobox from '@/components/Combobox';
import NavBar from '@/components/NavBar';
import { db, exportJson, getSetting, importJson, importStatement, setSetting } from '@/lib/db';
import { parseStatement } from '@/lib/statement';
import { signOut, signOutOthers, supabase, sync } from '@/lib/sync';
import { ask, download, preferredApp, setPreferredApp, toast, UPI_APPS, vpaError } from '@/lib/ui';

const STATUS = { off: 'Not syncing', syncing: 'Syncing…', synced: 'Synced', offline: 'Offline · syncs when back online' };
const STEPS = ['Open your bank app or netbanking', 'Account statement → choose dates', 'Download as Excel (XLS/XLSX) or CSV', 'Pick that file here'];
type Result = { read: number; matched: number; added: number; skipped: number; settled: number } | { error: string };

export default function Me() {
  const [name, setName] = useState(getSetting('my_name'));
  const [vpa, setVpa] = useState(getSetting('my_vpa'));
  const vpaErr = vpaError(vpa);
  const dirty = name.trim() !== getSetting('my_name') || vpa.trim().toLowerCase() !== getSetting('my_vpa');
  const stmtInput = useRef<HTMLInputElement>(null);
  const backupInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  function saveMe() {
    if (vpaErr) return;
    setSetting('my_name', name.trim());
    setSetting('my_vpa', vpa.trim().toLowerCase());
    toast('Your details are saved');
  }
  async function endOthers() {
    if (!(await ask('Sign out other devices?', 'Every other phone or laptop signed in to this account goes back to the login screen. This one stays signed in.', 'Sign out others'))) return;
    try { await signOutOthers(); toast('Other devices signed out'); } catch (e) { toast(`Couldn't: ${(e as Error).message}`); }
  }

  async function importFile() {
    const f = stmtInput.current?.files?.[0];
    if (stmtInput.current) stmtInput.current.value = '';
    if (!f) return;
    setBusy(true); setResult(null);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(new Uint8Array(await f.arrayBuffer()), { type: 'array', raw: true });
      // CSV stays raw text; real Excel date cells are forced day-first, so neither gets read as a US date
      const rows = wb.SheetNames.flatMap((n) => XLSX.utils.sheet_to_json<string[]>(wb.Sheets[n], { header: 1, raw: false, defval: '', dateNF: 'dd/mm/yyyy' }));
      const parsed = parseStatement(rows);
      setResult(parsed.length ? { read: parsed.length, ...importStatement(parsed) }
        : { error: "Couldn't find transactions in that file. Export it as Excel or CSV from your bank. PDF isn't supported." });
    } catch (e) {
      setResult({ error: `Import failed: ${e}` });
    }
    setBusy(false);
  }

  const backup = () => download(`myupi-backup-${new Date().toISOString().slice(0, 10)}.json`, exportJson());
  async function restore() {
    const f = backupInput.current?.files?.[0];
    if (backupInput.current) backupInput.current.value = '';
    if (!f || !(await ask('Replace everything with this backup?', 'Payments, people and splits here are replaced by the backup.', 'Restore', true))) return;
    try { importJson(await f.text()); setName(getSetting('my_name')); setVpa(getSetting('my_vpa')); toast('Backup restored'); }
    catch (e) { toast(`Couldn't restore: ${e}`); }
  }

  return (
    <>
      <input ref={stmtInput} type="file" hidden accept=".xls,.xlsx,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" onChange={importFile} />
      <input ref={backupInput} type="file" hidden accept="application/json,.json" onChange={restore} />

      <div className="page">
        <NavBar title="You" />
        <div className="split">
          <div className="side">
            {/* my card: what friends see on requests and QR codes */}
            <section className="card me">
              <div className="row">
                <Avatar name={name || 'Me'} size={56} />
                <div className="grow">
                  <p style={{ fontWeight: 600, fontSize: 18 }} className="ellipsis">{name || 'Your name'}</p>
                  <p className="sub ellipsis" style={{ color: !vpa ? 'var(--amber)' : undefined }}>{vpa || 'Add your UPI ID so friends can pay you'}</p>
                </div>
              </div>
              <div className="list inset">
                <div className="field"><label htmlFor="me-name">Name</label><input id="me-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoCapitalize="words" /></div>
                <div>
                  <div className="field"><label htmlFor="me-vpa">UPI ID</label><input id="me-vpa" value={vpa} onChange={(e) => setVpa(e.target.value)} placeholder="you@okaxis" autoCapitalize="none" spellCheck={false} inputMode="email" /></div>
                  {vpa.includes('@') && vpaErr && <p className="err">{vpaErr}</p>}
                </div>
              </div>
              {dirty && <button className="btn" style={{ marginTop: 12 }} disabled={!!vpaErr} onClick={saveMe}>Save</button>}
            </section>

            <h2 className="eyebrow">Account</h2>
            <section className="card">
              {!supabase ? (
                <div className="row"><CloudOff size={20} className="faint" /><p className="sub grow">Sync isn&apos;t set up on this site, so your data stays in this browser.</p></div>
              ) : (
                <>
                  <div className="row">
                    <span className="mini-icon lime"><Cloud size={17} /></span>
                    <div className="grow" style={{ minWidth: 0 }}>
                      <p className="ellipsis" style={{ fontWeight: 600 }}>{sync.email}</p>
                      <p className="sub">{STATUS[sync.status]}{sync.since ? ` · signed in ${new Date(sync.since).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}</p>
                    </div>
                  </div>
                  {sync.error && <p className="err" style={{ padding: '8px 0 0' }}>{sync.error}</p>}
                  <div className="acct">
                    <button className="btn soft" onClick={endOthers}>Sign out other devices</button>
                    <button className="btn danger" onClick={async () => { if (await ask('Sign out?', 'This browser forgets your data until you sign in again. Your account keeps everything.', 'Sign out', true)) signOut(); }}>Sign out</button>
                  </div>
                </>
              )}
            </section>

            <h2 className="eyebrow">Default UPI app</h2>
            <Combobox label="Default UPI app" options={UPI_APPS.map((a) => ({ value: a.pkg, label: a.label }))} value={preferredApp().pkg} onChange={setPreferredApp} />
            <p className="hint" style={{ marginLeft: 4 }}>Opened when you pay from your Android phone.</p>
          </div>

          <section>
            <h2 className="eyebrow">Bank statement</h2>
            <section className="card">
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <span className="mini-icon lime" style={{ width: 44, height: 44, borderRadius: 14 }}><FileUp size={20} /></span>
                <div className="grow">
                  <p style={{ fontWeight: 600 }}>Fill in the gaps</p>
                  <p className="sub">Adds card spends, salary and anything you didn&apos;t record, confirms unconfirmed payments, and marks friends paid when their transfer shows up. Overlapping dates are fine.</p>
                </div>
              </div>
              <button className="btn" style={{ marginTop: 16 }} disabled={busy} onClick={() => stmtInput.current?.click()}><Upload size={18} /> {busy ? 'Reading…' : 'Choose Excel or CSV'}</button>
            </section>

            {result && ('error' in result ? (
              <div className="card row" role="alert" style={{ background: 'var(--red-soft)', marginTop: 12 }}><CircleAlert size={20} style={{ color: 'var(--red)' }} /><span className="grow">{result.error}</span></div>
            ) : (
              <>
                <h3 className="eyebrow" aria-live="polite">{result.read} transactions read</h3>
                <div className="list">
                  <div className="item"><span className="mini-icon" style={{ color: 'var(--green)' }}><CircleCheck size={17} /></span><span className="grow">Confirmed<br /><span className="sub">Matched to payments already here</span></span><b className="num">{result.matched}</b></div>
                  <div className="item"><span className="mini-icon"><CirclePlus size={17} /></span><span className="grow">Added<br /><span className="sub">Card spends, transfers, money received</span></span><b className="num">{result.added}</b></div>
                  {result.settled > 0 && <div className="item"><span className="mini-icon lime"><Users size={17} /></span><span className="grow">Split payments received<br /><span className="sub">Friends&apos; payments marked paid</span></span><b className="num">{result.settled}</b></div>}
                  <div className="item"><span className="mini-icon"><SkipForward size={17} /></span><span className="grow">Skipped<br /><span className="sub">Already imported earlier</span></span><b className="num">{result.skipped}</b></div>
                </div>
              </>
            ))}

            <details className="steps">
              <summary className="sub">How to get the file</summary>
              <ol>{STEPS.map((s) => <li key={s}>{s}</li>)}</ol>
            </details>

            <h2 className="eyebrow">Your data</h2>
            <div className="list">
              <button className="item" onClick={backup}><span className="mini-icon"><Download size={17} /></span><span className="grow">Save a backup<br /><span className="sub">{db.txns.length} entries, {db.people.length} people · bill photos stay on this device</span></span></button>
              <button className="item" onClick={() => backupInput.current?.click()}><span className="mini-icon"><Upload size={17} /></span><span className="grow">Restore from backup</span></button>
            </div>
            <p className="hint" style={{ marginLeft: 4 }}>{sync.email ? 'Synced to your account; this browser keeps a copy until you sign out.' : 'Everything lives only in this browser.'}</p>
          </section>
        </div>
      </div>
      <style jsx>{`
        .acct { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px; margin-top: 14px; }
        .me .inset { background: var(--bg); margin-top: 16px; border-radius: 16px; }
        .me .err { padding-left: 112px; }
        .steps { margin: 12px 4px 0; }
        .steps summary { cursor: pointer; min-height: 44px; display: flex; align-items: center; }
        .steps ol { padding-left: 22px; color: var(--sub); font-size: 14px; display: grid; gap: 6px; }
      `}</style>
    </>
  );
}
