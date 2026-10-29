import { useReducer, useRef } from 'react';
import { itemShares } from './calc';
import type { Item } from './db';
import { toPaise as paise } from './ui';

// Split state shared by the pay form and the edit sheet (adding a split to an existing payment).
// Equal mode: everyone (you included) pays the same unless a share is typed.
// Item mode: each item is for you, everyone, or specific people; whatever isn't itemised is shared by all.
// Fields are changed through set() (or mutated, then changed()), which re-renders the form that owns it.
export class Split {
  on = false;
  picked: number[] = [];
  shares: Record<number, string> = {};
  byItem = false;
  items: { name: string; amount: string; who: number[] }[] = [];
  base = 0; // the amount typed on the form
  constructor(public changed: () => void) {}
  set = (patch: Partial<Pick<Split, 'on' | 'picked' | 'shares' | 'byItem' | 'items'>>) => { Object.assign(this, patch); this.changed(); };

  // Just me · Split equally · Split by item
  get mode(): 'me' | 'equal' | 'items' { return !this.on ? 'me' : this.byItem ? 'items' : 'equal'; }
  setMode = (m: 'me' | 'equal' | 'items') =>
    this.set({ on: m !== 'me', byItem: m === 'items', items: m === 'items' && !this.items.length ? [{ name: '', amount: '', who: [] }] : this.items });

  get itemised() { return this.byItem ? this.items.reduce((a, it) => a + paise(it.amount), 0) : 0; }
  // With items and no amount typed, the items are the bill.
  get total() { return this.base || this.itemised; }
  get active() { return this.on ? this.picked : []; }
  get equalShare() { return Math.floor(this.total / (this.active.length + 1)); } // you count as one share
  private get perItem() {
    return itemShares(this.total, this.active, this.items.map((it) => ({ amount: paise(it.amount), who: it.who })));
  }
  shareOf = (id: number) =>
    this.byItem ? this.perItem.get(id) ?? 0 : this.shares[id] ? paise(this.shares[id]) : this.equalShare;
  get myShare() { return this.total - this.active.reduce((a, id) => a + this.shareOf(id), 0); }
  get overItems() { return this.byItem && this.itemised > this.total; }
  addItem = () => this.set({ items: [...this.items, { name: '', amount: '', who: [] }] }); // a new item is for everyone
  rows = () => this.active.map((personId) => ({ personId, amount: this.shareOf(personId) })).filter((r) => r.amount > 0);
  // what's saved on the entry, so the bill can be read back later
  itemsData = (): Item[] | null =>
    this.on && this.byItem ? this.items.filter((it) => paise(it.amount)).map((it) => ({ name: it.name.trim() || 'Item', amount: paise(it.amount), who: it.who })) : null;
}

// items: a scanned bill's lines, ready for "By item". people: a trip's people, so it starts split equally between them.
export function useSplit(total: number, items?: { name: string; amount: number; who?: number[] }[], people?: number[]): Split {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const ref = useRef<Split>(null);
  if (!ref.current) {
    ref.current = new Split(rerender);
    ref.current.items = (items ?? []).map((it) => ({ name: it.name, amount: String(it.amount / 100), who: it.who ?? [] }));
    if (people?.length) Object.assign(ref.current, { on: true, picked: people });
    if (items?.some((it) => it.who?.length)) Object.assign(ref.current, { on: true, byItem: true }); // a note said who had what
  }
  ref.current.base = total;
  return ref.current;
}
