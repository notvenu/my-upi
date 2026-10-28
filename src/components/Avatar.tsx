import { Check } from 'lucide-react';

// Monochrome monograms; a slight per-person shade keeps neighbours apart without adding colour.
const SHADES = ['#2E2E2E', '#3A3A38', '#262626', '#34342F', '#2B2B30'];

export default function Avatar({ name, size = 44, selected = false }: { name: string; size?: number; selected?: boolean }) {
  const shade = SHADES[[...name].reduce((a, ch) => a + ch.charCodeAt(0), 0) % SHADES.length];
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';
  return (
    <span className={`av${selected ? ' selected' : ''}`} aria-hidden="true"
      style={{ ['--shade' as string]: shade, width: size, height: size, fontSize: size * 0.4 }}>
      {selected ? <Check size={size * 0.48} strokeWidth={2.8} /> : initials}
    </span>
  );
}
