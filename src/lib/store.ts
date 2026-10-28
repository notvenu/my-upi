import { useSyncExternalStore } from 'react';

// One change signal for the whole app: data, navigation, toasts, dialogs and sync all call emit() after changing,
// and the app root re-renders. Fine at this size (a personal log); split into per-slice stores if renders get slow.
let version = 0;
const listeners = new Set<() => void>();
export function emit() { version++; for (const f of listeners) f(); }
const subscribe = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };
export const useStore = () => useSyncExternalStore(subscribe, () => version, () => version);

// The scroll offset changes on every frame, so it gets its own signal (only the nav bar listens).
let scrollY = 0;
const scrollListeners = new Set<() => void>();
export function setScrollY(y: number) { scrollY = y; for (const f of scrollListeners) f(); }
export const useScrollY = () => useSyncExternalStore(
  (f) => { scrollListeners.add(f); return () => { scrollListeners.delete(f); }; }, () => scrollY, () => 0,
);
