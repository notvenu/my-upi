'use client';
import type { ReactNode } from 'react';
import { useScrollY } from '@/lib/store';

// iOS large title: scrolls away under a glass bar that takes over the title once it's gone.
export default function NavBar({ title, subtitle, trailing }: { title: string; subtitle?: string; trailing?: ReactNode }) {
  const y = useScrollY();
  const collapsed = y > 42;
  // overscroll stretch: pulling down past the top scales the large title up a little, like UIKit
  const stretch = y < 0 ? Math.min(1.12, 1 - y / 600) : 1;
  return (
    <>
      <div className={`bar${collapsed ? ' collapsed' : ''}`}>
        <span className="small" aria-hidden={!collapsed}>{title}</span>
        <div className="trail">{trailing}</div>
      </div>
      <header className="large">
        {subtitle && <p className="subtitle">{subtitle}</p>}
        <h1 style={{ scale: stretch }}>{title}</h1>
      </header>
      <style jsx>{`
        .bar { position: sticky; top: 0; z-index: 5; margin: 0 -16px; padding: calc(env(safe-area-inset-top) + 6px) 16px 6px; min-height: calc(env(safe-area-inset-top) + 56px);
          display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; border-bottom: .5px solid transparent;
          transition: background .25s, border-color .25s, backdrop-filter .25s; }
        .collapsed { background: var(--material); backdrop-filter: blur(24px) saturate(1.8); -webkit-backdrop-filter: blur(24px) saturate(1.8); border-color: var(--line); }
        .small { grid-column: 2; font-size: 17px; font-weight: 600; opacity: 0; transform: translateY(6px); transition: opacity .2s, transform .3s var(--ease); white-space: nowrap; }
        .collapsed .small { opacity: 1; transform: none; }
        .trail { grid-column: 3; display: flex; justify-content: flex-end; gap: 10px; }
        .large { padding: 0 0 12px; }
        h1 { font-size: 34px; font-weight: 700; letter-spacing: 0.37px; line-height: 1.2; transform-origin: left center; }
        .subtitle { font-size: 13px; font-weight: 600; text-transform: uppercase; color: var(--sub); letter-spacing: -0.08px; }
      `}</style>
    </>
  );
}
