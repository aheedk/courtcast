import { useState, useRef, useEffect } from 'react';

interface Props {
  initialValue: string;
  placeholder?: string;
  maxLength?: number;
  onSave: (value: string) => void;
  onCancel: () => void;
}

export function RenameInput({ initialValue, placeholder, maxLength = 80, onSave, onCancel }: Props) {
  const [value, setValue] = useState(initialValue);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <input
      ref={ref}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onSave(value.trim());
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
      }}
      onBlur={() => onSave(value.trim())}
      onClick={(e) => e.stopPropagation()}
      placeholder={placeholder}
      maxLength={maxLength}
      className="px-2 py-1 border border-good rounded-md text-base font-bold w-full outline-none"
    />
  );
}
