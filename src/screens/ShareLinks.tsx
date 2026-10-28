'use client';
import { ExternalLink, Link2, Share2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import Combobox from '@/components/Combobox';
import Sheet from '@/components/Sheet';
import { addShare, db, deleteShare, listGroups, listPeople, listTrips } from '@/lib/db';
import { shareUrl, sync, syncNow } from '@/lib/sync';
import { ask, shareText, toast } from '@/lib/ui';

// Public links for a room or a trip. Each shows what everyone shares equally, what's on each person,
// and what's carried over from earlier months; it updates itself as you record payments and mark people paid.
export default function ShareLinks({ onClose }: { onClose: () => void }) {
  const people = listPeople();
  const groups = listGroups().filter((g) => g.memberIds.length);
  const nameOf = (id: number) => people.find((p) => p.id === id)?.name.split(' ')[0] ?? '?';
  const [making, setMaking] = useState(false);
  const [title, setTitle] = useState('');
  const [picked, setPicked] = useState<number[]>([]);
  const [trip, setTrip] = useState<string | null>(null);
  const pickOptions = [
    ...groups.map((g) => ({ value: -g.id, label: g.name, hint: `${g.memberIds.length} people` })),
    ...people.map((p) => ({ value: p.id, label: p.name })),
  ];
  // picking a group adds its members, and names the link after it ("Room") if it has no name yet
  const pick = (ids: number[]) => {
    const g = groups.find((x) => ids.includes(-x.id));
    if (g && !title.trim()) setTitle(g.name);
    setPicked([...new Set(ids.flatMap((id) => (id < 0 ? groups.find((x) => x.id === -id)?.memberIds ?? [] : [id])))]);
  };

  async function create() {
    const def = addShare(title || (trip ?? 'Splits'), picked, trip);
    setMaking(false); setTitle(''); setPicked([]); setTrip(null);
    await syncNow();
    send(def.uuid, def.title);
  }
  async function send(uuid: string, name: string) {
    const how = await shareText(`${name}: what everyone owes`, shareUrl(uuid));
    if (how) toast(how === 'copied' ? 'Link copied' : 'Link shared');
  }
  async function remove(id: number, name: string) {
    if (await ask(`Delete the ${name} link?`, 'Anyone who opens it will see that it was removed.', 'Delete', true)) deleteShare(id);
  }

  return (
    <Sheet full title="Split links" onClose={onClose}>
      {!sync.email ? (
        <div className="card center" style={{ padding: '28px 22px', display: 'grid', gap: 8, justifyItems: 'center' }}>
          <Link2 size={28} style={{ color: 'var(--lime)' }} />
          <p style={{ fontWeight: 600, fontSize: 18 }}>Split links need sync</p>
          <p className="sub">Connect this site to Supabase (see the README) and sign in; links are read from your synced data.</p>
        </div>
      ) : (
        <>
          <p className="sub" style={{ margin: '0 4px 16px', fontSize: 15 }}>
            One link for the whole room: the expenses everyone shares equally, each person&apos;s own items, and anything unpaid carried into the next month.
            It updates as you record and mark people paid.
          </p>
          {db.shares.map((s) => (
            <div key={s.id} className="card link">
              <div className="row">
                <span className="mini-icon lime"><Link2 size={17} /></span>
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className="ellipsis" style={{ display: 'block', fontWeight: 600 }}>{s.title}</span>
                  <span className="sub ellipsis" style={{ display: 'block', fontSize: 14 }}>{s.trip ? `Trip: ${s.trip}` : 'Monthly'} · {s.personIds.map(nameOf).join(', ')}</span>
                </span>
              </div>
              <div className="acts">
                <button className="btn lime" onClick={() => send(s.uuid, s.title)}><Share2 size={17} /> Share</button>
                <a className="btn soft" href={shareUrl(s.uuid)} target="_blank" rel="noopener"><ExternalLink size={17} /> Open</a>
                <button className="btn soft del" aria-label={`Delete ${s.title} link`} onClick={() => remove(s.id, s.title)}><Trash2 size={17} /></button>
              </div>
            </div>
          ))}
          {making ? (
            <div className="card" style={{ display: 'grid', gap: 10, marginTop: 10 }}>
              <div className="list"><div className="field"><label htmlFor="sl-title">Name</label>
                <input id="sl-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Room" maxLength={40} /></div></div>
              <Combobox multiple label="Who it's for" placeholder="A group or people" options={pickOptions} values={picked} onChange={pick} />
              <Combobox label="Covers" value={trip} onChange={setTrip}
                options={[{ value: null as string | null, label: 'Every month (unpaid moves to next month)' }, ...listTrips().map((t) => ({ value: t as string | null, label: `Trip: ${t}` }))]} />
              <button className="btn" disabled={!picked.length} onClick={create}>Create and share</button>
            </div>
          ) : <button className="btn soft" style={{ marginTop: 10 }} onClick={() => setMaking(true)}>New link</button>}
        </>
      )}
      <style jsx>{`
        .link { margin-bottom: 10px; }
        .acts { display: grid; grid-template-columns: 1fr 1fr auto; gap: 8px; margin-top: 12px; }
        .acts .btn { text-decoration: none; }
        .acts .del { width: 52px; padding: 0; color: var(--red); }
      `}</style>
    </Sheet>
  );
}
