import { Clock, X } from 'lucide-react';
import { catHue, catIcon } from '@/lib/ui';

// graphite squircle, the glyph carries a muted category hue; a dot marks unconfirmed or failed payments
export default function CatIcon({ cat, status, size = 40 }: { cat: string; status?: string; size?: number }) {
  const Icon = catIcon(cat);
  const badge = status === 'FAILURE' ? 'fail' : status && status !== 'SUCCESS' ? 'wait' : null;
  return (
    <span className="cat-icon" aria-hidden="true" style={{ ['--hue' as string]: catHue(cat), width: size, height: size, borderRadius: size * 0.26 }}>
      <Icon size={size * 0.46} strokeWidth={1.9} />
      {badge && <span className={`badge-dot ${badge}`}>{badge === 'fail' ? <X size={11} strokeWidth={3.2} /> : <Clock size={11} strokeWidth={3} />}</span>}
    </span>
  );
}
