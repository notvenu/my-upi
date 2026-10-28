import type { Txn } from './db';
import { emit } from './store';
import { canOpenApps } from './ui';
import type { UpiQr } from './upi';

export type Tab = 'home' | 'history' | 'insights' | 'scan' | 'people' | 'me';
// What a scanned bill fills in: shop, total and items (paise), the photo, and the bill's date.
// From a trip: its name and people, so the split starts as "equally between them".
export type PayDraft = {
  payee?: string; amount?: number; items?: { name: string; amount: number }[]; bill?: string | null; date?: string | null; trip?: string; people?: number[];
};
// App-wide screens any tab can open: paying / recording, "did you pay?", editing an entry, autopays, statement import.
// scanMode / peopleView: which side the Scan and People tabs open on.
// confirmId: the payment just made in a UPI app, shown first. requestFor: a split payment to offer "request your split now?" for.
type Nav = {
  tab: Tab; pay: { qr: UpiQr | null; record: boolean; draft?: PayDraft } | null; confirming: boolean; confirmId: number | null; editing: Txn | null;
  requestFor: number | null; subs: boolean; importing: boolean; scanMode: 'qr' | 'bill'; peopleView: 'people' | 'groups' | 'trips';
};
export const nav: Nav = {
  tab: 'home', pay: null, confirming: false, confirmId: null, editing: null, requestFor: null, subs: false, importing: false, scanMode: 'qr', peopleView: 'people',
};
export const setNav = (patch: Partial<Nav>) => { Object.assign(nav, patch); emit(); };
// Where a UPI app can't be opened (laptop, iPhone), paying means recording it with its details.
export const openPay = (qr: UpiQr | null = null, record = false, draft?: PayDraft) => setNav({ pay: { qr, record: record || !canOpenApps, draft } });
