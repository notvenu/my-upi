'use client';
import { ChevronRight, Cloud, CloudOff, Download, FileUp, Repeat, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import Avatar from '@/components/Avatar';
import Combobox from '@/components/Combobox';
import NavBar from '@/components/NavBar';
import { db, exportJson, getSetting, importJson, setSetting } from '@/lib/db';
import { setNav } from '@/lib/nav';
import { signOut, signOutOthers, supabase, sync } from '@/lib/sync';
import { ask, download, preferredApp, setPreferredApp, toast, UPI_APPS, vpaError } from '@/lib/ui';

const STATUS = { off: 'Not syncing', syncing: 'Syncing…', synced: 'Synced', offline: 'Offline · syncs when back online' };

export default function Me() {
  const [name, setName] = useState(getSetting('my_name'));
  const [vpa, setVpa] = useState(getSetting('my_vpa'));
  const vpaErr = vpaError(vpa);
  const dirty = name.trim() !== getSetting('my_name') || vpa.trim().toLowerCase() !== getSetting('my_vpa');
  const backupInput = useRef<HTMLInputElement>(null);

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
            <h2 className="eyebrow">Statements and autopays</h2>
            <div className="list">
              <button className="item" onClick={() => setNav({ importing: true })}>
                <span className="mini-icon lime"><FileUp size={17} /></span>
                <span className="grow">Upload a statement<br /><span className="sub">Bank, PhonePe or super.money · PDF, Excel or CSV</span></span>
                <ChevronRight size={18} strokeWidth={2.5} className="chev" />
              </button>
              <button className="item" onClick={() => setNav({ subs: true })}>
                <span className="mini-icon"><Repeat size={17} /></span>
                <span className="grow">Autopays<br /><span className="sub">Subscriptions, EMIs, mandates</span></span>
                <ChevronRight size={18} strokeWidth={2.5} className="chev" />
              </button>
            </div>

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
      `}</style>
    </>
  );
}
