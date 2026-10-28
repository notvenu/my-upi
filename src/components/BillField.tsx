'use client';
import { Camera, RefreshCw, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { billUrl, saveBill, toast } from '@/lib/ui';
import Sheet from './Sheet';

// A bill photo kept on this device (IndexedDB), with a full-screen view.
export default function BillField({ uri, onChange }: { uri: string | null; onChange: (uri: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [viewing, setViewing] = useState(false);

  useEffect(() => {
    let alive = true, made: string | null = null;
    setUrl(null);
    if (uri) billUrl(uri).then((u) => { made = u; if (alive) setUrl(u); });
    return () => { alive = false; if (made) URL.revokeObjectURL(made); };
  }, [uri]);

  async function picked() {
    const f = input.current?.files?.[0];
    if (input.current) input.current.value = '';
    if (!f) return;
    try { onChange(await saveBill(f)); } catch (e) { toast(`Couldn't add photo: ${e}`); }
  }

  return (
    <>
      {/* No capture attribute: phones offer camera and gallery in one picker. */}
      <input ref={input} type="file" accept="image/*" hidden onChange={picked} />
      {!uri ? (
        <button className="item" onClick={() => input.current?.click()}>
          <span className="mini-icon"><Camera size={17} /></span>
          <span className="grow faint">Add bill photo</span>
        </button>
      ) : (
        <div className="item">
          <button className="row grow" onClick={() => setViewing(true)} aria-label="Bill photo attached. Open full screen">
            {url ? <img src={url} alt="" className="thumb" /> : <span className="thumb" />}
            <span className="grow" style={{ textAlign: 'left' }}>Bill attached<br /><span className="sub">Tap to view</span></span>
          </button>
          <button className="icon-btn plain" aria-label="Replace bill photo" onClick={() => input.current?.click()}><RefreshCw size={18} /></button>
          <button className="icon-btn plain" aria-label="Remove bill photo" style={{ color: 'var(--red)' }} onClick={() => onChange(null)}><Trash2 size={18} /></button>
        </div>
      )}
      {viewing && url && (
        <Sheet title="Bill" onClose={() => setViewing(false)}>
          <img src={url} alt="Bill" style={{ width: '100%', borderRadius: 16, display: 'block' }} />
        </Sheet>
      )}
      <style jsx>{`
        .thumb { width: 44px; height: 44px; border-radius: 10px; object-fit: cover; background: var(--line); display: block; }
      `}</style>
    </>
  );
}
