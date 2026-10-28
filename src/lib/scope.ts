// What a split request covers: everything pending, one payment, the last 7 days, a calendar month, or a trip.
// Keys: 'all' | 'x:<txnId>' | 'w' | 'm:YYYY-MM' | 't:<trip>'.
export type Scoped = { txn_id: number; created_at: string; trip: string | null; amount: number };
// label: the chip; about: names the scope in the UI; phrase: how the request message refers to it.
export type Scope = { key: string; label: string; about?: string; phrase: string; total: number; count: number };

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n: number) => String(n).padStart(2, '0');
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function inScope(key: string, x: Scoped, today = new Date()): boolean {
  if (key === 'all') return true;
  if (key === 'w') { const from = new Date(today); from.setDate(from.getDate() - 6); return x.created_at.slice(0, 10) >= isoDay(from); }
  if (key.startsWith('x:')) return x.txn_id === Number(key.slice(2));
  if (key.startsWith('m:')) return x.created_at.startsWith(key.slice(2));
  if (key.startsWith('t:')) return x.trip === key.slice(2);
  return false;
}

// Only scopes that pick out something different from "All" are offered; newest months first, then trips.
export function scopesFor(items: Scoped[], today = new Date(), txnId?: number): Scope[] {
  const keys = ['all'];
  if (txnId !== undefined && items.some((x) => x.txn_id === txnId)) keys.push(`x:${txnId}`);
  keys.push('w');
  keys.push(...[...new Set(items.map((x) => x.created_at.slice(0, 7)))].sort().reverse().map((m) => `m:${m}`));
  keys.push(...[...new Set(items.map((x) => x.trip).filter(Boolean))].map((t) => `t:${t}`));
  const all = items.length;
  return keys
    .map((key) => {
      const hit = items.filter((x) => inScope(key, x, today));
      return { key, ...describe(key, today), total: hit.reduce((a, x) => a + x.amount, 0), count: hit.length };
    })
    .filter((s) => s.key === 'all' || (s.count > 0 && (s.count < all || s.key.startsWith('t:') || s.key.startsWith('x:'))));
}

function describe(key: string, today: Date): { label: string; about?: string; phrase: string } {
  if (key === 'all') return { label: 'All', phrase: 'our splits' };
  if (key === 'w') return { label: 'Last 7 days', about: 'the last 7 days', phrase: 'our splits from the last 7 days' };
  if (key.startsWith('x:')) return { label: 'This payment', about: 'this payment', phrase: 'our splits' };
  if (key.startsWith('t:')) return { label: key.slice(2), about: key.slice(2), phrase: `our ${key.slice(2)} splits` };
  const [y, m] = key.slice(2).split('-').map(Number);
  const label = MONTHS[m - 1] + (y !== today.getFullYear() ? ` ${y}` : '');
  return { label, about: label, phrase: `our ${label} splits` };
}
