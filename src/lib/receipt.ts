// Reads a shop bill from OCR text: shop name, date, total and the item lines. Pure; checked by check.ts.
// ponytail: line heuristics for printed Indian bills (item … price per line, a TOTAL line); fix by hand when OCR garbles a line.
import { parseDate } from './statement.ts'; // .ts so the node checks can run it too

export type Receipt = { shop: string; date: string | null; total: number; items: { name: string; amount: number }[] };

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
