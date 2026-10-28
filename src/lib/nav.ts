import type { Txn } from './db';
import { emit } from './store';
import { canOpenApps } from './ui';
import type { UpiQr } from './upi';

export type Tab = 'home' | 'insights' | 'scan' | 'people' | 'me';
// App-wide screens any tab can open: paying / recording, "did you pay?", editing an entry, history and autopays.
// confirmId: the payment just made in a UPI app, shown first. requestFor: a split payment to offer "request your split now?" for.
type Nav = {
  tab: Tab; pay: { qr: UpiQr | null; record: boolean } | null; confirming: boolean; confirmId: number | null; editing: Txn | null;
  requestFor: number | null; history: boolean; subs: boolean;
};
export const nav: Nav = { tab: 'home', pay: null, confirming: false, confirmId: null, editing: null, requestFor: null, history: false, subs: false };
export const setNav = (patch: Partial<Nav>) => { Object.assign(nav, patch); emit(); };
// Where a UPI app can't be opened (laptop, iPhone), paying means recording it with its details.
export const openPay = (qr: UpiQr | null = null, record = false) => setNav({ pay: { qr, record: record || !canOpenApps } });
