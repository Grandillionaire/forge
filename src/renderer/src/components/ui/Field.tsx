import type { ReactNode } from 'react';
import clsx from 'clsx';

interface FieldProps {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Field({ label, hint, children, className }: FieldProps) {
  return (
    <div className={clsx('flex flex-col', className)}>
      <span className="label-eyebrow">{label}</span>
      {children}
      {hint && <div className="text-[11px] text-forge-text/50 mt-1.5">{hint}</div>}
    </div>
  );
}

interface SelectProps<T extends string | number> {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string; sub?: string }>;
}

export function Select<T extends string | number>({ value, onChange, options }: SelectProps<T>) {
  return (
    <div className="relative">
      <select
        value={value as string | number}
        onChange={(e) => {
          const raw = e.target.value;
          const t = typeof options[0]?.value === 'number' ? Number(raw) : raw;
          onChange(t as T);
        }}
        className="input-base appearance-none pr-9 cursor-pointer"
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}{o.sub ? ` — ${o.sub}` : ''}
          </option>
        ))}
      </select>
      <svg
        viewBox="0 0 12 8"
        className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-2 text-forge-text/55 pointer-events-none"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M1 1.5l5 5 5-5" />
      </svg>
    </div>
  );
}

interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  bookends?: [string, string, string];
}

export function Slider({ value, min, max, step = 1, onChange, bookends }: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <input
        type="range"
        className="slider"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ '--val': `${pct}%` } as React.CSSProperties}
      />
      {bookends && (
        <div className="flex justify-between text-[9px] text-forge-text/40 mt-2 uppercase tracking-wider2">
          <span>{bookends[0]}</span>
          <span>{bookends[1]}</span>
          <span>{bookends[2]}</span>
        </div>
      )}
    </div>
  );
}

interface ToggleProps {
  on: boolean;
  onChange: (v: boolean) => void;
  label?: ReactNode;
}

export function Toggle({ on, onChange, label }: ToggleProps) {
  return (
    <label className="flex items-center gap-3 cursor-pointer select-none">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        data-on={on}
        className="toggle"
      />
      {label && <span className="text-[13px] text-forge-text/85">{label}</span>}
    </label>
  );
}
