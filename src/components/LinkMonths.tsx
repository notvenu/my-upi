'use client';
import { Plus } from 'lucide-react';
import { monthName, ym, ymd } from '@/lib/ui';

const shift = (m: string, n: number) => { const [y, mo] = m.split('-').map(Number); return ym(new Date(y, mo - 1 + n, 1)); };
const monthEnd = (m: string) => { const [y, mo] = m.split('-').map(Number); return ymd(new Date(y, mo, 0)); };
const short = (m: string) => monthName(m).split(' ')[0];

// Which months a split link covers. It only ever grows: stop it at last month, then add each new month when you're
// ready to share it, or open it to every month. until is stored as the month's last day.
export default function LinkMonths({ until, onChange }: { until: string | null | undefined; onChange: (until: string | null) => void }) {
  const now = ym(new Date());
  const last = until?.slice(0, 7);
  const next = last && shift(last, 1) <= now ? shift(last, 1) : null;
  return (
    <div className="months-row">
      <span className="grow" style={{ minWidth: 0 }}>Months on the link<br />
        <span className="sub" style={{ fontSize: 13 }}>{last ? `Up to ${monthName(last)}` : 'Every month, up to now'}</span></span>
      {last ? (
        <>
          {next && <button className="btn soft add" onClick={() => onChange(monthEnd(next))}><Plus size={16} /> Add {short(next)}</button>}
          <button className="link" onClick={() => onChange(null)}>All</button>
        </>
      ) : <button className="link" onClick={() => onChange(monthEnd(shift(now, -1)))}>Stop at {short(shift(now, -1))}</button>}
      <style jsx>{`
        .months-row { display: flex; align-items: center; gap: 10px; font-size: 15px; }
        .add { min-height: 36px; padding: 0 12px; font-size: 14px; width: auto; }
      `}</style>
    </div>
  );
}
