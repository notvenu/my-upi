// Logic self-check: `npm run check`
import assert from 'node:assert/strict';
import { cleanAmount, parseUpiQr, personQr, simplePayUri, appPage, requestMessage, requestReason, rupees, whenLabel } from './upi.ts';
import { matchRows, parseDate, parseStatement, statementCsv } from './statement.ts';

const qr = parseUpiQr('upi://pay?pa=cafe.coffee@okaxis&pn=Cafe%20Coffee&mc=5812&tr=ABC1')!;
assert.equal(qr.vpa, 'cafe.coffee@okaxis');
assert.equal(qr.name, 'Cafe Coffee');
assert.equal(parseUpiQr('https://example.com'), null);

assert.equal(personQr('rahul@okaxis', 'Rahul S').raw, 'upi://pay?pa=rahul@okaxis&pn=Rahul%20S');
assert.equal(simplePayUri('me@ok', 'Me', 650, 'Dinner, DMart'), 'upi://pay?pa=me@ok&pn=Me&am=650.00&cu=INR&tn=Dinner%2C%20DMart');
assert.equal(appPage('com.phonepe.app'), 'https://play.google.com/store/apps/details?id=com.phonepe.app'); // Open {app}: its Play Store page


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
// previous balance and part payments: listed, and the total nets them
const adj = requestMessage('Rahul', [{ created_at: '2026-10-03T20:42:00', note: 'Cab', payee_name: null, amount: 50000, txn_amount: 100000 }], 'me@ok', undefined, 'x', { opening: 40000, paid: 10000 });
assert.match(adj, /Previous balance — \*₹400\*/);
assert.match(adj, /Already paid — \*−₹100\*/);
assert.match(adj, /\*Total: ₹800\*/);
assert.match(requestMessage('Rahul', [], 'me@ok', undefined, 'x', { opening: 40000, paid: 0 }), /pending:\n\nPrevious balance — \*₹400\*\n\n\*Total: ₹400\*/);

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

// optional Category / Subcategory / Reason / Trip columns prefill review; unknown categories are dropped
const tagged = parseStatement([
  ['Date', 'Details', 'Ref No', 'Debit', 'Credit', 'Category', 'Subcategory', 'Reason', 'Trip'],
  ['2026-10-04', 'Paid to Mkr Fuels', '627753131764', '150.00', '', 'fuel', 'Petrol', 'bike', ''],
  ['2026-10-05', 'Paid to X', '', '10.00', '', 'Snacks', 'Tea', '', 'Goa'],
]);
assert.deepEqual([tagged[0].category, tagged[0].subcategory, tagged[0].note, tagged[0].trip], ['Fuel', 'Petrol', 'bike', undefined]);
assert.deepEqual([tagged[1].category, tagged[1].subcategory, tagged[1].trip], [undefined, undefined, 'Goa']);

// a downloaded statement imports back with the same amounts, sides, refs and labels; failed payments are left out
const base = { payee_vpa: null, bank_ref: null, subcategory: null, note: null, status: 'SUCCESS' };
const csv = statementCsv([
  { ...base, created_at: '2026-10-04T09:30:00', amount: 15000, direction: 'debit', payee_name: 'Mkr Fuels', bank_ref: '627753131764', category: 'Fuel', subcategory: 'Petrol', note: 'bike' },
  { ...base, created_at: '2026-10-05T18:00:00', amount: 70400, direction: 'credit', payee_name: 'Uday', category: 'Transfer' },
  { ...base, created_at: '2026-10-06T10:00:00', amount: 5000, direction: 'debit', payee_name: 'X', category: 'Other', status: 'FAILURE' },
]);
assert.match(csv, /\r\n04 Oct 2026,09:30,Paid to Mkr Fuels,/);
const back = parseStatement(csv.replace(/^﻿/, '').trim().split('\r\n').map((l) => l.split(',')));
assert.deepEqual(back.map((r) => [r.date, r.amount, r.direction, r.ref, r.category, r.subcategory, r.note]),
  [['2026-10-04', 15000, 'debit', '627753131764', 'Fuel', 'Petrol', 'bike'], ['2026-10-05', 70400, 'credit', undefined, 'Transfer', undefined, undefined]]);
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
import { allocate, itemShares, ME, nextDue, findRecurring, rematch } from './calc.ts';
// part payments: previous balance first, then whole splits oldest first, the rest waits as credit
const owes = [{ id: 1, amount: 30000 }, { id: 2, amount: 20000 }];
assert.deepEqual(allocate(50000, 40000, 0, owes), { opening: 0, paid: [], credit: 10000 }); // ₹500 of ₹400 old + ₹300 split: old cleared, ₹100 toward the split
assert.deepEqual(allocate(25000, 0, 10000, owes), { opening: 0, paid: [1], credit: 5000 }); // that ₹100 + ₹250 clears the ₹300 split, ₹50 left
assert.deepEqual(allocate(10000, 40000, 0, owes), { opening: 30000, paid: [], credit: 0 }); // only part of the old balance
assert.deepEqual(allocate(60000, 0, 0, owes), { opening: 0, paid: [1, 2], credit: 10000 }); // paid ahead
// exactly one split's amount pays that split, even with older ones or an old balance waiting
const rent = [{ id: 1, amount: 1500 }, { id: 2, amount: 2500 }, { id: 3, amount: 400000 }];
assert.deepEqual(allocate(400000, 10000, 500, rent), { opening: 10000, paid: [3], credit: 500 });
assert.deepEqual(allocate(4000, 0, 0, rent), { opening: 0, paid: [1, 2], credit: 0 }); // no exact match: oldest first
// fixing an old repayment: ₹4,000 had cleared ₹15 + ₹25 + ... ; the ₹4,000 rent is paid instead, they go back to unpaid
assert.deepEqual(rematch(400000, [{ id: 1, amount: 1500 }, { id: 2, amount: 2500 }], [{ id: 3, amount: 400000 }]), { pay: 3, unpay: [1, 2], back: 396000 });
assert.equal(rematch(400000, [{ id: 3, amount: 400000 }], [{ id: 9, amount: 400000 }]), null); // already right
assert.equal(rematch(400000, [{ id: 1, amount: 1500 }], [{ id: 2, amount: 2500 }]), null); // nothing matches
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
import { buildShare, ledger } from './share.ts';
import { settleFromCredits } from './calc.ts';
const T = (id: number, amount: number, created_at: string, note: string, extra: object = {}) =>
  ({ id, amount, created_at, note, status: 'SUCCESS', payee_name: null, subcategory: null, category: 'Other', trip: null, ...extra }) as never;
const S = (id: number, txn_id: number, person_id: number, amount: number, paid = false) =>
  ({ id, txn_id, person_id, name: '', phone: null, amount, requested_at: null, paid_at: paid ? 'x' : null }) as never;
const roomData = {
  people: [{ id: 1, name: 'Rahul' }, { id: 2, name: 'Priya' }, { id: 3, name: 'Arjun' }],
  txns: [
    T(10, 30000, '2026-11-02T10:00:00', 'Rent share'), // all three of us equally
    T(11, 30000, '2026-11-05T10:00:00', 'Veggies', { items: [{ name: 'Paneer', amount: 10000, who: [1] }, { name: 'Tomatoes', amount: 9000, who: [] }] }),
    T(12, 20000, '2026-11-06T10:00:00', 'Movie'), // Rahul only
    T(13, 6000, '2026-10-20T10:00:00', 'Milk'), // last month, Priya hasn't paid
  ],
  splits: [S(1, 10, 1, 10000), S(2, 10, 2, 10000, true), S(3, 11, 1, 16666), S(4, 11, 2, 6666), S(5, 12, 1, 10000), S(6, 13, 2, 3000), S(7, 13, 1, 3000, true)],
};
const room = buildShare({ title: 'Room', personIds: [1, 2], trip: null }, roomData, { name: 'Me', vpa: 'me@ok' }, '2026-11-20T09:00:00');
// the same payments as a trip: trip links keep the per-payment history, room links get the month sheet instead
const goa = buildShare({ title: 'Goa', personIds: [1, 2], trip: 'Goa' },
  { ...roomData, txns: roomData.txns.map((t: object) => ({ ...t, trip: 'Goa' }) as never) }, { name: 'Me', vpa: 'me@ok' }, '2026-11-20T09:00:00');
assert.equal(room.people[0].history, undefined);
assert.deepEqual(room.people[0].ledger!.map((m) => m.month), ['2026-11']); // his October milk is paid, so October isn't shown
// tapping an item: the whole bill, who paid it, and everyone's share (Rahul marked as the one viewing; you paid the rest)
const veg = room.people[0].ledger![0].items.find((x) => x.what === 'Veggies')!.detail!;
assert.deepEqual([veg.total, veg.paidBy, veg.shares], [30000, 'Me', [{ name: 'Me', amount: 30000 - 16666 - 6666 }, { name: 'Rahul', amount: 16666, them: true }, { name: 'Priya', amount: 6666 }]]);
assert.deepEqual(veg.items, [{ name: 'Paneer', amount: 10000, who: ['Rahul'] }, { name: 'Tomatoes', amount: 9000, who: ['Everyone'] }]);
assert.deepEqual(room.shared.map((l) => [l.what, l.total, l.each, l.paidBy]), [['Rent share', 30000, 10000, [2]], ['Veggies', 20000, 6666, []]]);
assert.deepEqual(room.people[0].own.map((l) => [l.what, l.amount]), [['Paneer · Veggies', 10000], ['Movie', 10000]]);
assert.deepEqual(room.people[1].carried, [{ month: '2026-10', amount: 3000 }]); // unpaid October moves into November
assert.equal(room.people[1].due, 6666 + 3000);
assert.equal(room.people[0].due, 10000 + 16666 + 10000);
// each person's history: newest first, only what's unpaid (Rahul's milk is paid), who else was in it, items with who had them
assert.deepEqual(goa.people[0].history!.map((h) => [h.date, h.what, h.share, h.with]), [
  ['2026-11-06', 'Movie', 10000, ['Me']],
  ['2026-11-05', 'Veggies', 16666, ['Me', 'Priya']],
  ['2026-11-02', 'Rent share', 10000, ['Me', 'Priya']],
]);
assert.deepEqual(goa.people[0].history![1].items, [{ name: 'Paneer', amount: 10000, who: ['Rahul'] }, { name: 'Tomatoes', amount: 9000, who: ['Everyone'] }]);
assert.equal(goa.people[1].history!.length, 2); // Priya: veggies, milk (her rent share is paid)
// the month sheet lists only what's unpaid: September's curd and October's paneer are paid, so they're gone;
// the ₹10 part credit comes off at the end, so the last balance is what they owe
const P = (id: number, txn: number, amount: number, paid_at: string | null) => ({ ...(S(id, txn, 4, amount) as object), paid_at }) as never;
const sheetData = {
  people: [], txns: [T(20, 4000, '2026-09-05T10:00:00', 'Curd'), T(21, 6000, '2026-10-03T10:00:00', 'Paneer'), T(22, 2000, '2026-10-15T10:00:00', 'Milk'),
    T(23, 9000, '2026-11-02T10:00:00', 'Rent')],
  splits: [P(20, 20, 2000, '2026-10-10T10:00:00'), P(21, 21, 3000, '2026-10-25T10:00:00'), P(22, 22, 1000, null), P(23, 23, 4500, null)],
};
const sheet = ledger({ id: 4, name: 'Ravi', opening: 500, credit: 1000 }, sheetData, '2026-11-20T09:00:00');
assert.equal(sheet[0].items[0].category, 'Other'); // each item carries its category, for the link's category view
assert.deepEqual(sheet.map((m) => [m.month, m.items.map((x) => x.what), m.total, m.old, m.paid.map((x) => [x.what, x.amount]), m.balance]), [
  ['2026-10', ['Milk'], 1000, 500, [], 1500],
  ['2026-11', ['Rent'], 4500, 1500, [['Paid in part', 1000]], 5000],
]);
// nothing unpaid but an old balance: one card for this month
assert.deepEqual(ledger({ id: 4, name: 'Ravi', opening: 700 }, { people: [], txns: [], splits: [] }, '2026-11-20T09:00:00').map((m) => [m.month, m.old, m.balance]), [['2026-11', 700, 700]]);
assert.deepEqual(ledger({ id: 4, name: 'Ravi' }, { people: [], txns: [], splits: [] }, '2026-11-20T09:00:00'), []); // all paid up
// a link set to show payments only up to 31 Oct: November's rent isn't on it, and the link reads as October
const upTo = buildShare({ title: 'Room', personIds: [4], trip: null, until: '2026-10-31' }, { ...sheetData, people: [{ id: 4, name: 'Ravi' }] },
  { name: 'Me', vpa: 'me@ok' }, '2026-11-20T09:00:00');
assert.deepEqual([upTo.month, upTo.until, upTo.people[0].due, upTo.people[0].ledger!.map((m) => m.month)], ['2026-10', '2026-10-31', 1000, ['2026-10']]);
// a previous balance adds to what's due, a part payment comes off it
const withOld = buildShare({ title: 'Room', personIds: [2], trip: null }, {
  people: [{ id: 2, name: 'Priya', opening: 50000, credit: 2000 }], txns: [T(13, 6000, '2026-10-20T10:00:00', 'Milk')], splits: [S(6, 13, 2, 3000)],
}, { name: 'Me', vpa: 'me@ok' }, '2026-11-20T09:00:00');
assert.deepEqual([withOld.people[0].due, withOld.people[0].opening, withOld.people[0].partPaid], [3000 + 50000 - 2000, 50000, 2000]);
const owing = [{ id: 1, name: 'Rahul Sharma', vpa: 'rahul@okaxis', unpaid: [{ id: 1, amount: 10000, month: '2026-10' }, { id: 2, amount: 5000, month: '2026-11' }] },
  { id: 2, name: 'Priya', vpa: null, unpaid: [{ id: 3, amount: 4000, month: '2026-11' }, { id: 4, amount: 2000, month: '2026-11' }] }];
assert.deepEqual(settleFromCredits([{ amount: 15000, desc: 'UPI-RAHUL SHARMA-rahul@okaxis', vpa: 'rahul@okaxis' }], owing), [1, 2]); // all of it
assert.deepEqual(settleFromCredits([{ amount: 10000, desc: 'from rahul@okaxis', vpa: 'rahul@okaxis' }], owing), [1]); // one month
assert.deepEqual(settleFromCredits([{ amount: 2000, desc: 'IMPS PRIYA NAIR' }], owing), [4]); // one split
assert.deepEqual(settleFromCredits([{ amount: 999, desc: 'IMPS PRIYA NAIR' }], owing), []); // part payment: stays unpaid
assert.deepEqual(settleFromCredits([{ amount: 6000, desc: 'NEFT PRIYANKA' }], owing), []); // not Priya
console.log('share and settle checks passed');

// ── reading a bill photo's OCR text ──
import { fromGemini, parseReceipt, peek, whoFor } from './receipt.ts';
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
const gem = fromGemini({ shop: 'Cafe Noir', place: '', date: '2026-10-26', total: 340.5, category: 'Food',
  items: [{ name: 'Latte', amount: 180 }, { name: '', amount: 10 }, { name: 'Tip', amount: -5 }] });
assert.deepEqual(gem, { shop: 'Cafe Noir', date: '2026-10-26', total: 34050, items: [{ name: 'Latte', amount: 18000 }], category: 'Food', place: undefined, method: undefined, note: undefined });
assert.deepEqual(fromGemini({ date: '26/10/2026', category: 'Bribes', total: '9' }), { shop: '', date: null, total: 0, items: [], category: undefined, place: undefined, method: undefined, note: undefined });
const note = fromGemini({ shop: '', total: 150, items: [{ name: 'Palak', amount: 20, for: ['me'] }, { name: 'Tomatoes', amount: 70, for: ['all'] }], method: 'cash', note: 'Veggies' });
assert.deepEqual([note.method, note.note, note.items[0].for], ['cash', 'Veggies', ['me']]);
const folks = [{ id: 3, name: 'Priya Nair' }, { id: 5, name: 'Ravi' }];
assert.deepEqual(whoFor(['me'], folks), [0]);
assert.deepEqual(whoFor(['priya', 'Me', 'Ghost'], folks), [3, 0]); // first name works, unknown names drop
assert.deepEqual(whoFor(['all'], folks), []);
assert.deepEqual(whoFor(undefined, folks), []);
const flat = [{ name: 'Roommates', memberIds: [3, 5] }];
assert.deepEqual(whoFor(['roommates'], folks, flat), [0, 3, 5]); // a group is you plus its members
assert.deepEqual(whoFor(['Roommate', 'Ravi'], folks, flat), [0, 3, 5]);
assert.deepEqual(whoFor(['room mates'], folks, flat), [0, 3, 5]); // spacing and typos forgiven
assert.deepEqual(whoFor(['roomates'], folks, flat), [0, 3, 5]);
assert.deepEqual(whoFor(['prya'], folks), [3]);
assert.deepEqual(whoFor(['Raju'], folks), []); // two letters off a short name: not Ravi
assert.deepEqual(fromGemini({ total: 90, with: ['roommates', ''] }).with, ['roommates']);
assert.deepEqual(peek('now tomatoes 70 onions 60, palak: ₹20 for me'), [
  { name: 'tomatoes', amount: 7000 }, { name: 'onions', amount: 6000 }, { name: 'palak', amount: 2000 },
]);
console.log('bill checks passed');

// ── statement PDFs: UPI app text, bank tables with empty cells, payee names ──
import { parsePdfStatement, parseTextStatement, payeeFromDesc } from './statement.ts';
assert.equal(parseDate('Oct 28, 2026'), '2026-10-28');
const pe = parseTextStatement([
  'Transaction Statement for 9876543210', 'Date Transaction Details Type Amount',
  'Oct 28, 2026 Paid to Swiggy DEBIT ₹245', '08:15 pm Transaction ID T2610281234', 'UTR No. 612345678901', 'Paid by XXXXXXXX1234',
  'Oct 27, 2026 Received from Rahul Sharma CREDIT ₹1,250.50', '09:00 am UTR No. 698765432109',
  'Page 1 of 1',
]);
assert.deepEqual(pe.map((r) => [r.date, r.amount, r.direction, r.ref]), [['2026-10-28', 24500, 'debit', '612345678901'], ['2026-10-27', 125050, 'credit', '698765432109']]);
assert.equal(payeeFromDesc(pe[0].desc), 'Swiggy');
assert.equal(payeeFromDesc(pe[1].desc), 'Rahul Sharma');
assert.equal(payeeFromDesc('UPI-CAFE COFFEE-cafe.coffee@okaxis-UTIB0-612345678901-coffee', 'cafe.coffee@okaxis'), 'Cafe Coffee');
assert.equal(payeeFromDesc('POS 4321 DMART'), 'Dmart');
assert.equal(payeeFromDesc('UPI/DR/611111111111/X', 'x1@ybl'), 'x1');
const C = (x: number, text: string, w = 40) => ({ x, w, text });
const pdfRows = parsePdfStatement([
  [C(40, 'STATE BANK OF INDIA', 200)],
  [C(40, 'Txn Date'), C(110, 'Description', 150), C(300, 'Ref No'), C(380, 'Debit'), C(450, 'Credit'), C(520, 'Balance')],
  [C(40, '05/10/2026'), C(110, 'UPI/DR/612345678901/CAFE', 150), C(385, '120.00', 35), C(515, '9,880.00', 45)], // no credit cell at all
  [C(110, 'COFFEE/okaxis', 150)], // narration wraps
  [C(40, '06/10/2026'), C(110, 'NEFT RAHUL', 150), C(455, '1,250.50', 35), C(515, '11,130.50', 45)],
]);
assert.deepEqual(pdfRows.map((r) => [r.amount, r.direction, r.ref]), [[12000, 'debit', '612345678901'], [125050, 'credit', undefined]]);
assert.equal(pdfRows[0].desc, 'UPI/DR/612345678901/CAFE COFFEE/okaxis');
// PhonePe's PDF lines up as a table too: time, transaction ID and UTR sit on the lines under each payment
const pePdf = parsePdfStatement([
  [C(40, 'Date'), C(150, 'Transaction Details', 120), C(380, 'Type'), C(470, 'Amount')],
  [C(40, 'Oct 28, 2026', 60), C(150, 'Paid to Swiggy', 120), C(380, 'DEBIT'), C(470, '₹245')],
  [C(40, '08:15 pm'), C(150, 'Transaction ID T2610281234', 120)],
  [C(150, 'UTR No. 612345678901', 120)],
  [C(40, 'Oct 27, 2026', 60), C(150, 'Received from Rahul', 120), C(380, 'CREDIT'), C(470, '₹500')],
]);
assert.deepEqual(pePdf.map((r) => [r.amount, r.direction, r.ref, payeeFromDesc(r.desc)]), [[24500, 'debit', '612345678901', 'Swiggy'], [50000, 'credit', undefined, 'Rahul']]);
console.log('statement pdf checks passed');

// QR formats shops actually print
{
  const tez = parseUpiQr('tez://upi/pay?pa=shop@okicici&pn=Shop&am=50&tn=Order%2012')!;
  assert.deepEqual([tez.vpa, tez.name, tez.amount, tez.note], ['shop@okicici', 'Shop', 50, 'Order 12']);
  assert.equal(parseUpiQr('upi://pay/?pa=a@ybl&pn=A?B')!.name, 'A?B'); // '?' in a value doesn't cut the link
  assert.equal(parseUpiQr(' rahul@okaxis \n')!.vpa, 'rahul@okaxis');
  assert.equal(parseUpiQr('upi://pay?pn=NoId'), null);
  assert.equal(parseUpiQr('hello world'), null);
  // BharatQR / EMV: UPI ID nested in tag 26, MCC 52, amount 54, name 59
  const f = (t: string, v: string) => t + String(v.length).padStart(2, '0') + v;
  const emv = f('00', '01') + f('01', '12') + f('26', f('00', 'A000000677010111') + f('01', 'kirana@ybl')) + f('52', '5411') + f('53', '356') + f('54', '99.50') + f('59', 'Ravi Kirana') + f('63', 'ABCD');
  const e = parseUpiQr(emv)!;
  assert.deepEqual([e.vpa, e.name, e.amount, e.mcc], ['kirana@ybl', 'Ravi Kirana', 99.5, '5411']);
  assert.equal(mccCategory('5411'), 'Groceries');
  assert.equal(mccCategory('5812'), 'Food');
  assert.equal(mccCategory('0000'), null);
}

// the learner: payees, usual category / note, guesses for someone new
import { guess, payees } from './learn.ts';
import { mccCategory } from './upi.ts';
{
  const T = (name: string, vpa: string | null, category: string, date: string, amount = 10000, note: string | null = null) =>
    ({ payee_name: name, payee_vpa: vpa, category, subcategory: null, note, amount, direction: 'debit' as const, status: 'SUCCESS', created_at: `${date}T10:00:00`, method: 'upi' as const, place: null });
  const h = [
    T('Chai Point', 'chai@ybl', 'Food', '2026-11-01', 2000, 'Tea'), T('Chai Point', 'chai@ybl', 'Food', '2026-10-30', 2000, 'Tea'),
    T('Chai Point', null, 'Food', '2026-10-20', 3000), // typed by hand: joins the UPI ID with the same name
    T('Sharma Medical', 's@okaxis', 'Health', '2026-09-01'), T('Old Shop', 'old@ybl', 'Shopping', '2025-01-01'),
    T('Payment', null, 'Other', '2026-11-02'), // generic: not a payee
  ];
  const ps = payees(h, '2026-11-04');
  assert.equal(ps[0].name, 'Chai Point');
  assert.deepEqual([ps[0].count, ps[0].amount, ps[0].typical, ps[0].category, ps[0].note], [3, 2000, 2000, 'Food', 'Tea']);
  assert.equal(ps.at(-1)!.name, 'Old Shop'); // long ago sinks
  assert.ok(!ps.some((p) => p.name === 'Payment'));
  assert.equal(guess(h, '2026-11-04', { vpa: 'chai@ybl' })!.from, 'history');
  assert.equal(guess(h, '2026-11-04', { name: 'chai point' })!.note, 'Tea');
  assert.deepEqual([guess(h, '2026-11-04', { name: 'Gupta Medical Hall' })!.category, guess(h, '2026-11-04', { name: 'Gupta Medical Hall' })!.from], ['Health', 'similar']);
  assert.equal(guess(h, '2026-11-04', { name: 'Swiggy' })!.category, 'Food');
  assert.equal(guess(h, '2026-11-04', { name: 'My Parent' }), null); // 'rent' only at a word start
  assert.equal(guess(h, '2026-11-04', { name: 'Ravi', mcc: '5541' })!.category, 'Fuel');
  // a habit that changed: the newest entries win
  const moved = [T('X Co', 'x@ybl', 'Bills', '2026-11-03'), T('X Co', 'x@ybl', 'Bills', '2026-11-02'), ...[1, 2, 3].map((d) => T('X Co', 'x@ybl', 'Shopping', `2026-01-0${d}`))];
  assert.equal(payees(moved, '2026-11-04')[0].category, 'Bills');
}
console.log('learn + qr checks passed');

// generic shop QRs, budgets, nudges, quick add, UPI receipts
import { nudges, parseQuick, safeToSpend, suggestBudgets } from './learn.ts';
import { genericName } from './upi.ts';
import { parseUpiReceipt } from './receipt.ts';
{
  const pp = parseUpiQr('upi://pay?pa=Q12345@ybl&pn=PhonePeMerchant&mc=0000&tn=Pay%20to%20PhonePeMerchant')!;
  assert.ok(genericName(pp.name, pp.vpa));
  assert.equal(pp.note, undefined); // filler note dropped
  assert.ok(genericName('BharatPe Merchant') && genericName('Paytm Merchant') && genericName('9876543210') && genericName('x@ybl', 'x@ybl'));
  assert.ok(!genericName('Ravi Kirana') && !genericName('Merchant of Venice Cafe'));
  assert.equal(parseUpiQr('upi://pay?pa=s@ybl&pn=Shop&tn=Table%204')!.note, 'Table 4');

  const T = (name: string | null, vpa: string | null, category: string, date: string, amount = 10000) =>
    ({ payee_name: name, payee_vpa: vpa, category, subcategory: null, note: null, amount, direction: 'debit' as const, status: 'SUCCESS', created_at: `${date}T10:00:00`, method: 'upi' as const, place: null });
  // a shop first saved as "PhonePeMerchant", then named: the name sticks to its UPI ID
  const shop = [T('Ravi Tea Stall', 'q1@ybl', 'Food', '2026-11-02', 2000), T('PhonePeMerchant', 'q1@ybl', 'Food', '2026-11-01', 2000)];
  const ps = payees(shop, '2026-11-04');
  assert.deepEqual([ps[0].name, ps[0].count, ps[0].named], ['Ravi Tea Stall', 2, true]);
  assert.equal(guess(shop, '2026-11-04', { vpa: 'q1@ybl', name: 'PhonePeMerchant' })!.payee!.name, 'Ravi Tea Stall');
  assert.equal(guess(shop, '2026-11-04', { vpa: 'q9@ybl', name: 'PhonePeMerchant' }), null); // a different shop with the same filler name isn't them

  // budgets: usual month = median of the last three
  const hist = [
    ...['2026-08', '2026-09', '2026-10'].map((m, i) => T('Swiggy', 's@ybl', 'Food', `${m}-10`, [4000_00, 5000_00, 6000_00][i])),
    T('Swiggy', 's@ybl', 'Food', '2026-11-02', 3000_00), T('Swiggy', 's@ybl', 'Food', '2026-11-08', 1600_00),
  ];
  assert.deepEqual(suggestBudgets(hist, '2026-11-10'), { Food: 5000_00 });
  const s = safeToSpend({ Food: 5000_00 }, hist, '2026-11-10');
  assert.deepEqual([s.spent, s.left, s.daysLeft, s.perDay], [4600_00, 400_00, 21, 19_00]);
  assert.ok(nudges(hist, '2026-11-10', { Food: 5000_00 }).some((n) => n.key === 'b:2026-11:Food'));
  assert.ok(nudges(hist, '2026-11-10').some((n) => n.key === 'c:2026-11:Food')); // no budget: on pace for more than usual
  // a subscription that went up, an unusual amount
  const subs = ['2026-07', '2026-08', '2026-09', '2026-10'].map((m) => T('Netflix', 'nf@icici', 'Entertainment', `${m}-05`, 199_00));
  assert.ok(nudges([...subs, T('Netflix', 'nf@icici', 'Entertainment', '2026-11-05', 249_00)], '2026-11-06').some((n) => n.text === 'Netflix went from ₹199 to ₹249'));
  const tea = [1, 2, 3, 4].map((d) => T('Chai', 'c@ybl', 'Food', `2026-10-0${d}`, 20_00));
  assert.ok(nudges([...tea, T('Chai', 'c@ybl', 'Food', '2026-11-03', 2400_00)], '2026-11-04').some((n) => n.key.startsWith('u:')));

  // quick add
  const people = [{ id: 1, name: 'Rahul Sharma' }, { id: 2, name: 'Priya' }];
  assert.deepEqual(parseQuick('120 chai split rahul', people, [{ name: 'Chai Point' }]), { amount: 120_00, payee: 'Chai Point', note: '', method: null, people: [1] });
  assert.deepEqual(parseQuick('uber 250 cash', people, []), { amount: 250_00, payee: 'Uber', note: '', method: 'cash', people: [] });
  assert.deepEqual(parseQuick('1.2k dinner at Toit with priya and rahul', people, [{ name: 'Toit' }]), { amount: 1200_00, payee: 'Toit', note: 'dinner at', method: null, people: [2, 1] });
  assert.equal(parseQuick('just words', people, []), null);

  // receipts shared from UPI apps
  const pe = parseUpiReceipt('Transaction Successful\n10:42 am on 04 Nov 2026\nPaid to\nSWIGGY\nswiggy@ybl\n₹245\nTransaction ID\nT2611041042123\nUTR: 612345678901')!;
  assert.deepEqual(pe, { amount: 245_00, payee: 'SWIGGY', vpa: 'swiggy@ybl', ref: '612345678901', date: '2026-11-04', direction: 'debit' });
  const gp = parseUpiReceipt('₹1,250.00\nCompleted\n3 Nov 2026, 8:15 pm\nUPI transaction ID\n612399998888\nTo: Ravi Kirana\nravi@okaxis\nFrom: ME (Bank 1234)')!;
  assert.deepEqual([gp.amount, gp.payee, gp.ref, gp.date], [1250_00, 'Ravi Kirana', '612399998888', '2026-11-03']);
  const pt = parseUpiReceipt('Received from Rahul\nRs. 500\nUPI Ref No: 612311112222')!;
  assert.deepEqual([pt.direction, pt.payee, pt.amount], ['credit', 'Rahul', 500_00]);
  assert.equal(parseUpiReceipt('hello'), null);
}
console.log('budget + nudge + quick + receipt checks passed');
