'use client';
import { ChevronLeft, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { addSheet, pushLayer } from '@/lib/ui';

// An iOS card sheet: rises on the system curve, drags down to dismiss, Esc / Back / the scrim close it.
// back: a pushed step inside the sheet; the leading button becomes a chevron and dismissing pops the step instead.
// Inputs marked data-autofocus get focus when it opens.
export default function Sheet({ title, onClose, full = false, children, footer, trailing, back }: {
  title?: string; onClose: () => void; full?: boolean; children: ReactNode; footer?: ReactNode; trailing?: ReactNode; back?: () => void;
}) {
  const dlg = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [closing, setClosing] = useState(false);

  // leaves faster than it came, from wherever the finger let go, then tells the parent
  const close = () => { if (closing) return; setClosing(true); setTimeout(onClose, 280); };
  const dismiss = back ?? close;
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;

  useEffect(() => {
    const d = dlg.current!;
    if (!d.open) d.showModal();
    const auto = d.querySelector<HTMLElement>('[data-autofocus]');
    if (auto) auto.focus();
    else if (document.activeElement?.classList.contains('close')) (document.activeElement as HTMLElement).blur(); // no ring for the automatic focus
    addSheet(1);
    const release = pushLayer(() => dismissRef.current()); // Back closes it; unmounting releases the history entry
    return () => { addSheet(-1); release(); };
  }, []);

  // Drag to dismiss: from the grabber/header anywhere, or from the content once it's scrolled to the top.
  const g = useRef({ startY: 0, startT: 0, armed: false, fromHeader: false, dragging: false, y: 0 });
  const start = (y: number, header: boolean) => Object.assign(g.current, { startY: y, startT: performance.now(), armed: true, fromHeader: header });
  const move = (y: number, e: Event) => {
    const s = g.current;
    if (!s.armed) return;
    const dy = y - s.startY;
    if (!s.dragging) {
      const top = (scroller.current?.scrollTop ?? 0) <= 0;
      if (dy > 6 && (s.fromHeader || top)) { s.dragging = true; setDragging(true); }
      else if (dy < -6 || (dy > 6 && !top)) { s.armed = false; return; }
      else return;
    }
    if (e.cancelable) e.preventDefault();
    s.y = dy > 0 ? dy : -Math.sqrt(-dy) * 2; // rubber-band when pulled up past the detent
    setDragY(s.y);
  };
  const end = () => {
    const s = g.current;
    if (!s.armed) return;
    s.armed = false;
    if (!s.dragging) return;
    s.dragging = false;
    setDragging(false);
    const v = s.y / (performance.now() - s.startT); // px per ms
    if (s.y > 140 || (v > 0.5 && s.y > 30)) dismissRef.current === close ? close() : (dismissRef.current(), setDragY(0));
    else setDragY(0);
  };
  useEffect(() => {
    const p = panel.current!;
    const ts = (e: TouchEvent) => start(e.touches[0].clientY, !!(e.target as Element).closest('.head'));
    const tm = (e: TouchEvent) => move(e.touches[0].clientY, e);
    p.addEventListener('touchstart', ts, { passive: true });
    p.addEventListener('touchmove', tm, { passive: false });
    p.addEventListener('touchend', end);
    p.addEventListener('touchcancel', end);
    return () => { p.removeEventListener('touchstart', ts); p.removeEventListener('touchmove', tm); p.removeEventListener('touchend', end); p.removeEventListener('touchcancel', end); };
  });
  // mouse drag on the grabber/header, so it works on a laptop too
  const mouseDown = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse' || (e.target as Element).closest('button')) return;
    start(e.clientY, true);
    const mm = (ev: PointerEvent) => move(ev.clientY, ev);
    const mu = () => { end(); removeEventListener('pointermove', mm); removeEventListener('pointerup', mu); };
    addEventListener('pointermove', mm);
    addEventListener('pointerup', mu);
  };
  const progress = Math.min(1, Math.max(0, dragY) / (panel.current?.offsetHeight || 1));

  return (
    <dialog ref={dlg} className="host" aria-label={title} onCancel={(e) => { e.preventDefault(); dismiss(); }}>
      <div className={`scrim${closing ? ' out' : ''}`} style={{ opacity: 1 - progress }} onClick={dismiss} aria-hidden="true" />
      <div ref={panel} className={`panel${full ? ' full' : ''}${dragging ? ' dragging' : ''}${closing ? ' out' : ''}`}
        style={{ transform: `translateY(${dragY}px)`, ['--from' as string]: `${dragY}px` }}>
        <div className="head" onPointerDown={mouseDown}>
          <div className="grab" />
          <div className="bar">
            {back
              ? <button className="icon-btn close" aria-label="Back" onClick={back}><ChevronLeft size={22} strokeWidth={2.4} /></button>
              : <button className="icon-btn close" aria-label="Close" onClick={close}><X size={19} strokeWidth={2.4} /></button>}
            {title ? <h2 className="ellipsis">{title}</h2> : <span />}
            <div className="trail">{trailing}</div>
          </div>
        </div>
        <div className="scroll" ref={scroller}><div className="inner">{children}</div></div>
        {footer && <footer><div className="inner">{footer}</div></footer>}
      </div>
      <style jsx>{`
        .host { position: fixed; inset: 0; width: 100%; height: 100%; max-width: none; max-height: none; margin: 0; padding: 0; border: 0;
          background: transparent; overflow: hidden; color: var(--ink); }
        .host::backdrop { background: transparent; }
        .scrim { position: absolute; inset: 0; background: rgb(0 0 0 / .55); animation: fade-in .4s backwards; }
        .scrim.out { animation: fade-out .28s forwards; }
        .panel { position: absolute; left: 0; right: 0; bottom: 0; margin: 0 auto; width: 100%; max-width: 640px; max-height: calc(100dvh - env(safe-area-inset-top) - 24px);
          display: flex; flex-direction: column; background: #0B0B0B; border-radius: 34px 34px 0 0;
          box-shadow: inset 0 .5px 0 rgb(255 255 255 / .12), 0 -20px 60px rgb(0 0 0 / .7);
          transition: transform .5s var(--ease); will-change: transform; animation: rise .52s cubic-bezier(.23, 1, .32, 1) backwards; }
        .panel.out { animation: sink .28s cubic-bezier(.55, 0, 1, .45) forwards; }
        .panel.full { top: calc(env(safe-area-inset-top) + 24px); }
        .panel.dragging { transition: none; }
        .head { flex-shrink: 0; touch-action: none; cursor: grab; padding: 6px 16px 0; }
        .grab { width: 36px; height: 5px; border-radius: 3px; background: var(--line); margin: 0 auto; }
        .bar { display: grid; grid-template-columns: 44px 1fr minmax(44px, auto); align-items: center; gap: 8px; min-height: 52px; max-width: 608px; margin: 0 auto; }
        .bar h2 { font-size: 17px; font-weight: 600; text-align: center; letter-spacing: -0.41px; }
        .trail { display: flex; justify-content: flex-end; }
        .close { width: 40px; height: 40px; }
        .scroll { overflow-y: auto; flex: 1; min-height: 0; overscroll-behavior: contain; padding: 4px 16px 28px; scrollbar-width: none; }
        .inner { max-width: 608px; margin: 0 auto; }
        footer { padding: 10px 16px calc(10px + env(safe-area-inset-bottom)); background: var(--material); backdrop-filter: blur(24px) saturate(1.8);
          -webkit-backdrop-filter: blur(24px) saturate(1.8); border-top: .5px solid var(--line); }
        @keyframes rise { from { transform: translateY(105%); } }
        @keyframes sink { from { transform: translateY(var(--from)); } to { transform: translateY(110%); } }
        @keyframes fade-in { from { opacity: 0; } }
        @keyframes fade-out { to { opacity: 0; } }
        @media (min-width: 700px) { .panel:not(.full) { bottom: auto; top: 50%; translate: 0 -50%; border-radius: 34px; } }
        /* laptop: a centred dialog, not a sheet from the bottom edge */
        @media (min-width: 900px) {
          .panel { max-width: 680px; overflow: hidden; }
          .panel.full { top: 4vh; bottom: 4vh; border-radius: 28px; }
          .panel:not(.full) { max-height: 88vh; }
          .grab { visibility: hidden; }
          .scroll { scrollbar-width: thin; scrollbar-color: var(--line) transparent; }
          @keyframes rise { from { transform: translateY(40px); opacity: 0; } }
          @keyframes sink { to { transform: translateY(40px); opacity: 0; } }
        }
      `}</style>
    </dialog>
  );
}
