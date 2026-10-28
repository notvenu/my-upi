export type StmtRow = {
  date: string; // YYYY-MM-DD
  amount: number; // paise
  direction: 'debit' | 'credit';
  desc: string;
  ref?: string; // 12-digit UPI RRN when present
  vpa?: string;
  key: string; // dedupe key across re-imports
};

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (n: number) => String(n).padStart(2, '0');

// Indian banks use day-first dates: 05/10/2026, 05-10-26, 05-Oct-2026, 05 Oct 26, plus ISO 2026-10-05.
export function parseDate(s: string): string | null {
  s = s.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = s.match(/^(\d{1,2})[\/\-. ]([A-Za-z]{3,9}|\d{1,2})[\/\-. ,]+(\d{2,4})/);
  if (!m) return null;
  const mon = /\d/.test(m[2]) ? +m[2] : MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1;
  const year = m[3].length === 2 ? 2000 + +m[3] : +m[3];
  if (mon < 1 || mon > 12 || +m[1] < 1 || +m[1] > 31) return null;
  return `${year}-${pad(mon)}-${pad(+m[1])}`;
}

export function parseAmount(s: string): number {
  const n = parseFloat(String(s).replace(/[^\d.\-]/g, ''));
  return isNaN(n) ? 0 : Math.round(Math.abs(n) * 100);
}

function findCol(header: string[], re: RegExp, not?: RegExp) {
  return header.findIndex((h) => re.test(h) && !(not && not.test(h)));
}

// rows = sheet as a grid of strings. Finds the header row, then reads every dated row under it.
export function parseStatement(rows: string[][]): StmtRow[] {
  const hi = rows.slice(0, 60).findIndex((r) => {
    const h = r.map((c) => String(c).toLowerCase());
    return h.some((c) => /date/.test(c)) && h.some((c) => /narration|description|particulars|remarks|details/.test(c))
      && h.some((c) => /debit|withdraw|credit|deposit|amount/.test(c));
  });
  if (hi < 0) return [];
  const h = rows[hi].map((c) => String(c).toLowerCase().trim());
  const cDate = findCol(h, /date/, /value/) >= 0 ? findCol(h, /date/, /value/) : findCol(h, /date/);
  const cDesc = findCol(h, /narration|description|particulars|remarks|details/);
  const cDr = findCol(h, /debit|withdraw/);
  const cCr = findCol(h, /credit|deposit/);
  const cAmt = findCol(h, /amount/, /debit|credit|withdraw|deposit|balance/);
  const cType = findCol(h, /dr\s*\/\s*cr|^type|cr\/dr/);
  const cRef = findCol(h, /ref|chq|cheque/);

  const out: StmtRow[] = [];
  const seen = new Map<string, number>();
  for (const r of rows.slice(hi + 1)) {
    const date = parseDate(String(r[cDate] ?? ''));
    if (!date) continue;
    const desc = String(r[cDesc] ?? '').trim();
    let amount = 0, direction: StmtRow['direction'] = 'debit';
    const dr = cDr >= 0 ? parseAmount(r[cDr]) : 0, cr = cCr >= 0 ? parseAmount(r[cCr]) : 0;
    if (dr) amount = dr;
    else if (cr) { amount = cr; direction = 'credit'; }
    else if (cAmt >= 0) {
      amount = parseAmount(r[cAmt]);
      const t = `${cType >= 0 ? r[cType] : ''} ${r[cAmt]}`.toLowerCase();
      if (/\bcr\b|credit/.test(t)) direction = 'credit';
    }
    if (!amount) continue;
    // ref columns zero-pad the RRN (0000612345678901), so keep the last 12 digits
    const refDigits = cRef >= 0 ? String(r[cRef]).replace(/\D/g, '') : '';
    const ref = refDigits.length >= 12 ? refDigits.slice(-12) : desc.match(/(?<!\d)\d{12}(?!\d)/)?.[0];
    const vpa = desc.match(/[\w.]+@[a-z]+/i)?.[0]; // no '-': HDFC uses it as the narration separator
    let key = `${date}|${direction}|${amount}|${ref ?? desc}`;
    // identical rows on the same day are distinct transactions, number them
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    if (n > 1) key += `#${n}`;
    out.push({ date, amount, direction, desc, ref, vpa, key });
  }
  return out;
}

// How a statement row was paid, from its narration.
export function methodFromDesc(desc: string, vpa?: string): 'upi' | 'card' | 'bank' | null {
  if (vpa || /\bupi\b/i.test(desc)) return 'upi';
  if (/\b(pos|card|ecom|visa|mastercard|rupay)\b/i.test(desc)) return 'card';
  if (/\b(nach|ach|ecs|neft|imps|rtgs)\b/i.test(desc)) return 'bank';
  return null;
}

export type MatchableTxn = { id: number; amount: number; direction: string; date: string; refs: string[] };

// Ref match first, then same amount + direction within ±1 day. Each txn matches at most one row.
export function matchRows(rows: StmtRow[], txns: MatchableTxn[]): (number | null)[] {
  const used = new Set<number>();
  const result: (number | null)[] = rows.map((row) => {
    const t = row.ref ? txns.find((t) => !used.has(t.id) && t.refs.includes(row.ref!)) : undefined;
    if (t) used.add(t.id);
    return t?.id ?? null;
  });
  const dayDiff = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 864e5;
  rows.forEach((row, i) => {
    if (result[i] !== null) return;
    const t = txns.find((t) => !used.has(t.id) && t.amount === row.amount && t.direction === row.direction && dayDiff(t.date, row.date) <= 1);
    if (t) { used.add(t.id); result[i] = t.id; }
  });
  return result;
}
