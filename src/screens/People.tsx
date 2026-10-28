'use client';
import { ChevronRight, Link2, Luggage, Plus, Search, UserPlus, Users, X } from 'lucide-react';
import { useState } from 'react';
import Avatar from '@/components/Avatar';
import GroupForm from '@/components/GroupForm';
import NavBar from '@/components/NavBar';
import PersonForm from '@/components/PersonForm';
import Segmented from '@/components/Segmented';
import { listGroups, listPeople, listTrips, tripInfo, type Group, type Person } from '@/lib/db';
import { nav } from '@/lib/nav';
import { haptic } from '@/lib/ui';
import { rupees } from '@/lib/upi';
import PersonSheet from './PersonSheet';
import ShareLinks from './ShareLinks';
import TripSheet from './TripSheet';

type View = 'people' | 'groups' | 'trips';
const VIEWS: [View, string][] = [['people', 'People'], ['groups', 'Groups'], ['trips', 'Trips']];
const ADD = { people: 'Add person', groups: 'New group', trips: 'New trip or event' };

// Three plain lists: people (who owes you), groups you split with every month (Roommates), and trips or events (Goa trip).
// The + button adds whichever list you're on.
export default function People() {
  const [view, setView] = useState<View>(nav.peopleView);
  nav.peopleView = 'people'; // Home's "Trips and events" opens here once
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);
  const [editing, setEditing] = useState<Partial<Person> | null>(null);
  const [groupEdit, setGroupEdit] = useState<Partial<Group> | null>(null);
  const [trip, setTrip] = useState<string | null>(null);
  const [linksOpen, setLinksOpen] = useState(false);

  const people = listPeople();
  const all = listGroups();
  const groups = all.filter((g) => !g.trip);
  const trips = listTrips().map((name) => ({ name, ...tripInfo(name) }));
  const q = query.trim().toLowerCase();
  const shown = people.filter((p) => !q || [p.name, p.phone, p.vpa].some((v) => v?.toLowerCase().includes(q)));
  const owing = people.filter((p) => p.owed > 0);
  const owedTotal = owing.reduce((a, p) => a + p.owed, 0);
  const open = people.find((p) => p.id === openId);
  const nameOf = (id: number) => people.find((p) => p.id === id)?.name ?? '?';

  function add() {
    haptic();
    if (view === 'people') setEditing({});
    else setGroupEdit({ name: '', memberIds: [], trip: view === 'trips' });
  }
  const editTrip = (name: string) => { const t = trips.find((x) => x.name === name); setTrip(null); setGroupEdit(t?.group ?? { name, memberIds: t?.people ?? [], trip: true }); };
  const faces = (ids: number[]) => <span className="stackav">{ids.slice(0, 4).map((id) => <Avatar key={id} name={nameOf(id)} size={26} />)}</span>;

  return (
    <div className="page">
      <NavBar title="People" trailing={
        <button className="icon-btn tinted" aria-label={ADD[view]} title={ADD[view]} onClick={add}>{view === 'people' ? <UserPlus size={19} /> : <Plus size={20} />}</button>
      } />

      <div className="split">
        <div className="side">
          {owedTotal > 0 && (
            <section className="owed rise" aria-label={`${owing.length} people owe you ${rupees(owedTotal)}`}>
              <p className="lbl">Owed to you</p>
              <p className="num" style={{ fontSize: 40, lineHeight: 1.1 }}>{rupees(owedTotal)}</p>
              <div className="row" style={{ gap: 0, marginTop: 10 }}>
                <span className="stackav">{owing.slice(0, 4).map((p) => <Avatar key={p.id} name={p.name} size={28} />)}</span>
                <span className="lbl" style={{ marginLeft: 8 }}>by {owing.length} {owing.length === 1 ? 'person' : 'people'} · tap someone to ask</span>
              </div>
            </section>
          )}
          <Segmented options={VIEWS} value={view} onChange={setView} label="Show" />
          <p className="hint" style={{ marginBottom: 12 }}>
            {view === 'people' ? 'Everyone you split with, and what they owe you.'
              : view === 'groups' ? 'People you split with all the time, picked in one tap.'
              : 'A trip, party or event: its people and every expense on it, in one place.'}
          </p>
          {view === 'people' && people.length > 5 && (
            <label className="search">
              <Search size={18} strokeWidth={2.3} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, phone or UPI ID" aria-label="Search people" type="search" />
              {query && <button aria-label="Clear search" onClick={() => setQuery('')}><X size={17} /></button>}
            </label>
          )}
        </div>

        <section>
          {view === 'people' ? (shown.length ? (
            <div className="list wide">
              {shown.map((p) => (
                <button key={p.id} className="item" onClick={() => { haptic(); setOpenId(p.id); }}>
                  <Avatar name={p.name} />
                  <span className="grow">
                    <span className="ellipsis" style={{ display: 'block', fontWeight: 500 }}>{p.name}</span>
                    <span className="sub ellipsis" style={{ display: 'block' }}>{p.owed > 0 ? 'Owes you' : p.vpa || (p.phone && `+91 ${p.phone}`) || 'No contact details'}</span>
                  </span>
                  {p.owed > 0 && <span className="num" style={{ color: 'var(--lime)' }}>{rupees(p.owed)}</span>}
                  <ChevronRight size={18} strokeWidth={2.5} className="chev" />
                </button>
              ))}
            </div>
          ) : (
            <Empty title={q ? 'No one found' : 'Add your people'} text={q ? `Nothing matches "${query}".` : 'Save roommates and friends once with their UPI ID and phone. Then split and ask with a tap.'}
              action={!q ? ADD.people : undefined} onAction={add} />
          )) : view === 'groups' ? (
            <>
              {groups.length ? (
                <div className="list wide">
                  {groups.map((g) => (
                    <button key={g.id} className="item" onClick={() => setGroupEdit(g)}>
                      <span className="mini-icon" style={{ width: 40, height: 40, borderRadius: 12 }}><Users size={19} /></span>
                      <span className="grow">
                        <span className="ellipsis" style={{ display: 'block', fontWeight: 500 }}>{g.name}</span>
                        <span className="sub ellipsis" style={{ display: 'block', fontSize: 14 }}>{g.memberIds.map((id) => nameOf(id).split(' ')[0]).join(', ') || 'No one yet'}</span>
                      </span>
                      {faces(g.memberIds)}
                      <ChevronRight size={18} strokeWidth={2.5} className="chev" />
                    </button>
                  ))}
                </div>
              ) : <Empty title="No groups yet" text="Make Roommates for rent, wifi and groceries, then pick it whenever you split." action={ADD.groups} onAction={add} />}
              <button className="item card links" onClick={() => setLinksOpen(true)}>
                <span className="mini-icon lime"><Link2 size={17} /></span>
                <span className="grow"><b style={{ fontWeight: 600 }}>Split links</b><br /><span className="sub">One link for the room: who owes what this month</span></span>
                <ChevronRight size={18} strokeWidth={2.5} className="chev" />
              </button>
            </>
          ) : trips.length ? (
            <div className="list wide">
              {trips.map((t) => {
                const owed = t.owed.reduce((a, x) => a + x.amount, 0);
                return (
                  <button key={t.name} className="item" onClick={() => { haptic(); setTrip(t.name); }}>
                    <span className="mini-icon" style={{ width: 40, height: 40, borderRadius: 12 }}><Luggage size={19} /></span>
                    <span className="grow">
                      <span className="ellipsis" style={{ display: 'block', fontWeight: 500 }}>{t.name}</span>
                      <span className="sub ellipsis" style={{ display: 'block', fontSize: 14 }}>
                        {[`You + ${t.people.length}`, `${rupees(t.spent)} spent`, owed && `${rupees(owed)} owed`].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    {faces(t.people)}
                    <ChevronRight size={18} strokeWidth={2.5} className="chev" />
                  </button>
                );
              })}
            </div>
          ) : <Empty title="No trips or events yet" text="Make one for a trip, a party or a dinner: add who's coming, then every expense splits between you." action={ADD.trips} onAction={add} />}
        </section>
      </div>

      {open && <PersonSheet p={open} groups={all} onClose={() => setOpenId(null)} onEdit={() => { setEditing(open); setOpenId(null); }} />}
      {editing && <PersonForm person={editing} onClose={() => setEditing(null)} />}
      {groupEdit && <GroupForm group={groupEdit} onClose={(name) => { const wasTrip = groupEdit.trip; setGroupEdit(null); if (wasTrip && name) setTrip(name); }} />}
      {trip && <TripSheet key={trip} name={trip} onClose={() => setTrip(null)} onEdit={() => editTrip(trip)} />}
      {linksOpen && <ShareLinks onClose={() => setLinksOpen(false)} />}

      <style jsx>{`
        .owed { border-radius: 30px; padding: 20px 22px; margin-bottom: 14px; background: var(--card); box-shadow: inset 0 0 0 .5px rgb(255 255 255 / .06); }
        .owed .num { color: var(--lime); }
        .lbl { font-size: 14px; color: var(--sub); }
        .page :global(.stackav) { display: flex; }
        .page :global(.stackav .av) { box-shadow: 0 0 0 2px var(--card); }
        .page :global(.stackav .av + .av) { margin-left: -8px; }
        .links { margin-top: 14px; padding: 12px 16px; gap: 12px; }
        /* UISearchBar, iOS 26 capsule */
        .search { display: flex; align-items: center; gap: 8px; background: var(--raised); border-radius: 999px; padding: 0 14px; min-height: 40px; margin-bottom: 14px; color: var(--sub); }
        .search input { flex: 1; font-size: 17px; padding: 8px 0; color: var(--ink); }
        .search input::-webkit-search-cancel-button { display: none; }
      `}</style>
    </div>
  );
}

function Empty({ title, text, action, onAction }: { title: string; text: string; action?: string; onAction: () => void }) {
  return (
    <div className="card center" style={{ padding: '32px 22px', display: 'grid', gap: 6, justifyItems: 'center' }}>
      <p style={{ fontWeight: 600, fontSize: 20 }}>{title}</p>
      <p className="sub" style={{ maxWidth: 300 }}>{text}</p>
      {action && <button className="btn lime" style={{ marginTop: 12, width: 'auto' }} onClick={onAction}><Plus size={18} /> {action}</button>}
    </div>
  );
}
