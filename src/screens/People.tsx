'use client';
import { ChevronRight, Link2, Search, SlidersHorizontal, Trash2, UserPlus, Users, X } from 'lucide-react';
import { useState } from 'react';
import Avatar from '@/components/Avatar';
import Combobox from '@/components/Combobox';
import NavBar from '@/components/NavBar';
import PersonForm from '@/components/PersonForm';
import Sheet from '@/components/Sheet';
import { addGroup, deleteGroup, listGroups, listPeople, type Person } from '@/lib/db';
import { ask, haptic, toast } from '@/lib/ui';
import { rupees } from '@/lib/upi';
import PersonSheet from './PersonSheet';
import ShareLinks from './ShareLinks';

export default function People() {
  const [query, setQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState<number | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [editing, setEditing] = useState<Partial<Person> | null>(null);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [newGroup, setNewGroup] = useState('');
  const [linksOpen, setLinksOpen] = useState(false);

  const people = listPeople();
  const groups = listGroups();
  const q = query.trim().toLowerCase();
  const shown = people
    .filter((p) => !groupFilter || p.groupIds.includes(groupFilter))
    .filter((p) => !q || [p.name, p.phone, p.vpa].some((v) => v?.toLowerCase().includes(q)));
  const owing = people.filter((p) => p.owed > 0);
  const owedTotal = owing.reduce((a, p) => a + p.owed, 0);
  const open = people.find((p) => p.id === openId);
  const groupExists = groups.some((g) => g.name.toLowerCase() === newGroup.trim().toLowerCase());

  function createGroup() {
    if (!newGroup.trim() || groupExists) return;
    addGroup(newGroup); toast(`${newGroup.trim()} created`); setNewGroup('');
  }

  return (
    <div className="page">
      <NavBar title="People" trailing={<>
        <button className="icon-btn" aria-label="Groups" onClick={() => setGroupsOpen(true)}><SlidersHorizontal size={19} /></button>
        <button className="icon-btn tinted" aria-label="Add person" onClick={() => setEditing({})}><UserPlus size={19} /></button>
      </>} />

      <div className="split">
        <div className="side">
          <label className="search">
            <Search size={18} strokeWidth={2.3} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, phone or UPI ID" aria-label="Search people" type="search" />
            {query && <button aria-label="Clear search" onClick={() => setQuery('')}><X size={17} /></button>}
          </label>

          {owedTotal > 0 && !q && (
            <section className="owed rise" aria-label={`${owing.length} people owe you ${rupees(owedTotal)}`}>
              <p className="lbl">Owed to you</p>
              <p className="num" style={{ fontSize: 40, lineHeight: 1.1 }}>{rupees(owedTotal)}</p>
              <div className="row" style={{ gap: 0, marginTop: 10 }}>
                <span className="stackav">{owing.slice(0, 4).map((p) => <Avatar key={p.id} name={p.name} size={28} />)}</span>
                <span className="lbl" style={{ marginLeft: 8 }}>by {owing.length} {owing.length === 1 ? 'person' : 'people'} · tap someone to request</span>
              </div>
            </section>
          )}

          <button className="item links-row card" onClick={() => setLinksOpen(true)}>
            <span className="mini-icon lime"><Link2 size={17} /></span>
            <span className="grow"><b style={{ fontWeight: 600 }}>Split links</b><br /><span className="sub">One link for the room or a trip: who owes what</span></span>
            <ChevronRight size={18} strokeWidth={2.5} className="chev" />
          </button>

          {groups.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <Combobox label="Show" value={groupFilter} onChange={setGroupFilter}
                options={[{ value: null as number | null, label: `Everyone · ${people.length}` }, ...groups.map((g) => ({ value: g.id as number | null, label: g.name, hint: `${g.memberIds.length}` }))]} />
            </div>
          )}
        </div>

        <section>
          {shown.length ? (
            <div className="list wide">
              {shown.map((p) => {
                const meta = [p.vpa || (p.phone && `+91 ${p.phone}`), ...groups.filter((g) => p.groupIds.includes(g.id)).map((g) => g.name)].filter(Boolean).join(' · ') || 'No contact details';
                return (
                  <button key={p.id} className="item" onClick={() => { haptic(); setOpenId(p.id); }}>
                    <Avatar name={p.name} />
                    <span className="grow"><span className="ellipsis" style={{ display: 'block', fontWeight: 500 }}>{p.name}</span><span className="sub ellipsis" style={{ display: 'block' }}>{meta}</span></span>
                    {p.owed > 0 && <span className="num" style={{ color: 'var(--lime)' }}>{rupees(p.owed)}</span>}
                    <ChevronRight size={18} strokeWidth={2.5} className="chev" />
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="card center" style={{ padding: '32px 22px', display: 'grid', gap: 6, justifyItems: 'center' }}>
              <p style={{ fontWeight: 600, fontSize: 20 }}>{q ? 'No one found' : people.length ? 'No one in this group yet' : 'Add your people'}</p>
              <p className="sub" style={{ maxWidth: 300 }}>{q ? `Nothing matches "${query}".` : people.length ? 'Open a person, tap Edit, and add them to this group.' : 'Save roommates and friends once with their UPI ID and phone. Then split and request with a tap.'}</p>
              {!people.length && <button className="btn" style={{ marginTop: 12 }} onClick={() => setEditing({})}><UserPlus size={18} /> Add person</button>}
            </div>
          )}
        </section>
      </div>

      {open && <PersonSheet p={open} groups={groups} onClose={() => setOpenId(null)} onEdit={() => { setEditing(open); setOpenId(null); }} />}
      {editing && <PersonForm person={editing} onClose={() => setEditing(null)} />}
      {linksOpen && <ShareLinks onClose={() => setLinksOpen(false)} />}
      {groupsOpen && (
        <Sheet title="Groups" onClose={() => setGroupsOpen(false)}>
          <p className="sub" style={{ margin: '0 4px 16px', fontSize: 15 }}>Pick a whole group in one tap when splitting, like Roommates for rent, wifi and groceries.</p>
          <div className="list"><div className="field" style={{ paddingRight: 6 }}>
            <input value={newGroup} onChange={(e) => setNewGroup(e.target.value)} placeholder="New group" aria-label="New group name" onKeyDown={(e) => e.key === 'Enter' && createGroup()} />
            <button className="btn ghost" style={{ width: 'auto' }} disabled={!newGroup.trim() || groupExists} onClick={createGroup}>Add</button>
          </div></div>
          {groupExists && <p className="hint" style={{ color: 'var(--red)' }}>You already have this group</p>}
          {groups.length > 0 && (
            <>
              <h3 className="eyebrow">Your groups</h3>
              <div className="list">
                {groups.map((g) => (
                  <div key={g.id} className="item">
                    <span className="mini-icon"><Users size={17} /></span>
                    <span className="grow">{g.name}<br /><span className="sub">{g.memberIds.length} {g.memberIds.length === 1 ? 'person' : 'people'}</span></span>
                    <button className="icon-btn plain" style={{ color: 'var(--red)' }} aria-label={`Delete ${g.name}`} onClick={async () => {
                      if (await ask(`Delete ${g.name}?`, 'The people in it are kept.', 'Delete', true)) { deleteGroup(g.id); toast(`${g.name} deleted`); }
                    }}><Trash2 size={18} /></button>
                  </div>
                ))}
              </div>
            </>
          )}
          <p className="hint">To add someone to a group, open them and tap Edit.</p>
        </Sheet>
      )}

      <style jsx>{`
        .links-row { width: 100%; margin-bottom: 14px; padding: 12px 16px; gap: 12px; }
        .owed { border-radius: 30px; padding: 20px 22px; margin-bottom: 14px; background: var(--card); box-shadow: inset 0 0 0 .5px rgb(255 255 255 / .06); }
        .owed .num { color: var(--lime); }
        .lbl { font-size: 14px; color: var(--sub); }
        .stackav { display: flex; }
        .stackav :global(.av) { box-shadow: 0 0 0 2px var(--card); }
        .stackav :global(.av + .av) { margin-left: -8px; }
        /* UISearchBar, iOS 26 capsule */
        .search { display: flex; align-items: center; gap: 8px; background: var(--raised); border-radius: 999px; padding: 0 14px; min-height: 40px; margin-bottom: 14px; color: var(--sub); }
        .search input { flex: 1; font-size: 17px; padding: 8px 0; color: var(--ink); }
        .search input::-webkit-search-cancel-button { display: none; }
      `}</style>
    </div>
  );
}
