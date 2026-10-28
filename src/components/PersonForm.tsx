'use client';
import { useState } from 'react';
import { addGroup, deletePerson, listGroups, savePerson, type Person } from '@/lib/db';
import { ask, phoneError, toast, vpaError } from '@/lib/ui';
import Avatar from './Avatar';
import Combobox from './Combobox';
import Sheet from './Sheet';

// New or edit person: name, phone (for WhatsApp), UPI ID (to pay them), groups.
export default function PersonForm({ person: p, onClose }: { person: Partial<Person>; onClose: (id?: number) => void }) {
  const [name, setName] = useState(p.name ?? '');
  const [phone, setPhone] = useState(p.phone ?? '');
  const [vpa, setVpa] = useState(p.vpa ?? '');
  const [groupIds, setGroupIds] = useState<number[]>(p.groupIds ?? []);
  const [tried, setTried] = useState(false);
  const groups = listGroups();
  const errors = { name: !name.trim() ? 'Enter a name' : undefined, phone: phoneError(phone), vpa: vpaError(vpa) };

  function save() {
    setTried(true);
    if (errors.name || errors.phone || errors.vpa) return;
    const id = savePerson({ id: p.id, name, phone, vpa }, groupIds);
    toast(p.id ? `${name.trim()} updated` : `${name.trim()} added`);
    onClose(id);
  }
  function addNewGroup(n: string) {
    addGroup(n);
    return listGroups().find((x) => x.name.toLowerCase() === n.toLowerCase())?.id;
  }
  async function remove() {
    if (!(await ask(`Delete ${p.name}?`, 'Their past splits stay in your history.', 'Delete', true))) return;
    deletePerson(p.id!);
    toast(`${p.name} deleted`);
    onClose();
  }

  return (
    <Sheet title={p.id ? 'Edit person' : 'New person'} onClose={() => onClose()}>
      <div className="center" style={{ marginBottom: 18 }}><Avatar name={name || '?'} size={76} /></div>
      <div className="list">
        <div>
          <div className="field"><label htmlFor="pf-name">Name</label>
            <input id="pf-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Rahul Sharma" autoCapitalize="words" data-autofocus={!p.id || undefined} /></div>
          {tried && errors.name && <p className="err">{errors.name}</p>}
        </div>
        <div>
          <div className="field"><label htmlFor="pf-phone">Phone</label>
            <input id="pf-phone" value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" maxLength={14} placeholder="98765 43210" /></div>
          {(tried || phone.length >= 10) && errors.phone && <p className="err">{errors.phone}</p>}
        </div>
        <div>
          <div className="field"><label htmlFor="pf-vpa">UPI ID</label>
            <input id="pf-vpa" value={vpa} onChange={(e) => setVpa(e.target.value)} autoCapitalize="none" autoComplete="off" spellCheck={false} inputMode="email" placeholder="rahul@okaxis" /></div>
          {(tried || vpa.includes('@')) && errors.vpa && <p className="err">{errors.vpa}</p>}
        </div>
      </div>
      <p className="hint">Phone is for WhatsApp requests, UPI ID for paying them.</p>

      <h3 className="eyebrow">Groups</h3>
      <Combobox multiple label="Groups" placeholder="Roommates, Office…" options={groups.map((g) => ({ value: g.id, label: g.name }))}
        values={groupIds} onChange={setGroupIds} onAdd={addNewGroup} addLabel="New group" />

      <div className="stack" style={{ marginTop: 24 }}>
        <button className="btn" onClick={save}>{p.id ? 'Save changes' : 'Save person'}</button>
        {p.id && <button className="btn danger" onClick={remove}>Delete person</button>}
      </div>
    </Sheet>
  );
}
