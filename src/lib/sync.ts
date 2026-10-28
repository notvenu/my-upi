import { createClient, type RealtimeChannel } from '@supabase/supabase-js';
import { db, getSetting, localIso, persistLocal, setSaveHook } from './db';
import { buildShare } from './share';
import { emit } from './store';

// Sync with Supabase (schema in supabase/schema.sql). Each person, payment, split… is one row; a device sends only rows
// that changed since the last sync and takes others' changes live. Same row changed on both before syncing:
// the unsent local edit wins. Everything still works signed out, on this device only.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const supabase = url && key ? createClient(url, key) : null;

// checked: the saved session has been looked at, so the app knows whether to show the login screen.
type SyncState = { email: string | null; since: string | null; checked: boolean; status: 'off' | 'syncing' | 'synced' | 'offline'; error: string };
export const sync: SyncState = { email: null, since: null, checked: !supabase, status: 'off', error: '' };
const setSync = (patch: Partial<SyncState>) => { Object.assign(sync, patch); emit(); };

const KINDS = { txn: 'txns', person: 'people', group: 'groups', split: 'splits', sub: 'subs', share: 'shares' } as const;
type Kind = keyof typeof KINDS | 'meta';
type Row = { kind: Kind; id: number; data: unknown; deleted: boolean; updated_at?: string };

// What the server has, per row ("kind:id" → JSON), and how far we've read; kept so offline edits survive a reload.
const STATE_KEY = 'myupi-sync';
let synced: Record<string, string> = {};
let cursor = '1970-01-01T00:00:00Z';
const loadState = () => { try { ({ synced, cursor } = JSON.parse(localStorage.getItem(STATE_KEY) ?? '') ); } catch { synced = {}; cursor = '1970-01-01T00:00:00Z'; } };
const saveState = () => localStorage.setItem(STATE_KEY, JSON.stringify({ synced, cursor }));

function localRows(): Map<string, unknown> {
  const s = structuredClone(db);
  const m = new Map<string, unknown>();
  for (const [kind, k] of Object.entries(KINDS)) for (const r of s[k] as { id: number }[]) m.set(`${kind}:${r.id}`, r);
  m.set('meta:0', { settings: s.settings, subcategories: s.subcategories });
  return m;
}
const dirty = (k: string, local: Map<string, unknown>) =>
  local.has(k) ? JSON.stringify(local.get(k)) !== synced[k] : k in synced;

// Takes one server row unless this device has an unsent change to it.
function apply(r: Row, local: Map<string, unknown>) {
  const k = `${r.kind}:${r.id}`;
  if (dirty(k, local)) return;
  if (r.kind === 'meta') {
    const m = r.data as { settings: Record<string, string>; subcategories: Record<string, string[]> };
    db.settings = m.settings; db.subcategories = m.subcategories;
  } else {
    const list = db[KINDS[r.kind]] as { id: number }[];
    const i = list.findIndex((x) => x.id === r.id);
    if (r.deleted) { if (i >= 0) list.splice(i, 1); }
    else if (i >= 0) list[i] = r.data as { id: number };
    else list.push(r.data as { id: number });
  }
  if (r.deleted) delete synced[k];
  else synced[k] = JSON.stringify(r.data);
}

async function pull() {
  const local = localRows();
  // a little overlap, so rows committed a moment out of order aren't skipped (applying twice is harmless)
  const from = new Date(Date.parse(cursor) - 10_000).toISOString();
  for (let page = 0; ; page++) {
    const { data, error } = await supabase!.from('rows').select('kind,id,data,deleted,updated_at')
      .gt('updated_at', from).order('updated_at').range(page * 1000, page * 1000 + 999);
    if (error) throw error;
    for (const r of data as Row[]) { apply(r, local); if (r.updated_at! > cursor) cursor = r.updated_at!; }
    if (data.length < 1000) break;
  }
  persistLocal();
  saveState();
  emit();
}

async function push() {
  const local = localRows();
  const up: Row[] = [];
  for (const [k, v] of local) if (dirty(k, local)) up.push({ kind: k.split(':')[0] as Kind, id: Number(k.split(':')[1]), data: v, deleted: false });
  for (const k of Object.keys(synced)) if (!local.has(k)) up.push({ kind: k.split(':')[0] as Kind, id: Number(k.split(':')[1]), data: null, deleted: true });
  for (let i = 0; i < up.length; i += 500) {
    const { error } = await supabase!.from('rows').upsert(up.slice(i, i + 500), { onConflict: 'user_id,kind,id' });
    if (error) throw error;
  }
  for (const r of up) {
    const k = `${r.kind}:${r.id}`;
    if (r.deleted) delete synced[k]; else synced[k] = JSON.stringify(r.data);
  }
  saveState();
  await pushShares();
}

// Each split link is a snapshot the public page reads; re-sent whenever what it shows changes.
async function pushShares() {
  const me = { name: getSetting('my_name') || 'Me', vpa: getSetting('my_vpa') };
  const s = structuredClone(db);
  for (const def of s.shares) {
    const view = buildShare(def, s, me, localIso());
    const body = JSON.stringify({ ...view, updated: '' });
    if (synced[`snap:${def.uuid}`] === body) continue;
    const { error } = await supabase!.from('shares').upsert({ id: def.uuid, data: view });
    if (error) throw error;
    synced[`snap:${def.uuid}`] = body;
  }
  saveState();
}

let running: Promise<void> | null = null;
let again = false;
// One sync at a time; a request while one runs queues exactly one more.
export function syncNow(): Promise<void> {
  if (!supabase || !sync.email) return Promise.resolve();
  if (running) { again = true; return running; }
  setSync({ status: 'syncing' });
  running = (async () => {
    try {
      await pull();
      await push();
      setSync({ status: 'synced', error: '' });
    } catch (e) {
      setSync({ status: navigator.onLine ? 'synced' : 'offline', error: navigator.onLine ? String((e as Error).message ?? e) : '' });
    }
    running = null;
    if (again) { again = false; await syncNow(); }
  })();
  return running;
}

let timer = 0;
let channel: RealtimeChannel | null = null;
export async function startSync() {
  if (!supabase) return;
  loadState();
  setSaveHook(() => { clearTimeout(timer); timer = window.setTimeout(syncNow, 800); });
  addEventListener('online', () => syncNow());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });

  const signedIn = async (email: string | null, userId: string | null) => {
    if (sync.email === email) return;
    setSync({ email, status: email ? 'syncing' : 'off' });
    channel?.unsubscribe();
    channel = null;
    if (!email) return;
    await syncNow();
    // live: someone else's device changed a row
    channel = supabase.channel('rows').on('postgres_changes', { event: '*', schema: 'public', table: 'rows', filter: `user_id=eq.${userId}` },
      (p) => { const r = p.new as Row; if (r?.kind) { apply(r, localRows()); if (r.updated_at! > cursor) cursor = r.updated_at!; persistLocal(); saveState(); emit(); } },
    ).subscribe();
  };
  // Supabase keeps the session in this browser and refreshes it, so you stay signed in until you sign out.
  supabase.auth.onAuthStateChange((_e, session) => {
    sync.since = session?.user.last_sign_in_at ?? null;
    setTimeout(async () => { await signedIn(session?.user.email ?? null, session?.user.id ?? null); setSync({ checked: true }); });
  });
}

// The account is made in the Supabase dashboard (Authentication → Users); there is no sign-up here.
export async function signIn(email: string, password: string) {
  const { error } = await supabase!.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Wrong email or password' : error.message);
}
// Sends anything unsent, then signs out and wipes this browser's copy (bill photos stay), so a shared laptop keeps nothing.
export async function signOut() {
  await syncNow();
  await supabase!.auth.signOut();
  for (const k of ['myupi', STATE_KEY, 'opened']) localStorage.removeItem(k);
  location.reload();
}
// Ends every other device's session (they'll see the login screen); this one stays signed in.
export async function signOutOthers() {
  const { error } = await supabase!.auth.signOut({ scope: 'others' });
  if (error) throw error;
}

export const shareUrl = (uuid: string) => `${location.origin}/s/${uuid}`;
