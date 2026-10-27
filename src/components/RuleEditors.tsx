import { Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { MutationAction, Operator, Precondition, StateMutation, Value } from '../types/simulation';
import { Button, IconButton, Input, Select, inferValue } from './ui';

const OPERATORS: Operator[] = ['==', '!=', '>', '<', '>=', '<=', 'contains'];
const ACTIONS: MutationAction[] = ['set', 'increment', 'decrement', 'toggle'];

/** Text box that keeps what you type (e.g. "1.") and emits an inferred typed value. */
export function ValueInput({ value, onChange, placeholder }: { value: Value | undefined; onChange: (v: Value) => void; placeholder?: string }) {
  const [raw, setRaw] = useState(value === undefined ? '' : String(value));
  useEffect(() => {
    if (value === undefined) return;
    if (inferValue(raw) !== value) setRaw(String(value));
  }, [value]);
  return (
    <Input
      value={raw}
      placeholder={placeholder ?? 'value'}
      onChange={(e) => {
        setRaw(e.target.value);
        onChange(inferValue(e.target.value));
      }}
    />
  );
}

export function VarInput({ value, onChange, keys }: { value: string; onChange: (v: string) => void; keys: string[] }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className="min-w-0 flex-1">
      {!keys.includes(value) && <option value={value}>{value || '(pick variable)'}</option>}
      {keys.map((k) => (
        <option key={k} value={k}>
          {k}
        </option>
      ))}
    </Select>
  );
}

export function PreconditionList({ items, onChange, keys, label = 'Only if', emptyText = 'Always eligible' }: { items: Precondition[]; onChange: (p: Precondition[]) => void; keys: string[]; label?: string; emptyText?: string }) {
  const set = (i: number, patch: Partial<Precondition>) => onChange(items.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-400">{label}</span>
        <Button variant="ghost" className="!px-1 !py-0.5 text-xs" onClick={() => onChange([...items, { variableId: keys[0] ?? '', operator: '==', value: true }])}>
          <Plus size={12} /> condition
        </Button>
      </div>
      {items.length === 0 && <p className="text-xs italic text-slate-500">{emptyText}</p>}
      {items.map((p, i) => (
        <div key={i} className="flex items-center gap-1">
          <VarInput value={p.variableId} keys={keys} onChange={(v) => set(i, { variableId: v })} />
          <Select value={p.operator} onChange={(e) => set(i, { operator: e.target.value as Operator })}>
            {OPERATORS.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </Select>
          <div className="w-20 shrink-0">
            <ValueInput value={p.value} onChange={(v) => set(i, { value: v })} />
          </div>
          <IconButton title="Remove condition" onClick={() => onChange(items.filter((_, j) => j !== i))}>
            <X size={14} />
          </IconButton>
        </div>
      ))}
    </div>
  );
}

export function MutationList({ items, onChange, keys, label = 'Then' }: { items: StateMutation[]; onChange: (m: StateMutation[]) => void; keys: string[]; label?: string }) {
  const set = (i: number, patch: Partial<StateMutation>) => onChange(items.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-400">{label}</span>
        <Button variant="ghost" className="!px-1 !py-0.5 text-xs" onClick={() => onChange([...items, { variableId: keys[0] ?? '', action: 'set', value: true }])}>
          <Plus size={12} /> change
        </Button>
      </div>
      {items.length === 0 && <p className="text-xs italic text-slate-500">Changes nothing</p>}
      {items.map((m, i) => (
        <div key={i} className="flex items-center gap-1">
          <VarInput value={m.variableId} keys={keys} onChange={(v) => set(i, { variableId: v })} />
          <Select value={m.action} onChange={(e) => set(i, { action: e.target.value as MutationAction })}>
            {ACTIONS.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </Select>
          <div className="w-20 shrink-0">
            {m.action === 'toggle' ? (
              <span className="block px-2 text-xs text-slate-500">flip</span>
            ) : (
              <ValueInput value={m.value} placeholder={m.action === 'set' ? 'value' : '1'} onChange={(v) => set(i, { value: v })} />
            )}
          </div>
          <IconButton title="Remove change" onClick={() => onChange(items.filter((_, j) => j !== i))}>
            <X size={14} />
          </IconButton>
        </div>
      ))}
    </div>
  );
}
