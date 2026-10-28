'use client';
import { haptic } from '@/lib/ui';

// UISegmentedControl: the thumb slides to the picked option.
export default function Segmented<T extends string>({ options, value, onChange, label }: {
  options: readonly (readonly [T, string])[]; value: T; onChange: (v: T) => void; label?: string;
}) {
  const idx = Math.max(0, options.findIndex(([k]) => k === value));
  return (
    <div className="seg" role="tablist" aria-label={label} style={{ ['--n' as string]: options.length, ['--i' as string]: idx }}>
      <span className="thumb" />
      {options.map(([k, text]) => (
        <button key={k} role="tab" aria-selected={k === value} onClick={() => { if (k !== value) { haptic(); onChange(k); } }}>{text}</button>
      ))}
      <style jsx>{`
        .seg { position: relative; display: grid; grid-template-columns: repeat(var(--n), 1fr); background: var(--raised); border-radius: 999px; padding: 3px; }
        .thumb { position: absolute; top: 3px; bottom: 3px; left: 3px; width: calc((100% - 6px) / var(--n)); border-radius: 999px;
          background: #343434; box-shadow: 0 3px 8px rgb(0 0 0 / .35), inset 0 .5px 0 rgb(255 255 255 / .1);
          transform: translateX(calc(var(--i) * 100%)); transition: transform .45s var(--spring); }
        button { position: relative; min-height: 36px; border-radius: 999px; font-size: 15px; font-weight: 500; letter-spacing: -0.24px; color: var(--ink); transition: opacity .2s; }
        button[aria-selected='false'] { opacity: .65; }
        button:active { opacity: .4; }
      `}</style>
    </div>
  );
}
