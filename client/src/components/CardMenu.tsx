import { useState, useRef, useEffect } from 'react';

export interface CardMenuItem {
  label: string;
  onSelect: () => void;
  destructive?: boolean;
}

export function CardMenu({ items }: { items: CardMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div className="relative" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="More actions"
        className="p-1.5 rounded-md hover:bg-neutral-100 text-neutral-500 text-lg leading-none"
      >
        ⋮
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 bg-white rounded-xl shadow-lg border border-neutral-200 min-w-[180px] overflow-hidden">
          {items.map((item, i) => (
            <button
              key={i}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={
                'w-full text-left px-3 py-2 text-sm hover:bg-neutral-50 ' +
                (item.destructive ? 'text-bad' : 'text-neutral-700')
              }
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
