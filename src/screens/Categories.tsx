'use client';
import { ChevronRight, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import CatIcon from '@/components/CatIcon';
import Sheet from '@/components/Sheet';
import { addCategory, addSubcategory, catMap, db, deleteCategory, deleteSubcategory, renameCategory, renameSubcategory, subcategoriesFor } from '@/lib/db';
import { ask, toast } from '@/lib/ui';

const uses = (cat: string, sub?: string) => db.txns.filter((t) => t.category === cat && (sub === undefined || t.subcategory === sub)).length;
const times = (n: number) => `${n} payment${n === 1 ? '' : 's'}`;

// Your categories and their subcategories: add, rename (payments follow) and delete.
export default function Categories({ onClose }: { onClose: () => void }) {
  const map = catMap();
  const [open, setOpen] = useState<string | null>(null);
  const [name, setName] = useState('');
  const taken = Object.keys(map).some((c) => c.toLowerCase() === name.trim().toLowerCase());

  function add() {
    if (!name.trim() || taken) return;
    addCategory(name);
    toast(`${name.trim()} added`);
    setName('');
  }

  return (
    <>
      <Sheet full title="Categories" onClose={onClose}>
        <div className="list wide">
          {Object.entries(map).map(([cat, subs]) => (
            <button key={cat} className="item" onClick={() => setOpen(cat)}>
              <CatIcon cat={cat} size={40} />
              <span className="grow" style={{ minWidth: 0 }}>
                <span className="ellipsis" style={{ display: 'block' }}>{cat}</span>
                <span className="sub ellipsis" style={{ display: 'block', fontSize: 14 }}>{subs.length ? subs.join(', ') : 'No subcategories'}</span>
              </span>
              <span className="sub num" style={{ fontSize: 14 }}>{uses(cat) || ''}</span>
              <ChevronRight size={18} strokeWidth={2.5} className="chev" />
            </button>
          ))}
        </div>
        <div className="list" style={{ marginTop: 14 }}>
          <div className="item">
            <span className="mini-icon lime"><Plus size={17} /></span>
            <input className="grow" style={{ padding: '8px 0' }} value={name} onChange={(e) => setName(e.target.value)} maxLength={30}
              onKeyDown={(e) => { if (e.key === 'Enter') add(); }} placeholder="New category" aria-label="New category" autoCapitalize="words" />
            {name.trim() && <button className="link" disabled={taken} onClick={add}>{taken ? 'Exists' : 'Add'}</button>}
          </div>
        </div>
      </Sheet>
      {open && <CategoryEdit key={open} cat={open} onClose={() => setOpen(null)} onRenamed={setOpen} />}
    </>
  );
}

function CategoryEdit({ cat, onClose, onRenamed }: { cat: string; onClose: () => void; onRenamed: (name: string) => void }) {
  const [title, setTitle] = useState(cat);
  const [sub, setSub] = useState('');
  const subs = subcategoriesFor(cat);
  const n = uses(cat);

  function rename() {
    if (title.trim() === cat) return;
    if (renameCategory(cat, title)) { toast(`Renamed to ${title.trim()}`); onRenamed(title.trim()); }
    else { toast('That name is taken'); setTitle(cat); }
  }
  function add() {
    if (!sub.trim()) return;
    addSubcategory(cat, sub);
    setSub('');
  }
  async function remove() {
    if (!(await ask(`Delete ${cat}?`, n ? `Its ${times(n)} move to Other.` : 'Nothing uses it yet.', 'Delete', true))) return;
    deleteCategory(cat);
    toast(`${cat} deleted`);
    onClose();
  }

  return (
    <Sheet title={cat} onClose={onClose}>
      <div className="list">
        <div className="field"><label htmlFor="cat-name">Name</label>
          <input id="cat-name" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={rename} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            maxLength={30} disabled={cat === 'Other'} /></div>
      </div>
      <p className="hint">{cat === 'Other' ? 'Other is where payments go when their category is deleted, so it stays.' : `${times(n)} use it; renaming changes them too.`}</p>

      <h3 className="eyebrow">Subcategories</h3>
      <div className="list">
        {subs.map((s) => <SubRow key={s} cat={cat} sub={s} />)}
        <div className="item">
          <span className="mini-icon lime"><Plus size={17} /></span>
          <input className="grow" style={{ padding: '8px 0' }} value={sub} onChange={(e) => setSub(e.target.value)} maxLength={30}
            onKeyDown={(e) => { if (e.key === 'Enter') add(); }} placeholder="New subcategory" aria-label="New subcategory" autoCapitalize="words" />
          {sub.trim() && <button className="link" onClick={add}>Add</button>}
        </div>
      </div>
      {cat !== 'Other' && <button className="btn danger" style={{ marginTop: 24 }} onClick={remove}><Trash2 size={18} /> Delete category</button>}
    </Sheet>
  );
}

// Edit the name in place (saved when you leave the field); the bin deletes it.
function SubRow({ cat, sub }: { cat: string; sub: string }) {
  const [v, setV] = useState(sub);
  function commit() {
    if (v.trim() === sub) return;
    if (!renameSubcategory(cat, sub, v)) { toast(v.trim() ? 'That name is taken' : "A name can't be empty"); setV(sub); }
  }
  async function remove() {
    const n = uses(cat, sub);
    if (await ask(`Delete ${sub}?`, n ? `Its ${times(n)} stay in ${cat}, with no subcategory.` : 'Nothing uses it yet.', 'Delete', true)) deleteSubcategory(cat, sub);
  }
  return (
    <div className="item">
      <input className="grow" style={{ padding: '8px 0' }} value={v} onChange={(e) => setV(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} maxLength={30} aria-label={`Rename ${sub}`} />
      <button className="icon-btn plain" aria-label={`Delete ${sub}`} onClick={remove} style={{ color: 'var(--red)' }}><Trash2 size={17} /></button>
    </div>
  );
}
