'use client';
import { Banknote, Camera, ChevronRight, ImageUp, ReceiptText, ScanLine, Zap } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import Avatar from '@/components/Avatar';
import NavBar from '@/components/NavBar';
import Segmented from '@/components/Segmented';
import { listPeople } from '@/lib/db';
import { openPay } from '@/lib/nav';
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
  const [mode, setMode] = useState<Mode>('qr');
  const modeRef = useRef<Mode>('qr');
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
    : mode === 'qr' ? 'Point at a UPI QR. It opens by itself.' : 'Fit the whole bill in the frame, then tap the shutter';

  return (
    <div className="page">
      <NavBar title="Scan" />
      <div style={{ marginBottom: 14 }}>
        <Segmented options={[['qr', 'Pay a QR'], ['bill', 'Scan a bill']] as const} value={mode} onChange={setMode} label="What to scan" />
      </div>
      <input ref={file} type="file" accept="image/*" hidden onChange={fromImage} />

      <div className="split">
        <div className="side">
          <div className={`cam ${mode}`}>
            <video ref={video} autoPlay playsInline muted className={camState === 'on' ? 'on' : ''} />
            <div className={`finder${camState === 'on' && reading === null ? ' live' : ''}`}><i /><i /><i /><i /></div>
            <p className="status">{status}</p>
            {camState === 'on' && <button className={`torch${torch ? ' lit' : ''}`} aria-label="Torch" aria-pressed={torch} onClick={toggleTorch}><Zap size={18} /></button>}
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
              <ImageUp size={20} /><span>{mode === 'qr' ? 'QR screenshot' : 'Choose photo'}</span>
            </button>
            {mode === 'bill'
              ? <button className="shutter" aria-label="Take photo of the bill" disabled={camState !== 'on' || reading !== null} onClick={snap}><Camera size={26} /></button>
              : <span className="shutter idle" aria-hidden="true"><ScanLine size={26} /></span>}
            <button className="ctl" onClick={() => openPay(null, true)}><Banknote size={20} /><span>Cash or card</span></button>
          </div>
        </div>

        <section>
          {mode === 'qr' ? (
            <>
              {payable.length > 0 && (
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
              <div className="list" style={{ marginTop: 14 }}>
                <button className="item" onClick={() => { haptic(); setMode('bill'); }}>
                  <span className="mini-icon lime"><ReceiptText size={17} /></span>
                  <span className="grow"><b style={{ fontWeight: 600 }}>Got a bill?</b><br /><span className="sub">Scan it to fill in the shop, total and items</span></span>
                  <ChevronRight size={18} strokeWidth={2.5} className="chev" />
                </button>
              </div>
            </>
          ) : (
            <div className="card how">
              <p style={{ fontWeight: 600 }}>From a bill to a split in one go</p>
              <ol className="sub">
                <li>Snap the bill, flat and well lit.</li>
                <li>MyUPI reads the shop, date, total and each item, right on this device.</li>
                <li>Check what it read, then keep it for yourself, split it equally, or tap whose each item was.</li>
              </ol>
              <p className="hint" style={{ margin: '10px 0 0' }}>The photo is saved with the entry.</p>
            </div>
          )}
        </section>
      </div>

      <style jsx>{`
        /* the camera sits in a card, not edge to edge */
        .cam { position: relative; overflow: hidden; border-radius: 28px; background: #000; aspect-ratio: 4 / 5; max-height: 54vh; width: 100%;
          box-shadow: inset 0 0 0 .5px rgb(255 255 255 / .08); transition: aspect-ratio .4s var(--ease); }
        .cam.bill { aspect-ratio: 3 / 4; }
        video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity .4s; }
        video.on { opacity: 1; }
        /* the frame: a square for a QR, a tall page for a bill; everything outside it is dimmed */
        .finder { position: absolute; left: 50%; top: 54%; translate: -50% -50%; width: 62%; aspect-ratio: 1; border-radius: 26px;
          box-shadow: 0 0 0 100vmax rgb(0 0 0 / .45); transition: width .4s var(--ease), aspect-ratio .4s var(--ease); }
        .bill .finder { width: 72%; aspect-ratio: 3 / 4; border-radius: 18px; }
        .finder i { position: absolute; width: 36px; height: 36px; border: 4px solid var(--lime); }
        .finder i:nth-child(1) { top: 0; left: 0; border-right: 0; border-bottom: 0; border-top-left-radius: 22px; }
        .finder i:nth-child(2) { top: 0; right: 0; border-left: 0; border-bottom: 0; border-top-right-radius: 22px; }
        .finder i:nth-child(3) { bottom: 0; left: 0; border-right: 0; border-top: 0; border-bottom-left-radius: 22px; }
        .finder i:nth-child(4) { bottom: 0; right: 0; border-left: 0; border-top: 0; border-bottom-right-radius: 22px; }
        .finder.live { animation: breathe 2.4s ease-in-out infinite; }
        @keyframes breathe { 50% { scale: 1.025; } }
        /* fixed white: always on top of the dark camera */
        .status { position: absolute; left: 14px; right: 64px; top: 14px; text-align: left; color: #fff; font-size: 14px; font-weight: 500;
          padding: 10px 14px; border-radius: 999px; background: rgb(0 0 0 / .5); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); }
        .torch { position: absolute; top: 14px; right: 14px; width: 42px; height: 42px; border-radius: 50%; display: grid; place-items: center; background: rgb(0 0 0 / .45); color: #fff; }
        .torch.lit { background: #fff; color: #000; }
        .reading { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; gap: 10px; color: #fff; background: rgb(0 0 0 / .72);
          backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
        .reading p { font-weight: 600; }
        .bar { width: 180px; height: 6px; border-radius: 3px; background: rgb(255 255 255 / .2); overflow: hidden; }
        .bar i { display: block; height: 100%; background: var(--lime); transition: width .3s; }
        .controls { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 12px; margin-top: 16px; }
        .ctl { display: grid; justify-items: center; gap: 6px; font-size: 13px; font-weight: 500; color: var(--sub); padding: 8px 0; border-radius: 16px; }
        .ctl:active:not(:disabled) { background: var(--pressed); }
        .ctl:disabled { opacity: .4; }
        .shutter { width: 72px; height: 72px; border-radius: 50%; display: grid; place-items: center; background: var(--lime); color: var(--on-lime);
          box-shadow: 0 0 0 4px var(--bg), 0 0 0 6px var(--lime); transition: transform .3s var(--spring); }
        .shutter:active:not(:disabled) { transform: scale(.9); }
        .shutter:disabled { opacity: .4; }
        .shutter.idle { background: var(--raised); color: var(--sub); box-shadow: 0 0 0 4px var(--bg), 0 0 0 6px var(--raised); }
        .people { display: flex; gap: 4px; overflow-x: auto; scrollbar-width: none; }
        .person { display: grid; justify-items: center; gap: 6px; width: 68px; flex-shrink: 0; font-size: 12.5px; font-weight: 500; }
        .person span { max-width: 64px; }
        .how ol { margin: 10px 0 0; padding-left: 20px; display: grid; gap: 6px; font-size: 14px; }
        @media (min-width: 1100px) { .cam { max-height: 72vh; } }
      `}</style>
    </div>
  );
}
