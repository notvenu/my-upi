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
// UPI app statements (PhonePe, super.money) write the month first: Oct 05, 2026.
export function parseDate(s: string): string | null {
  s = s.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = s.match(/^([A-Za-z]{3,9})\.? (\d{1,2}),? (\d{4})/);
  if (m) {
    const mon = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1;
    return mon && +m[2] >= 1 && +m[2] <= 31 ? `${m[3]}-${pad(mon)}-${pad(+m[2])}` : null;
  }
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

const isHeader = (r: string[]) => {
  const h = r.map((c) => String(c).toLowerCase());
  return h.some((c) => /date/.test(c)) && h.some((c) => /narration|description|particulars|remarks|details/.test(c))
    && h.some((c) => /debit|withdraw|credit|deposit|amount/.test(c));
};
// identical rows on the same day are distinct transactions, so they're numbered
function keyer() {
  const seen = new Map<string, number>();
  return (k: string) => { const n = (seen.get(k) ?? 0) + 1; seen.set(k, n); return n > 1 ? `${k}#${n}` : k; };
}
const UTR = /(?<!\d)\d{12}(?!\d)/;

// rows = sheet as a grid of strings. Finds the header row, then reads every dated row under it.
export function parseStatement(rows: string[][]): StmtRow[] {
  const hi = rows.slice(0, 60).findIndex(isHeader);
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
  const key = keyer();
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
    const ref = refDigits.length >= 12 ? refDigits.slice(-12) : desc.match(UTR)?.[0];
    const vpa = desc.match(/[\w.]+@[a-z]+/i)?.[0]; // no '-': HDFC uses it as the narration separator
    out.push({ date, amount, direction, desc, ref, vpa, key: key(`${date}|${direction}|${amount}|${ref ?? desc}`) });
  }
  return out;
}

// A PDF page as lines of positioned text runs (pdf.ts reads them).
export type Cell = { x: number; w: number; text: string };

// Bank PDFs are tables: each run goes under the header column nearest to it (empty cells have no run at all),
// and lines without a date (a wrapped narration, "UTR No. …") join the row above.
// UPI app PDFs (PhonePe, super.money) that don't line up as a table are read line by line instead.
export function parsePdfStatement(lines: Cell[][]): StmtRow[] {
  const hi = lines.findIndex((l) => isHeader(l.map((c) => c.text)));
  if (hi >= 0) {
    const head = lines[hi];
    const mid = (c: Cell) => c.x + c.w / 2;
    const col = (c: Cell) => head.reduce((best, h, i) => (Math.abs(mid(h) - mid(c)) < Math.abs(mid(head[best]) - mid(c)) ? i : best), 0);
    const textCols = head.map((h) => !/debit|credit|withdraw|deposit|amount|balance/i.test(h.text));
    const cDate = head.findIndex((h) => /date/i.test(h.text));
    const grid: string[][] = [head.map((h) => h.text)];
    for (const l of lines.slice(hi + 1)) {
      if (isHeader(l.map((c) => c.text))) continue; // repeated on every page
      const row = head.map(() => '');
      for (const c of l) { const i = col(c); row[i] = row[i] ? `${row[i]} ${c.text}` : c.text; }
      const prev = grid.length > 1 ? grid[grid.length - 1] : null;
      if (!parseDate(row[cDate] ?? '') && prev) row.forEach((v, i) => { if (v && textCols[i] && i !== cDate) prev[i] = `${prev[i]} ${v}`.trim(); });
      else grid.push(row);
    }
    const rows = parseStatement(grid);
    if (rows.length) return rows;
  }
  return parseTextStatement(lines.map((l) => l.map((c) => c.text).join(' ')));
}

// Line by line: a line starting with a date opens a payment; the lines after it (time, UTR, "Paid by …") belong to it.
// Amount: the one after ₹ / Rs / INR, else the last decimal number. Direction from DEBIT/CREDIT, Dr/Cr, a sign or "Paid to"/"Received from".
export function parseTextStatement(lines: string[]): StmtRow[] {
  const blocks: { date: string; first: string; rest: string[] }[] = [];
  for (const raw of lines) {
    const l = raw.replace(/\s+/g, ' ').trim();
    const m = l.match(/^((?:[A-Za-z]{3,9}\.? \d{1,2},? \d{4})|(?:\d{1,2}[\/\-. ](?:[A-Za-z]{3,9}|\d{1,2})[\/\-. ,]+\d{2,4})|(?:\d{4}-\d{2}-\d{2}))/);
    const date = m && parseDate(m[1]);
    if (date) blocks.push({ date, first: l.slice(m![1].length).trim(), rest: [] });
    else if (blocks.length && l) blocks[blocks.length - 1].rest.push(l);
  }
  const out: StmtRow[] = [];
  const key = keyer();
  for (const b of blocks) {
    const all = [b.first, ...b.rest].join(' ');
    const money = b.first.match(/(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d{1,2})?)/i) ?? all.match(/(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d{1,2})?)/i)
      ?? [...b.first.matchAll(/(?<![\w.])([\d,]+\.\d{2})(?![\d])/g)].at(-1);
    const amount = money ? parseAmount(money[1]) : 0;
    if (!amount) continue;
    const credit = /\b(credit|cr|received|refund|cashback)\b/i.test(all) || /\+\s*(?:₹|rs\.?|inr)?\s*[\d,]+/i.test(b.first);
    const debit = /\b(debit|dr|paid|sent)\b/i.test(b.first);
    const direction = credit && !debit ? 'credit' : 'debit';
    const desc = b.first
      .replace(/^\d{1,2}:\d{2}(\s*[ap]m)?\s*/i, '')
      .replace(/[-+]?\s*(?:₹|rs\.?|inr)\s*[\d,]+(?:\.\d{1,2})?/gi, '')
      .replace(/\b(debit|credit|dr|cr)\b/gi, '')
      .replace(/\s+/g, ' ').trim();
    const ref = all.match(/(?:utr|ref(?:erence)?|rrn)[^\d]{0,12}(\d{12})(?!\d)/i)?.[1] ?? all.match(UTR)?.[0];
    const vpa = all.match(/[\w.]+@[a-z]+/i)?.[0];
    out.push({ date: b.date, amount, direction, desc: desc || all.slice(0, 80), ref, vpa, key: key(`${b.date}|${direction}|${amount}|${ref ?? desc}`) });
  }
  return out;
}

const titleCase = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
const NOISE = /^(upi|dr|cr|p2a|p2m|pos|nach|ach|ecs|neft|imps|rtgs|mmt|ib|bil|onl|ecom|txn|to|by|from|transfer|payment|ref|no)$/i;
// Who a statement row was with: "Paid to Swiggy", "UPI-CAFE COFFEE-cafe@okaxis-…", "POS 4321 DMART", else the UPI ID's name.
export function payeeFromDesc(desc: string, vpa?: string): string {
  const said = desc.match(/\b(?:paid to|sent to|received from|money sent to|transfer(?:red)? to|payment to)\s+(.+?)(?=\s+(?:transaction|txn|utr|upi ref|ref|paid by|credited to|debited from)\b|$)/i);
  if (said) return said[1].trim().slice(0, 40);
  const word = desc.split(/[-/|:*]+|\s{2,}/).map((p) => p.trim())
    .map((p) => p.split(' ').filter((w) => !NOISE.test(w) && !/\d{3,}/.test(w) && !w.includes('@')).join(' '))
    .find((p) => /[a-z]{3}/i.test(p) && !/^[A-Z]{4}0/.test(p));
  if (word) return titleCase(word).slice(0, 40);
  return vpa ? vpa.split('@')[0] : desc.slice(0, 40);
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
