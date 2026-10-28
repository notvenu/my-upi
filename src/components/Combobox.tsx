'use client';
import { Check, ChevronDown, Plus, X } from 'lucide-react';
import { useId, useRef, useState } from 'react';

// A searchable dropdown: one value, or several (multiple) shown as small pills. Keyboard: ↑ ↓ Enter Esc.
// Short lists don't open the phone keyboard; onAdd offers "Add …" for text that matches nothing.
type Opt<T> = { value: T; label: string; hint?: string };
type Props<T> = {
  options: Opt<T>[]; label: string; placeholder?: string; onAdd?: (text: string) => T | void; addLabel?: string;
} & ({ multiple?: false; value: T | null; onChange: (v: T) => void } | { multiple: true; values: T[]; onChange: (v: T[]) => void });

export default function Combobox<T>(props: Props<T>) {
  const { options, label, placeholder = 'Choose', onAdd, addLabel = 'Add' } = props;
  const id = useId();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const searchable = options.length > 7 || !!onAdd;
  const values = props.multiple ? props.values : [];
  const isSel = (o: Opt<T>) => (props.multiple ? values.includes(o.value) : props.value === o.value);
  const current = props.multiple ? undefined : options.find((o) => o.value === props.value);
  const picked = options.filter((o) => values.includes(o.value));
  const shown = options.filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 60);
  const canAdd = !!onAdd && !!q.trim() && !options.some((o) => o.label.toLowerCase() === q.trim().toLowerCase());

  const show = () => { if (!open) { setOpen(true); setQ(''); setActive(Math.max(0, options.findIndex(isSel))); } };
  const close = () => { setOpen(false); setQ(''); };
  const setValues = (v: T[]) => { if (props.multiple) props.onChange(v); };
  function pick(o: Opt<T>) {
    if (props.multiple) setValues(isSel(o) ? values.filter((v) => v !== o.value) : [...values, o.value]);
    else { props.onChange(o.value); close(); }
    setQ('');
  }
  function add() {
    const v = onAdd?.(q.trim());
    if (v !== undefined) {
      if (props.multiple) setValues([...values, v as T]);
      else props.onChange(v as T);
    }
    if (props.multiple) setQ(''); else close();
  }
  function key(e: React.KeyboardEvent) {
    const n = shown.length + (canAdd ? 1 : 0);
    if (e.key === 'ArrowDown') { e.preventDefault(); show(); setActive((active + 1) % Math.max(1, n)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); show(); setActive((active - 1 + n) % Math.max(1, n)); }
    else if (e.key === 'Enter' && open) { e.preventDefault(); if (active < shown.length) pick(shown[active]); else if (canAdd) add(); }
    else if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); close(); } // close the list, not the sheet
    else if (e.key === 'Backspace' && props.multiple && !q && values.length) setValues(values.slice(0, -1));
  }

  return (
    <div className={`combo${open ? ' open' : ''}`} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) close(); }}>
      <div className="field" onClick={() => { input.current?.focus(); show(); }}>
        {picked.map((o) => (
          <span key={String(o.value)} className="pill">{o.label}
            <button type="button" tabIndex={-1} aria-label={`Remove ${o.label}`} onClick={(e) => { e.stopPropagation(); pick(o); }}><X size={13} /></button>
          </span>
        ))}
        <input ref={input} role="combobox" aria-expanded={open} aria-controls={id} aria-autocomplete="list" aria-label={label}
          aria-activedescendant={open ? `${id}-${active}` : undefined} autoComplete="off" readOnly={!searchable}
          value={open ? q : props.multiple ? '' : current?.label ?? ''}
          placeholder={props.multiple && picked.length ? '' : open && searchable ? 'Search' : placeholder}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }} onFocus={show} onKeyDown={key} />
        <ChevronDown size={18} className="faint chev-d" />
      </div>
      {open && (
        <ul role="listbox" id={id} aria-label={label} aria-multiselectable={props.multiple || undefined}>
          {shown.map((o, i) => (
            <li key={String(o.value)} role="option" id={`${id}-${i}`} aria-selected={isSel(o)}>
              <button type="button" tabIndex={-1} className={i === active ? 'active' : ''} onClick={() => pick(o)}>
                <span className="grow ellipsis">{o.label}{o.hint && <span className="sub hint-txt"> · {o.hint}</span>}</span>
                {isSel(o) && <Check size={17} style={{ color: 'var(--lime)' }} />}
              </button>
            </li>
          ))}
          {canAdd ? (
            <li role="option" id={`${id}-${shown.length}`} aria-selected="false">
              <button type="button" tabIndex={-1} className={`add${active === shown.length ? ' active' : ''}`} onClick={add}><Plus size={17} /> {addLabel} “{q.trim()}”</button>
            </li>
          ) : !shown.length && <li className="empty sub">No matches</li>}
        </ul>
      )}
      <style jsx>{`
        .combo { position: relative; }
        .field { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-height: 50px; padding: 6px 12px 6px 16px; border-radius: 16px;
          background: var(--card); cursor: pointer; box-shadow: inset 0 0 0 .5px rgb(255 255 255 / .05); }
        .open .field { box-shadow: inset 0 0 0 1.5px var(--lime); }
        .field input { flex: 1; min-width: 80px; font-size: 16px; padding: 8px 0; cursor: inherit; background: none; }
        .field :global(.chev-d) { flex-shrink: 0; margin-left: auto; transition: transform .25s var(--ease); }
        .open .field :global(.chev-d) { transform: rotate(180deg); }
        .pill { display: inline-flex; align-items: center; gap: 2px; padding: 4px 4px 4px 10px; border-radius: 999px; background: var(--raised); font-size: 14px; font-weight: 500; }
        .pill button { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; color: var(--sub); }
        /* in the flow (not floating) so a sheet's scroll area never clips it */
        ul { list-style: none; margin: 6px 0 0; padding: 4px; border-radius: 16px; background: var(--raised); max-height: 264px; overflow-y: auto;
          animation: drop .18s var(--ease); }
        @keyframes drop { from { opacity: 0; transform: translateY(-4px); } }
        li button { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 44px; padding: 0 12px; border-radius: 12px; text-align: left; font-size: 16px; }
        li button.active, li button:hover { background: var(--pressed); }
        .add { color: var(--lime); font-weight: 600; }
        .hint-txt { font-size: 14px; }
        .empty { padding: 12px; }
      `}</style>
    </div>
  );
}
