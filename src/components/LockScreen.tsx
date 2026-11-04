'use client';
import { Fingerprint } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { setNav } from '@/lib/nav';
import { unlock } from '@/lib/pwa';

// Covers the app until the phone's fingerprint, face or screen lock says it's you. Asks once by itself.
export default function LockScreen() {
  const [busy, setBusy] = useState(false);
  const asked = useRef(false);
  async function go() {
    setBusy(true);
    if (await unlock()) setNav({ locked: false });
    setBusy(false);
  }
  useEffect(() => { if (!asked.current) { asked.current = true; go(); } }, []);
  return (
    <div className="lock" role="dialog" aria-modal="true" aria-label="MyUPI is locked">
      <Fingerprint size={44} strokeWidth={1.6} style={{ color: 'var(--lime)' }} />
      <h1>MyUPI is locked</h1>
      <button className="btn lime" disabled={busy} onClick={go}>Unlock</button>
      <style jsx>{`
        .lock { position: fixed; inset: 0; z-index: 2000; display: grid; place-content: center; justify-items: center; gap: 18px; background: var(--bg); }
        h1 { font-size: 20px; font-weight: 600; }
      `}</style>
    </div>
  );
}
