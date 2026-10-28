'use client';
import { Luggage, Trash2, Users } from 'lucide-react';
import { useState } from 'react';
import { deleteGroup, listGroups, listPeople, saveGroup, savePerson, type Group } from '@/lib/db';
import { ask, toast } from '@/lib/ui';
import Combobox from './Combobox';
import Sheet from './Sheet';

// New or edit a group (Roommates) or a trip / event (Goa trip): a name and its people, picked in one place.
// Typing a name nobody has adds them as a new person (phone and UPI ID can come later).
export default function GroupForm({ group: g, onClose }: { group: Partial<Group>; onClose: (name?: string) => void }) {
  const [name, setName] = useState(g.name ?? '');
  const [memberIds, setMemberIds] = useState<number[]>(g.memberIds ?? []);
  const people = listPeople();
  const kind = g.trip ? 'trip' : 'group';
  const taken = listGroups().some((x) => x.id !== g.id && x.name.toLowerCase() === name.trim().toLowerCase());

  function save() {
    if (!name.trim() || taken) return;
    saveGroup({ id: g.id, name, memberIds, trip: g.trip });
    toast(g.id ? `${name.trim()} saved` : `${name.trim()} created`);
    onClose(name.trim());
  }
  async function remove() {
    const text = g.trip ? 'Its payments and splits are kept, still tagged with it.' : 'The people in it are kept.';
    if (!(await ask(`Delete ${g.name}?`, text, 'Delete', true))) return;
    deleteGroup(g.id!);
    toast(`${g.name} deleted`);
    onClose();
  }

  return (
    <Sheet title={g.id ? `Edit ${kind}` : g.trip ? 'New trip or event' : 'New group'} onClose={() => onClose()}
      footer={<button className="btn" disabled={!name.trim() || taken} onClick={save}>{g.id ? 'Save' : `Create ${kind}`}</button>}>
      <div className="center" style={{ marginBottom: 16 }}>
        <span className="mini-icon lime" style={{ width: 64, height: 64, borderRadius: 20, margin: '0 auto' }}>{g.trip ? <Luggage size={28} /> : <Users size={28} />}</span>
      </div>
      <div className="list">
        <div className="field"><label htmlFor="gf-name">Name</label>
          <input id="gf-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoCapitalize="words" data-autofocus={!g.id || undefined}
            placeholder={g.trip ? 'Goa trip, Rahul’s birthday' : 'Roommates, Office'} onKeyDown={(e) => e.key === 'Enter' && save()} /></div>
      </div>
      {taken && <p className="hint" style={{ color: 'var(--red)' }}>You already have one called that</p>}

      <h3 className="eyebrow">Who&apos;s in it</h3>
      <Combobox multiple label="People" placeholder="Pick people, or type a new name" options={people.map((p) => ({ value: p.id, label: p.name }))}
        values={memberIds} onChange={setMemberIds} addLabel="Add person" onAdd={(n) => savePerson({ name: n, phone: '', vpa: '' }, [])} />
      <p className="hint">
        {g.trip ? 'Payments you add to this trip split between you and them. You count too, no need to add yourself.'
          : 'Pick the whole group in one tap when you split, like Roommates for rent and groceries.'}
      </p>

      {g.id && <button className="btn danger" style={{ marginTop: 28 }} onClick={remove}><Trash2 size={18} /> Delete {kind}</button>}
    </Sheet>
  );
}
