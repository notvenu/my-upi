// Reads a shop bill from OCR text: shop name, date, total and the item lines. Pure; checked by check.ts.
// ponytail: line heuristics for printed Indian bills (item … price per line, a TOTAL line); fix by hand when OCR garbles a line.
import { parseDate } from './statement.ts'; // .ts so the node checks can run it too
import { CATEGORIES } from './upi.ts';
import { ME } from './calc.ts';

// category, place, method, note and who each item is for only come from Gemini; the OCR reader leaves them out
export type Receipt = {
  shop: string; date: string | null; total: number; items: { name: string; amount: number; for?: string[] }[];
  category?: string; place?: string; method?: 'upi' | 'cash' | 'card' | 'bank'; note?: string; with?: string[];
};
const METHODS = ['upi', 'cash', 'card', 'bank'] as const;

// The JSON Gemini fills for a bill photo or a typed note (api/bill/route.ts). Rupees here; fromGemini turns them into paise.
export const BILL_SCHEMA = {
  type: 'OBJECT',
  properties: {
    shop: { type: 'STRING', description: 'Shop or restaurant name as printed at the top' },
    place: { type: 'STRING', description: 'Area and city of the shop, e.g. "Koramangala, Bengaluru"; empty if not printed' },
    date: { type: 'STRING', nullable: true, description: 'Bill date as YYYY-MM-DD, null if not printed' },
    total: { type: 'NUMBER', description: 'Final amount paid in rupees (grand total after tax, discount and round-off)' },
    category: { type: 'STRING', enum: [...CATEGORIES] },
    items: {
      type: 'ARRAY',
      description: 'Every purchased line item; not subtotals, taxes, discounts or payment lines',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          amount: { type: 'NUMBER', description: 'Line amount in rupees (qty × rate)' },
          for: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Who this item is for: "me", "all", or people or group names as written (e.g. "roommates"). Empty if not said' },
        },
        required: ['name', 'amount'],
      },
    },
    method: { type: 'STRING', enum: [...METHODS], nullable: true, description: 'How it was paid, only if stated' },
    note: { type: 'STRING', description: 'A short reason or occasion if one is given, e.g. "Dinner with Ravi"; else empty' },
    with: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Who the cost is shared with besides the writer: people or group names as written (e.g. "roommates", "Ravi"). Empty if not shared' },
  },
  required: ['shop', 'place', 'date', 'total', 'category', 'items', 'note', 'with'],
};

// Gemini's JSON → a Receipt, trusting nothing: bad numbers drop out, dates must parse, categories must be ours.
export function fromGemini(j: unknown): Receipt {
  const o = (j && typeof j === 'object' ? j : {}) as Record<string, unknown>;
  const str = (v: unknown, n = 40) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
  const rupees = (v: unknown) => (typeof v === 'number' && v > 0 && v < 1e8 ? Math.round(v * 100) : 0);
  const names = (v: unknown): string[] => (Array.isArray(v) ? v.filter((n) => typeof n === 'string' && n.trim()).map((n: string) => n.trim()) : []);
  const items = (Array.isArray(o.items) ? o.items : [])
    .map((it) => {
      const whom = names(it?.for);
      return { name: str(it?.name), amount: rupees(it?.amount), ...(whom.length ? { for: whom } : {}) };
    })
    .filter((it) => it.name && it.amount);
  const date = typeof o.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.date) && !isNaN(Date.parse(o.date)) ? o.date : null;
  const category = (CATEGORIES as readonly string[]).includes(o.category as string) ? (o.category as string) : undefined;
  const method = METHODS.find((m) => m === o.method);
  return { shop: str(o.shop), date, total: rupees(o.total), items, category, place: str(o.place, 80) || undefined, method, note: str(o.note, 120) || undefined,
    ...(names(o.with).length ? { with: names(o.with) } : {}) };
}

// A quick look at a typed note for the loader to show while Gemini reads it properly: "tomatoes 70, palak 20" → name + paise pairs.
// ponytail: just for show, a word or two before each number; Gemini's answer is what gets used.
export function peek(text: string): { name: string; amount: number }[] {
  return [...text.matchAll(/([a-z][a-z']*(?: [a-z][a-z']*)?)\s*[:=-]?\s*(?:₹|rs\.?\s*)?(\d+(?:\.\d{1,2})?)/gi)]
    .map((m) => ({ name: m[1].toLowerCase().replace(/^(and|then|now|also|plus|for|rs) /, ''), amount: Math.round(parseFloat(m[2]) * 100) }))
    .filter((p) => p.amount > 0 && !/^(rs|for|and|now)$/.test(p.name))
    .slice(0, 8);
}

// An item's "for" from Gemini → its who (ME and person ids; [] means everyone).
// Names match a saved person's full or first name, or a group's name ("roommates" = you plus its members), forgiving typos
// and spacing ("room mates", "roomates", "prya"); exact matches win over near ones. Unknown names drop out.
export function whoFor(names: string[] = [], people: { id: number; name: string }[], groups: { name: string; memberIds: number[] }[] = []): number[] {
  if (!names.length || names.some((n) => /^(all|everyone|everybody|rest)$/i.test(n))) return [];
  const ids = names.flatMap((n) => {
    if (/^(me|myself|i)$/i.test(n)) return [ME];
    for (const near of [false, true]) {
      const g = groups.find((g) => like(n, g.name, near));
      if (g) return [ME, ...g.memberIds];
      const p = people.find((p) => like(n, p.name, near) || like(n, p.name.split(' ')[0], near));
      if (p) return [p.id];
    }
    return [];
  });
  return [...new Set(ids)];
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/s$/, ''); // "Room mates" → "roommate"
// near: allow one typo in a short name, two in a long one
function like(a: string, b: string, near: boolean) {
  const x = squash(a), y = squash(b);
  if (x === y) return !!x;
  if (!near || Math.min(x.length, y.length) < 4) return false;
  let prev = [...Array(y.length + 1).keys()]; // edit distance, row by row
  for (let i = 1; i <= x.length; i++) {
    const row = [i];
    for (let j = 1; j <= y.length; j++) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    prev = row;
  }
  return prev[y.length] <= (Math.min(x.length, y.length) > 6 ? 2 : 1);
}

// an amount at the end of a line: 1,234.50 · 120.00 · 120 (OCR often drops the decimal point's zeros, never the digits)
const AMOUNT_END = /(?:₹|rs\.?|inr)?\s*(\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)\s*[-/]?\s*$/i;
const TOTAL = /\b(grand\s*total|net\s*(amount|payable|total)|total\s*(amount|payable|due)|amount\s*(payable|due)|bill\s*amount|to\s*pay|total)\b/i;
const NOT_ITEM = /\b(sub\s*total|total|tax|gst|cgst|sgst|igst|vat|cess|discount|round(ing)?\s*off|round|change|tender|cash|card|upi|paid|balance|saving|you\s*saved|qty|quantity|mrp|rate|amount|invoice|bill\s*no|table|items?\s*:|phone|ph\.?|tel|gstin|fssai|thank)\b/i;
const HEADER_JUNK = /\b(tax\s*invoice|invoice|receipt|bill|gstin|fssai|phone|ph\b|tel|mob|date|time|cashier|order|table|token|www\.|\.com)\b|\d{6,}/i;

const paise = (s: string) => Math.round(parseFloat(s.replace(/,/g, '')) * 100);
const titleCase = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

export function parseReceipt(text: string): Receipt {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);

  // the shop: the first line that reads like a name, before any item or total
  const shopLine = lines.slice(0, 6).find((l) => /[a-z]{3}/i.test(l) && !HEADER_JUNK.test(l) && !AMOUNT_END.test(l));
  const shop = shopLine ? titleCase(shopLine.replace(/[^a-z0-9&'. -]/gi, '').trim()).slice(0, 40) : '';

  let date: string | null = null;
  for (const l of lines) {
    const m = l.match(/\b(\d{1,2}[\/\-. ](?:\d{1,2}|[a-z]{3,9})[\/\-. ,]+\d{2,4})\b/i);
    if (m && (date = parseDate(m[1]))) break;
  }

  // the total: the last "total"-like line that isn't a subtotal (grand total wins), else the largest amount on the bill
  let total = 0, totalAt = lines.length;
  lines.forEach((l, i) => {
    const m = l.match(AMOUNT_END);
    if (!m || !TOTAL.test(l) || /sub\s*total/i.test(l)) return;
    if (!total || /grand|net|payable/i.test(l) || i > totalAt) { total = paise(m[1]); totalAt = i; }
  });
  if (!total) total = Math.max(0, ...lines.map((l) => l.match(AMOUNT_END)).filter(Boolean).map((m) => paise(m![1])));

  // items: lines before the total that end in a price and carry a name; qty/rate columns before the price are dropped
  const items: Receipt['items'] = [];
  lines.slice(0, totalAt).forEach((l, i) => {
    if (l === shopLine || NOT_ITEM.test(l) || HEADER_JUNK.test(l) || /\d{1,2}:\d{2}/.test(l)) return; // header lines and times aren't items
    const m = l.match(AMOUNT_END);
    if (!m || i === 0) return;
    const name = l.slice(0, m.index).replace(/(\s+[x×@*]?\s*\d+(\.\d+)?)+\s*[x×@*]?\s*$/i, '').replace(/^[\d.)\s-]+/, '').replace(/[^a-z0-9&()'./ -]/gi, '').trim();
    const amount = paise(m[1]);
    if (/[a-z]{2}/i.test(name) && amount > 0 && amount <= (total || Infinity)) items.push({ name: titleCase(name).slice(0, 40), amount });
  });

  return { shop, date, total, items };
}
