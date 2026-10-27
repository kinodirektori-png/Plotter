import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import type { Value } from '../types/simulation';

export function Button({ className = '', variant = 'default', ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'primary' | 'ghost' | 'danger' }) {
  const styles = {
    default: 'border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200',
    primary: 'bg-cyan-600 hover:bg-cyan-500 text-white',
    ghost: 'hover:bg-slate-700 text-slate-300',
    danger: 'hover:bg-rose-900/60 text-rose-400',
  }[variant];
  return (
    <button
      type="button"
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition disabled:opacity-40 ${styles} ${className}`}
      {...p}
    />
  );
}

export function IconButton({ title, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { title: string }) {
  return <Button variant="ghost" className="!p-1" title={title} aria-label={title} {...p} />;
}

export function Input({ className = '', ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full min-w-0 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 ${className}`}
      {...p}
    />
  );
}

export function Select({ className = '', children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`rounded-md border border-slate-700 bg-slate-900 px-1.5 py-1 text-sm outline-none focus:border-cyan-500 ${className}`}
      {...p}
    >
      {children}
    </select>
  );
}

export function Field({ label, children, hint, className = '' }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-0.5 block text-xs font-medium text-slate-400">{label}</span>
      {children}
      {hint && <span className="mt-0.5 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-slate-800 bg-slate-900 p-3 shadow-sm ${className}`}>{children}</div>;
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; icon?: ReactNode }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="flex gap-0.5 overflow-x-auto border-b border-slate-800 px-2" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={`flex shrink-0 items-center gap-1 border-b-2 px-2 py-2 text-xs font-medium ${
            value === t.id ? 'border-cyan-600 text-cyan-300' : 'border-transparent text-slate-400 hover:text-slate-100'
          }`}
        >
          {t.icon}
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** "true" -> true, "3" -> 3, anything else stays a string. */
export function inferValue(raw: string): Value {
  const t = raw.trim();
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t !== '' && Number.isFinite(Number(t))) return Number(t);
  return raw;
}

export function formatValue(v: Value | undefined): string {
  if (v === undefined) return '—';
  return String(v);
}
