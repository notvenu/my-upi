'use client';
import { Luggage } from 'lucide-react';
import { useState } from 'react';
import { listTrips } from '@/lib/db';
import Combobox from './Combobox';

// Optional trip or event tag; picking from ones already used keeps spellings consistent.
export default function TripField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [made, setMade] = useState<string[]>([]);
  const trips = [...new Set([...made, ...listTrips()])];
  const options = [{ value: '', label: 'No trip' }, ...trips.map((t) => ({ value: t, label: t }))];
  return (
    <div className="item trip">
      <span className="mini-icon"><Luggage size={17} /></span>
      <div className="grow" style={{ minWidth: 0 }}>
        <Combobox label="Trip or event" placeholder="Trip or event (optional)" options={options} value={value || null} onChange={onChange}
          addLabel="New trip" onAdd={(t) => { const v = t.slice(0, 40); setMade([...made, v]); return v; }} />
      </div>
      <style jsx>{`
        .trip { align-items: flex-start; }
        .trip :global(.field) { background: var(--bg); }
      `}</style>
    </div>
  );
}
