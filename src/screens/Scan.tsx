'use client';
import { ChevronRight, ImageUp, PenLine, Zap } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import Avatar from '@/components/Avatar';
import { listPeople } from '@/lib/db';
import { openPay } from '@/lib/nav';
import { haptic, toast } from '@/lib/ui';
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

function found(text: string) {
  const qr = parseUpiQr(text);
  if (qr) { haptic(30); openPay(qr); return; }
  toast("That isn't a UPI payment QR");
}

export default function Scan() {
  const payable = listPeople().filter((p) => p.vpa);
  const video = useRef<HTMLVideoElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const track = useRef<MediaStreamTrack | null>(null);
  const [camState, setCamState] = useState<'starting' | 'on' | 'denied' | 'none'>(navigator.mediaDevices ? 'starting' : 'none');
  const [torch, setTorch] = useState(false);

  useEffect(() => {
    if (!navigator.mediaDevices) return;
    let stopped = false, timer = 0, paused = false;
    Promise.all([navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }), detector()]).then(([stream, d]) => {
      if (stopped) return stream.getTracks().forEach((t) => t.stop());
      track.current = stream.getVideoTracks()[0];
      const v = video.current!;
      v.srcObject = stream;
      setCamState('on');
      const tick = async () => {
        if (stopped) return;
        if (!paused && v.readyState >= 2) {
          const [code] = await d.detect(v).catch(() => []);
          // stay paused briefly after a read so it doesn't fire again on the same code
          if (code) { paused = true; found(code.rawValue); setTimeout(() => (paused = false), 2500); }
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

  async function fromImage() {
    const f = file.current?.files?.[0];
    if (file.current) file.current.value = '';
    if (!f) return;
    const [code] = await (await detector()).detect(await createImageBitmap(f)).catch(() => []);
    if (code) found(code.rawValue);
    else toast('No QR found in that image');
  }

  return (
    <>
      <input ref={file} type="file" accept="image/*" hidden onChange={fromImage} />
      <div className="scan">
        <div className="cam">
          <video ref={video} autoPlay playsInline muted className={camState === 'on' ? 'on' : ''} />
          <div className="shade">
            <h1>Scan a UPI QR</h1>
            <p>{camState === 'denied' ? 'Allow camera access in settings' : camState === 'none' ? 'No camera here. Scan a screenshot or enter details below.' : 'Shops, friends, bills'}</p>
            <div className={`finder${camState === 'on' ? ' live' : ''}`}><i /><i /><i /><i /></div>
          </div>
          {camState === 'on' && <button className={`torch${torch ? ' lit' : ''}`} aria-label="Torch" aria-pressed={torch} onClick={toggleTorch}><Zap size={20} /></button>}
        </div>

        <div className="panel">
          {payable.length > 0 && (
            <>
              <h3 className="eyebrow" style={{ marginTop: 0 }}>Pay someone saved</h3>
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
          <div className="list" style={{ marginTop: 12 }}>
            <button className="item" onClick={() => openPay(null, true)}>
              <span className="mini-icon"><PenLine size={17} /></span>
              <span className="grow"><b style={{ fontWeight: 600 }}>Paid by cash or card</b><br /><span className="sub">Record it with all the details</span></span>
              <ChevronRight size={18} className="faint" />
            </button>
            <button className="item" onClick={() => file.current?.click()}>
              <span className="mini-icon"><ImageUp size={17} /></span>
              <span className="grow"><b style={{ fontWeight: 600 }}>Scan from a screenshot</b><br /><span className="sub">A QR someone sent you</span></span>
              <ChevronRight size={18} className="faint" />
            </button>
          </div>
        </div>
      </div>
      <style jsx>{`
        .scan { display: flex; flex-direction: column; min-height: 100dvh; background: #000; padding-bottom: 84px; }
        .cam { position: relative; flex: 1; min-height: 340px; overflow: hidden; }
        video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity .4s; }
        video.on { opacity: 1; }
        /* overlay always sits on black video, so fixed white is intentional */
        .shade { position: absolute; inset: 0; display: grid; justify-items: center; align-content: start; padding: 48px 24px 0; color: #fff; text-align: center;
          background: radial-gradient(circle at 50% 58%, transparent 125px, #000a 126px); }
        h1 { font-size: 24px; font-weight: 600; letter-spacing: -0.03em; }
        .shade p { color: #fffc; margin-top: 4px; max-width: 300px; }
        .finder { position: relative; width: 240px; height: 240px; margin-top: 36px; }
        .finder i { position: absolute; width: 44px; height: 44px; border: 4px solid var(--lime); }
        .finder i:nth-child(1) { top: 0; left: 0; border-right: 0; border-bottom: 0; border-top-left-radius: 22px; }
        .finder i:nth-child(2) { top: 0; right: 0; border-left: 0; border-bottom: 0; border-top-right-radius: 22px; }
        .finder i:nth-child(3) { bottom: 0; left: 0; border-right: 0; border-top: 0; border-bottom-left-radius: 22px; }
        .finder i:nth-child(4) { bottom: 0; right: 0; border-left: 0; border-top: 0; border-bottom-right-radius: 22px; }
        .finder.live { animation: breathe 2.2s ease-in-out infinite; }
        @keyframes breathe { 50% { transform: scale(1.035); } }
        .torch { position: absolute; top: 16px; right: 16px; width: 48px; height: 48px; border-radius: 50%; display: grid; place-items: center; background: #fff3; color: #fff; }
        .torch.lit { background: #fff; color: #000; }
        .panel { background: var(--bg); border-radius: 28px 28px 0 0; padding: 20px 16px 16px; margin-top: -28px; position: relative; }
        .panel > * { max-width: 528px; margin-left: auto; margin-right: auto; }
        .people { display: flex; gap: 4px; overflow-x: auto; scrollbar-width: none; }
        .person { display: grid; justify-items: center; gap: 6px; width: 68px; flex-shrink: 0; font-size: 12.5px; font-weight: 500; }
        .person span { max-width: 64px; }
      `}</style>
    </>
  );
}
