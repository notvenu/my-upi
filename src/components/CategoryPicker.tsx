'use client';
import { addSubcategory, subcategoriesFor } from '@/lib/db';
import { CATEGORIES } from '@/lib/upi';
import CatIcon from './CatIcon';
import Combobox from './Combobox';

// Category, then one of its subcategories (type to search, or add your own).
export default function CategoryPicker({ category, subcategory, onChange }: {
  category: string; subcategory: string | null; onChange: (category: string, subcategory: string | null) => void;
}) {
  const cats = CATEGORIES.map((c) => ({ value: c as string, label: c }));
  const subs = [{ value: null as string | null, label: 'None' }, ...subcategoriesFor(category).map((s) => ({ value: s as string | null, label: s }))];
  return (
    <div className="pick">
      <CatIcon cat={category} size={50} />
      <div className="two">
        <Combobox label="Category" options={cats} value={category} onChange={(c) => onChange(c, c === category ? subcategory : null)} />
        <Combobox label={`${category} subcategory`} placeholder="Subcategory" options={subs} value={subcategory} addLabel="Add"
          onChange={(s) => onChange(category, s)} onAdd={(n) => { addSubcategory(category, n); return n; }} />
      </div>
      <style jsx>{`
        .pick { display: flex; gap: 10px; align-items: flex-start; }
        .two { flex: 1; min-width: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; }
      `}</style>
    </div>
  );
}
