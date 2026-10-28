// Logic self-check: `npm run check`
import assert from 'node:assert/strict';
import { cleanAmount, parseUpiQr, personQr, simplePayUri, requestMessage, requestReason, rupees, whenLabel } from './upi.ts';
import { matchRows, parseDate, parseStatement } from './statement.ts';

const qr = parseUpiQr('upi://pay?pa=cafe.coffee@okaxis&pn=Cafe%20Coffee&mc=5812&tr=ABC1')!;
assert.equal(qr.vpa, 'cafe.coffee@okaxis');
assert.equal(qr.name, 'Cafe Coffee');
assert.equal(parseUpiQr('https://example.com'), null);

assert.equal(personQr('rahul@okaxis', 'Rahul S').raw, 'upi://pay?pa=rahul@okaxis&pn=Rahul%20S');
assert.equal(simplePayUri('me@ok', 'Me', 650, 'Dinner, DMart'), 'upi://pay?pa=me@ok&pn=Me&am=650.00&cu=INR&tn=Dinner%2C%20DMart');


assert.equal(requestReason(['Dinner', 'dinner ', 'Groceries']), 'Dinner, dinner, Groceries');
assert.equal(requestReason(['Dinner', 'Dinner', '']), 'Dinner');
assert.equal(requestReason([]), 'Split');
const long = requestReason(['Electricity bill October', 'Wifi recharge for the flat', 'Maid salary', 'Gas']);
assert.equal(long, 'Electricity bill October +3');
assert.equal(requestReason(['x'.repeat(80)]), 'x'.repeat(50));
assert.equal(requestReason(['x'.repeat(80), 'Gas']), 'x'.repeat(46) + ' +1');
assert.equal(cleanAmount('1.2.3'), '1.23');
assert.equal(cleanAmount('12.345'), '12.34');
assert.equal(cleanAmount('007'), '7');
assert.equal(cleanAmount('.5'), '0.5');
assert.equal(cleanAmount('₹1,250'), '1250');
assert.equal(cleanAmount('123456789'), '1234567');
assert.equal(cleanAmount(''), '');

assert.equal(whenLabel('2026-10-03T20:42:00'), 'Sat, 03 Oct 2026 · 8:42 PM');
assert.equal(whenLabel('2026-10-04T00:05:00'), 'Sun, 04 Oct 2026 · 12:05 AM');
assert.equal(rupees(25050), '₹250.50');
const msg = requestMessage('Rahul Sharma', [
  { created_at: '2026-10-03T20:42:00', note: 'Dinner', payee_name: 'Cafe Coffee', amount: 25000, txn_amount: 100000 },
  { created_at: '2026-10-12T09:10:00', note: null, payee_name: 'DMart', amount: 40000, txn_amount: 40000 },
], 'me@okaxis');
assert.equal(msg, [
  'Hi Rahul 👋',
  "Here's what's pending from our splits (2 items):",
  '',
  '1. Sat, 03 Oct 2026 · 8:42 PM',
  '   Dinner — *₹250* (your share of ₹1,000)',
  '   paid to Cafe Coffee',
  '2. Mon, 12 Oct 2026 · 9:10 AM',
  '   DMart — *₹400*',
  '',
  '*Total: ₹650*',
  'Pay to UPI ID: me@okaxis',
  'Note for the payment: Dinner, DMart',
].join('\n'));

assert.match(requestMessage('Rahul', [{ created_at: '2026-10-03T20:42:00', note: 'Cab', payee_name: null, amount: 500, txn_amount: 1000 }], 'me@ok', 'our Goa trip splits'),
  /pending from our Goa trip splits \(1 item\)/);
assert.match(requestMessage('Rahul', [{ created_at: '2026-10-03T20:42:00', note: 'Cab', payee_name: null, amount: 500, txn_amount: 1000 }], 'me@ok', 'our Goa trip splits', 'Goa trip'),
  /Note for the payment: Goa trip$/);

assert.equal(parseDate('05/10/2026'), '2026-10-05');
assert.equal(parseDate('5-Oct-26'), '2026-10-05');
assert.equal(parseDate('05 Oct 2026'), '2026-10-05');
assert.equal(parseDate('2026-10-05'), '2026-10-05');
assert.equal(parseDate('Opening balance'), null);

// HDFC-style: separate withdrawal/deposit columns, junk rows above the header
const rows = parseStatement([
  ['HDFC BANK'], ['Statement of account'],
  ['Date', 'Narration', 'Chq./Ref.No.', 'Value Dt', 'Withdrawal Amt.', 'Deposit Amt.', 'Closing Balance'],
  ['05/10/26', 'UPI-CAFE COFFEE-cafe.coffee@okaxis-UTIB0-612345678901-coffee', '0000612345678901', '05/10/26', '120.00', '', '9,880.00'],
  ['06/10/26', 'UPI-RAHUL-rahul@ybl-SBIN-698765432109-split', '0000698765432109', '06/10/26', '', '1,250.50', '11,130.50'],
  ['07/10/26', 'POS SWIGGY', '', '07/10/26', '300.00', '', '10,830.50'],
  ['', '', '', '', '', '', ''],
]);
assert.equal(rows.length, 3);
assert.deepEqual([rows[0].amount, rows[0].direction, rows[0].ref, rows[0].vpa], [12000, 'debit', '612345678901', 'cafe.coffee@okaxis']);
assert.deepEqual([rows[1].amount, rows[1].direction], [125050, 'credit']);

// single amount column + Dr/Cr column (SBI/ICICI-style)
const single = parseStatement([
  ['Txn Date', 'Description', 'Amount', 'Dr/Cr'],
  ['01-Oct-2026', 'UPI/DR/611111111111/X', '50', 'DR'],
  ['01-Oct-2026', 'UPI/CR/622222222222/Y', '75', 'CR'],
]);
assert.deepEqual(single.map((r) => r.direction), ['debit', 'credit']);

const m = matchRows(rows, [
  { id: 1, amount: 30000, direction: 'debit', date: '2026-10-08', refs: [] }, // ±1 day amount match
  { id: 2, amount: 12000, direction: 'debit', date: '2026-10-01', refs: ['612345678901'] }, // ref match beats date
]);
assert.deepEqual(m, [2, null, 1]);

console.log('all checks passed');

// request scopes: months, last 7 days, trips, one payment
import { inScope, scopesFor } from './scope.ts';
const today = new Date(2026, 9, 28);
const owed = [
  { txn_id: 1, created_at: '2026-09-25T10:00:00', trip: null, amount: 100 },
  { txn_id: 2, created_at: '2026-10-05T10:00:00', trip: 'Goa trip', amount: 200 },
  { txn_id: 3, created_at: '2026-10-06T10:00:00', trip: 'Goa trip', amount: 300 },
  { txn_id: 4, created_at: '2026-10-27T10:00:00', trip: null, amount: 400 },
];
const sc = scopesFor(owed, today, 4);
assert.deepEqual(sc.map((s) => s.key), ['all', 'x:4', 'w', 'm:2026-10', 'm:2026-09', 't:Goa trip']);
assert.deepEqual(sc.map((s) => s.total), [1000, 400, 400, 900, 100, 500]);
assert.equal(sc.find((s) => s.key === 'm:2026-09')!.label, 'September');
assert.equal(inScope('w', owed[2], today), false);
assert.equal(scopesFor([owed[3]], today).length, 1); // a lone item: "All" is the only useful scope
console.log('scope checks passed');

// ── item splits, autopay dates, subscription spotting, statement methods ──
import { itemShares, ME, nextDue, findRecurring } from './calc.ts';
import { methodFromDesc } from './statement.ts';
// ₹300 veggies with Rahul(1) and Asha(2): tomatoes ₹90 for all, paneer ₹100 just Rahul, onions ₹50 just me, ₹60 not itemised
const sh = itemShares(30000, [1, 2], [{ amount: 9000, who: [ME, 1, 2] }, { amount: 10000, who: [1] }, { amount: 5000, who: [ME] }]);
assert.equal(sh.get(1), 3000 + 10000 + 2000);
assert.equal(sh.get(2), 3000 + 2000);
assert.equal(itemShares(10000, [1, 2], []).get(1), 3333);
assert.equal(itemShares(9000, [1, 2], [{ amount: 9000, who: [] }]).get(2), 3000); // no one picked = everyone // nothing itemised: equal thirds, rounding stays with you
assert.equal(itemShares(10000, [1], [{ amount: 10000, who: [1, 7] }]).get(1), 10000); // unpicked people don't count
assert.equal(nextDue('2026-01-31', 'month', 31), '2026-02-28');
assert.equal(nextDue('2026-02-28', 'month', 31), '2026-03-31'); // no drift after a short month
assert.equal(nextDue('2026-12-15', 'month', 15), '2027-01-15');
assert.equal(nextDue('2026-10-28', 'week', 28), '2026-11-04');
assert.equal(nextDue('2028-02-29', 'year', 29), '2029-02-28');
const seen = (key: string, amount: number, date: string, note = '') => ({ key, name: key, amount, date, category: 'Bills', note });
const rec = findRecurring([
  seen('netflix', 19900, '2026-08-05'), seen('netflix', 19900, '2026-09-05'), seen('netflix', 19900, '2026-10-05'),
  seen('tea', 2000, '2026-09-01'), seen('tea', 2000, '2026-09-02'), seen('tea', 2000, '2026-10-01'),
  seen('gym', 150000, '2026-05-01'), seen('gym', 150000, '2026-06-01'), // stopped
  seen('sip', 500000, '2026-10-10', 'NACH DR ICICI MF'),
], '2026-10-28');
assert.deepEqual(rec.map((r) => r.key), ['netflix', 'sip']);
assert.equal(methodFromDesc('UPI-RAVI-ravi@ybl-123', 'ravi@ybl'), 'upi');
assert.equal(methodFromDesc('POS 4321 DMART'), 'card');
assert.equal(methodFromDesc('NACH DR ICICI MF'), 'bank');
assert.equal(methodFromDesc('CASH DEP'), null);
console.log('split and autopay checks passed');

// ── split links and paying back ──
import { buildShare } from './share.ts';
import { settleFromCredits } from './calc.ts';
const T = (id: number, amount: number, created_at: string, note: string, extra: object = {}) =>
  ({ id, amount, created_at, note, status: 'SUCCESS', payee_name: null, subcategory: null, category: 'Other', trip: null, ...extra }) as never;
const S = (id: number, txn_id: number, person_id: number, amount: number, paid = false) =>
  ({ id, txn_id, person_id, name: '', phone: null, amount, requested_at: null, paid_at: paid ? 'x' : null }) as never;
const room = buildShare({ title: 'Room', personIds: [1, 2], trip: null }, {
  people: [{ id: 1, name: 'Rahul' }, { id: 2, name: 'Priya' }, { id: 3, name: 'Arjun' }],
  txns: [
    T(10, 30000, '2026-11-02T10:00:00', 'Rent share'), // all three of us equally
    T(11, 30000, '2026-11-05T10:00:00', 'Veggies', { items: [{ name: 'Paneer', amount: 10000, who: [1] }, { name: 'Tomatoes', amount: 9000, who: [] }] }),
    T(12, 20000, '2026-11-06T10:00:00', 'Movie'), // Rahul only
    T(13, 6000, '2026-10-20T10:00:00', 'Milk'), // last month, Priya hasn't paid
  ],
  splits: [S(1, 10, 1, 10000), S(2, 10, 2, 10000, true), S(3, 11, 1, 16666), S(4, 11, 2, 6666), S(5, 12, 1, 10000), S(6, 13, 2, 3000), S(7, 13, 1, 3000, true)],
}, { name: 'Me', vpa: 'me@ok' }, '2026-11-20T09:00:00');
assert.deepEqual(room.shared.map((l) => [l.what, l.total, l.each, l.paidBy]), [['Rent share', 30000, 10000, [2]], ['Veggies', 20000, 6666, []]]);
assert.deepEqual(room.people[0].own.map((l) => [l.what, l.amount]), [['Paneer · Veggies', 10000], ['Movie', 10000]]);
assert.deepEqual(room.people[1].carried, [{ month: '2026-10', amount: 3000 }]); // unpaid October moves into November
assert.equal(room.people[1].due, 6666 + 3000);
assert.equal(room.people[0].due, 10000 + 16666 + 10000);
const owing = [{ id: 1, name: 'Rahul Sharma', vpa: 'rahul@okaxis', unpaid: [{ id: 1, amount: 10000, month: '2026-10' }, { id: 2, amount: 5000, month: '2026-11' }] },
  { id: 2, name: 'Priya', vpa: null, unpaid: [{ id: 3, amount: 4000, month: '2026-11' }, { id: 4, amount: 2000, month: '2026-11' }] }];
assert.deepEqual(settleFromCredits([{ amount: 15000, desc: 'UPI-RAHUL SHARMA-rahul@okaxis', vpa: 'rahul@okaxis' }], owing), [1, 2]); // all of it
assert.deepEqual(settleFromCredits([{ amount: 10000, desc: 'from rahul@okaxis', vpa: 'rahul@okaxis' }], owing), [1]); // one month
assert.deepEqual(settleFromCredits([{ amount: 2000, desc: 'IMPS PRIYA NAIR' }], owing), [4]); // one split
assert.deepEqual(settleFromCredits([{ amount: 999, desc: 'IMPS PRIYA NAIR' }], owing), []); // part payment: stays unpaid
assert.deepEqual(settleFromCredits([{ amount: 6000, desc: 'NEFT PRIYANKA' }], owing), []); // not Priya
console.log('share and settle checks passed');

// ── reading a bill photo's OCR text ──
import { parseReceipt } from './receipt.ts';
const grocery = parseReceipt(`
SRI BALAJI SUPERMARKET
#12, 5th Cross, Koramangala
GSTIN 29ABCDE1234F1Z5
Tax Invoice   Bill No: 4471
Date: 26/10/2026  19:42
Item            Qty  Rate   Amount
Tomato 1kg       1   45.00   45.00
Paneer 200g      2   90.00  180.00
Amul Milk 1L     2   34.00   68.00
Onion            1   38.00   38.00
Sub Total                   331.00
CGST 2.5%                     4.14
SGST 2.5%                     4.14
Round Off                     0.72
Grand Total               ₹ 340.00
UPI                         340.00
Thank you, visit again`);
assert.equal(grocery.shop, 'Sri Balaji Supermarket');
assert.equal(grocery.date, '2026-10-26');
assert.equal(grocery.total, 34000);
assert.deepEqual(grocery.items, [
  { name: 'Tomato 1kg', amount: 4500 }, { name: 'Paneer 200g', amount: 18000 }, { name: 'Amul Milk 1l', amount: 6800 }, { name: 'Onion', amount: 3800 },
]);
const cafe = parseReceipt('Third Wave Coffee\nCappuccino 220\nCroissant 180\nTOTAL 400');
assert.deepEqual([cafe.shop, cafe.total, cafe.items.length], ['Third Wave Coffee', 40000, 2]);
assert.equal(parseReceipt('blurry\n\n12.50\n99.00').total, 9900); // no total line: the largest amount
console.log('bill checks passed');
