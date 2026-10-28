'use client';
import { Camera, ImageUp, PenLine, QrCode, ReceiptText, ScanLine, Zap } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import Avatar from '@/components/Avatar';
import NavBar from '@/components/NavBar';
import { listPeople } from '@/lib/db';
import { nav, openPay } from '@/lib/nav';
import { readBill } from '@/lib/ocr';
import { haptic, saveBill, toast } from '@/lib/ui';
import { parseUpiQr, personQr } from '@/lib/upi';

type Detector = { detect: (src: HTMLVideoElement | ImageBitmap) => Promise<{ rawValue: string }[]> };
const Native = (globalThis as unknown as { BarcodeDetector?: new (o: object) => Detector }).BarcodeDetector;
// Chrome's built-in detector when there is one; jsQR elsewhere (Safari, most laptops).
async function jsqrDetector(): Promise<Detector> {
  const { default: jsQR } = await import('jsqr');
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
  return {
    detect: async (src) => {
      const w0 = 'videoWidth' in src ? src.videoWidth : src.width, h0 = 'videoHeight' in src ? src.videoHeight : src.height;
      const k = Math.min(1, 900 / Math.max(w0, h0)); // smaller frames decode much faster and still read phone-sized QRs
      const w = (ctx.canvas.width = Math.round(w0 * k)), h = (ctx.canvas.height = Math.round(h0 * k));
      ctx.drawImage(src, 0, 0, w, h);
      const r = jsQR(ctx.getImageData(0, 0, w, h).data, w, h);
      return r ? [{ rawValue: r.data }] : [];
    },
  };
}
let detecting: Promise<Detector> | null = null;
const detector = () => (detecting ??= Native ? Promise.resolve(new Native({ formats: ['qr_code'] })) : jsqrDetector());

function foundQr(text: string) {
  const qr = parseUpiQr(text);
  if (qr) { haptic(30); openPay(qr); return; }
  toast("That isn't a UPI payment QR");
}

type Mode = 'qr' | 'bill';

// Two jobs, one camera: pay a UPI QR, or photograph a shop bill and let MyUPI fill in the entry (shop, total, items).
export default function Scan() {
  const payable = listPeople().filter((p) => p.vpa);
  const video = useRef<HTMLVideoElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const track = useRef<MediaStreamTrack | null>(null);
  const [mode, setMode] = useState<Mode>(nav.scanMode);
  nav.scanMode = 'qr'; // Home's "Scan bill" opens on the bill side once; the tab itself opens on QR
  const modeRef = useRef<Mode>(mode);
  modeRef.current = mode;
  const [camState, setCamState] = useState<'starting' | 'on' | 'denied' | 'none'>(navigator.mediaDevices ? 'starting' : 'none');
  const [torch, setTorch] = useState(false);
  const [reading, setReading] = useState<number | null>(null); // bill OCR progress, 0–1

  useEffect(() => {
    if (!navigator.mediaDevices) return;
    let stopped = false, timer = 0, paused = false;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } }).then(async (stream) => {
      if (stopped) return stream.getTracks().forEach((t) => t.stop());
      track.current = stream.getVideoTracks()[0];
      const v = video.current!;
      v.srcObject = stream;
      setCamState('on');
      const d = await detector();
      const tick = async () => {
        if (stopped) return;
        // only looks for QR codes in QR mode, so a bill with a QR printed on it doesn't jump to paying
        if (modeRef.current === 'qr' && !paused && v.readyState >= 2) {
          const [code] = await d.detect(v).catch(() => []);
          // stay paused briefly after a read so it doesn't fire again on the same code
          if (code) { paused = true; foundQr(code.rawValue); setTimeout(() => (paused = false), 2500); }
        }
        timer = window.setTimeout(tick, 250);
      };
      tick();
    }).catch(() => setCamState('denied'));
    return () => { stopped = true; clearTimeout(timer); track.current?.stop(); };
  }, []);

  async function toggleTorch() {
    haptic();
    const on = !torch;
    setTorch(on);
    await track.current?.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] }).catch(() => { setTorch(false); toast('No torch on this camera'); });
  }

  // A bill: kept as the entry's photo, read for shop / total / items, then the entry opens with it all filled in.
  async function bill(photo: Blob) {
    setReading(0);
    try {
      const [img, uri] = await Promise.all([createImageBitmap(photo), saveBill(photo)]);
      const r = await readBill(img, setReading);
      if (!r.total && !r.items.length) toast("Couldn't read much from that bill. Fill in what's missing.");
      haptic(30);
      openPay(null, true, { payee: r.shop, amount: r.total || r.items.reduce((a, it) => a + it.amount, 0), items: r.items, bill: uri, date: r.date });
    } catch (e) {
      toast(navigator.onLine ? `Couldn't read the bill: ${(e as Error).message}` : 'Reading a bill needs internet the first time, to download the reader.');
    }
    setReading(null);
  }
  async function snap() {
    const v = video.current;
    if (!v || v.readyState < 2) return;
    haptic(20);
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d')!.drawImage(v, 0, 0);
    c.toBlob((b) => b && bill(b), 'image/jpeg', 0.92);
  }
  async function fromImage() {
    const f = file.current?.files?.[0];
    if (file.current) file.current.value = '';
    if (!f) return;
    if (mode === 'bill') return bill(f);
    const [code] = await (await detector()).detect(await createImageBitmap(f)).catch(() => []);
    if (code) foundQr(code.rawValue);
    else toast('No QR found in that image');
  }

  const status = camState === 'denied' ? 'Allow camera access in your browser settings'
    : camState === 'none' ? 'No camera here. Pick a photo instead.'
    : mode === 'qr' ? 'Point at a UPI QR' : 'Fit the whole bill in the frame';
  const pickMode = (m: Mode) => { if (m !== mode) { haptic(); setMode(m); } };

  return (
    <div className="page">
      <NavBar title="Scan" />
      <input ref={file} type="file" accept="image/*" hidden onChange={fromImage} />

      <div className="split">
        <div className="side">
          <div className={`cam ${mode}`}>
            <video ref={video} autoPlay playsInline muted className={camState === 'on' ? 'on' : ''} />
            <div className={`finder${camState === 'on' && reading === null ? ' live' : ''}`}><i /><i /><i /><i /></div>
            <p className="status" aria-live="polite">{status}</p>
            {camState === 'on' && <button className={`torch${torch ? ' lit' : ''}`} aria-label="Torch" aria-pressed={torch} onClick={toggleTorch}><Zap size={18} /></button>}
            {/* what to scan, on the camera like a camera app's mode switch */}
            <div className="modes" role="tablist" aria-label="What to scan">
              <button role="tab" aria-selected={mode === 'qr'} onClick={() => pickMode('qr')}><QrCode size={16} /> Pay a QR</button>
              <button role="tab" aria-selected={mode === 'bill'} onClick={() => pickMode('bill')}><ReceiptText size={16} /> Scan a bill</button>
            </div>
            {reading !== null && (
              <div className="reading" role="status">
                <ReceiptText size={28} />
                <p>Reading your bill… {Math.round(reading * 100)}%</p>
                <span className="bar"><i style={{ width: `${Math.max(4, reading * 100)}%` }} /></span>
              </div>
            )}
          </div>

          <div className="controls">
            <button className="ctl" onClick={() => file.current?.click()} disabled={reading !== null}>
              <span className="round"><ImageUp size={20} /></span><span>{mode === 'qr' ? 'From photo' : 'From gallery'}</span>
            </button>
            {mode === 'bill'
              ? <button className="shutter" aria-label="Take photo of the bill" disabled={camState !== 'on' || reading !== null} onClick={snap}><Camera size={28} /></button>
              : <span className="shutter idle" aria-hidden="true"><ScanLine size={28} /></span>}
            <button className="ctl" onClick={() => openPay(null, true)}>
              <span className="round"><PenLine size={20} /></span><span>Type it in</span>
            </button>
          </div>
          <p className="hint center" style={{ margin: '12px 16px 0' }}>
            {mode === 'qr' ? 'It opens by itself when it sees a UPI QR.' : 'Shop, date, total and every item are read on this device. Then split it, or not.'}
          </p>
        </div>

        <section>
          {mode === 'qr' && payable.length > 0 && (
            <>
              <h3 className="eyebrow">Pay someone saved</h3>
              <div className="people">
                {payable.map((p) => (
                  <button key={p.id} className="person" onClick={() => { haptic(); openPay(personQr(p.vpa!, p.name)); }} aria-label={`Pay ${p.name}`}>
                    <Avatar name={p.name} size={52} />
                    <span className="ellipsis">{p.name.split(' ')[0]}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </section>
      </div>

      <style jsx>{`
        /* the camera fills most of the screen, controls float on it */
        .cam { position: relative; overflow: hidden; border-radius: 30px; background: #000; height: min(64dvh, 620px); width: 100%;
          box-shadow: inset 0 0 0 .5px rgb(255 255 255 / .08); }
        video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity .4s; }
        video.on { opacity: 1; }
        /* the frame: a square for a QR, a tall page for a bill; everything outside it is dimmed */
        .finder { position: absolute; left: 50%; top: 46%; translate: -50% -50%; width: min(62%, 300px); aspect-ratio: 1; border-radius: 26px;
          box-shadow: 0 0 0 100vmax rgb(0 0 0 / .45); transition: width .4s var(--ease), aspect-ratio .4s var(--ease); }
        .bill .finder { width: min(70%, 340px); aspect-ratio: 3 / 4; border-radius: 18px; }
        .finder i { position: absolute; width: 36px; height: 36px; border: 4px solid var(--lime); }
        .finder i:nth-child(1) { top: 0; left: 0; border-right: 0; border-bottom: 0; border-top-left-radius: 22px; }
        .finder i:nth-child(2) { top: 0; right: 0; border-left: 0; border-bottom: 0; border-top-right-radius: 22px; }
        .finder i:nth-child(3) { bottom: 0; left: 0; border-right: 0; border-top: 0; border-bottom-left-radius: 22px; }
        .finder i:nth-child(4) { bottom: 0; right: 0; border-left: 0; border-top: 0; border-bottom-right-radius: 22px; }
        .finder.live { animation: breathe 2.4s ease-in-out infinite; }
        @keyframes breathe { 50% { scale: 1.025; } }
        /* fixed white: always on top of the dark camera */
        .status { position: absolute; left: 50%; translate: -50% 0; top: 14px; max-width: calc(100% - 120px); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          color: #fff; font-size: 14px; font-weight: 500; padding: 9px 14px; border-radius: 999px; background: rgb(0 0 0 / .5);
          backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); }
        .torch { position: absolute; top: 10px; right: 10px; width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center; background: rgb(0 0 0 / .45); color: #fff; }
        .torch.lit { background: #fff; color: #000; }
        .modes { position: absolute; left: 50%; bottom: 14px; translate: -50% 0; display: flex; gap: 2px; padding: 3px; border-radius: 999px;
          background: rgb(0 0 0 / .55); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); box-shadow: inset 0 0 0 .5px rgb(255 255 255 / .12); }
        .modes button { display: flex; align-items: center; gap: 6px; min-height: 40px; padding: 0 14px; border-radius: 999px; color: #fff;
          font-size: 14px; font-weight: 600; white-space: nowrap; opacity: .75; transition: background .25s, color .25s, opacity .2s; }
        .modes button[aria-selected='true'] { background: var(--lime); color: var(--on-lime); opacity: 1; }
        .reading { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; gap: 10px; color: #fff; background: rgb(0 0 0 / .72);
          backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
        .reading p { font-weight: 600; }
        .bar { width: 180px; height: 6px; border-radius: 3px; background: rgb(255 255 255 / .2); overflow: hidden; }
        .bar i { display: block; height: 100%; background: var(--lime); transition: width .3s; }
        .controls { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 12px; margin-top: 16px; }
        .ctl { display: grid; justify-items: center; gap: 6px; font-size: 13px; font-weight: 500; color: var(--sub); padding: 4px 0; }
        .round { width: 48px; height: 48px; border-radius: 50%; display: grid; place-items: center; background: var(--card); color: var(--ink);
          box-shadow: inset 0 0 0 .5px rgb(255 255 255 / .08); transition: transform .3s var(--spring), background .2s; }
        .ctl:active:not(:disabled) .round { transform: scale(.9); background: var(--pressed); }
        .ctl:disabled { opacity: .4; }
        .shutter { width: 76px; height: 76px; border-radius: 50%; display: grid; place-items: center; background: var(--lime); color: var(--on-lime);
          box-shadow: 0 0 0 4px var(--bg), 0 0 0 6px var(--lime); transition: transform .3s var(--spring); }
        .shutter:active:not(:disabled) { transform: scale(.9); }
        .shutter:disabled { opacity: .4; }
        .shutter.idle { background: var(--raised); color: var(--sub); box-shadow: 0 0 0 4px var(--bg), 0 0 0 6px var(--raised); }
        .people { display: flex; gap: 4px; overflow-x: auto; scrollbar-width: none; }
        .person { display: grid; justify-items: center; gap: 6px; width: 68px; flex-shrink: 0; font-size: 12.5px; font-weight: 500; }
        .person span { max-width: 64px; }
        @media (min-width: 1100px) { .cam { height: min(74vh, 760px); } }
      `}</style>
    </div>
  );
}
