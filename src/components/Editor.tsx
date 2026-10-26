import { Braces, ChevronDown, ChevronRight, GitFork, Plus, Settings2, Trash2, Users, Variable, Zap } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { parseConfigJson } from '../engine/schema';
import { stateKeys } from '../engine/state';
import type { Actor, DecisionChoice, DecisionNode, SimEvent, SimulationConfig, VariableType, WorldVariable } from '../types/simulation';
import { MutationList, PreconditionList, ValueInput } from './RuleEditors';
import { Button, Card, Field, IconButton, Input, Select, Tabs } from './ui';

type Tab = 'variables' | 'actors' | 'events' | 'decisions' | 'settings' | 'json';

interface Props {
  config: SimulationConfig;
  onChange: (c: SimulationConfig) => void;
}

function uniqueId(prefix: string, taken: string[]): string {
  let i = taken.length + 1;
  while (taken.includes(`${prefix}_${i}`)) i++;
  return `${prefix}_${i}`;
}

export function Editor({ config, onChange }: Props) {
  const [tab, setTab] = useState<Tab>('events');
  const keys = stateKeys(config);
  const tabs = [
    { id: 'variables' as const, label: 'Variables', icon: <Variable size={13} /> },
    { id: 'actors' as const, label: 'Actors', icon: <Users size={13} /> },
    { id: 'events' as const, label: `Events (${config.events.length})`, icon: <Zap size={13} /> },
    { id: 'decisions' as const, label: `Choices (${config.decisions.length})`, icon: <GitFork size={13} /> },
    { id: 'settings' as const, label: 'Run', icon: <Settings2 size={13} /> },
    { id: 'json' as const, label: 'JSON', icon: <Braces size={13} /> },
  ];
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 px-3 py-2">
        <h2 className="text-sm font-semibold text-slate-700">Build your scenario</h2>
        <p className="text-xs text-slate-500">Edit variables, events and choices below. The graph and outcomes update as you type.</p>
      </div>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {tab === 'variables' && <VariablesTab config={config} onChange={onChange} />}
        {tab === 'actors' && <ActorsTab config={config} onChange={onChange} />}
        {tab === 'events' && <EventsTab config={config} onChange={onChange} keys={keys} />}
        {tab === 'decisions' && <DecisionsTab config={config} onChange={onChange} keys={keys} />}
        {tab === 'settings' && <SettingsTab config={config} onChange={onChange} />}
        {tab === 'json' && <JsonTab config={config} onChange={onChange} />}
      </div>
    </div>
  );
}

function Collapsible({ title, subtitle, children, onRemove, defaultOpen = false }: { title: string; subtitle?: string; children: ReactNode; onRemove: () => void; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className="!p-0">
      <div className="flex items-center gap-1 px-2 py-1.5">
        <button type="button" className="flex min-w-0 flex-1 items-center gap-1 text-left" onClick={() => setOpen(!open)}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span className="truncate text-sm font-medium">{title || '(untitled)'}</span>
          {subtitle && <span className="ml-auto shrink-0 pl-2 text-xs text-slate-400">{subtitle}</span>}
        </button>
        <IconButton title="Delete" onClick={onRemove}>
          <Trash2 size={14} />
        </IconButton>
      </div>
      {open && <div className="space-y-2 border-t border-slate-100 p-3">{children}</div>}
    </Card>
  );
}

function VariablesTab({ config, onChange }: Props) {
  const vars = config.variables ?? [];
  const set = (next: WorldVariable[]) => onChange({ ...config, variables: next });
  const patch = (i: number, p: Partial<WorldVariable>) => set(vars.map((v, j) => (j === i ? { ...v, ...p } : v)));
  const defaults: Record<VariableType, WorldVariable['initialValue']> = { boolean: false, number: 0, string: '' };
  return (
    <>
      <p className="text-xs text-slate-500">World variables make up the state. Events and choices read and change them.</p>
      {vars.map((v, i) => (
        <Card key={i} className="space-y-1.5">
          <div className="flex gap-1">
            <Input value={v.id} onChange={(e) => patch(i, { id: e.target.value })} placeholder="id" className="font-mono" />
            <Select value={v.type} onChange={(e) => patch(i, { type: e.target.value as VariableType, initialValue: defaults[e.target.value as VariableType] })}>
              <option>boolean</option>
              <option>number</option>
              <option>string</option>
            </Select>
            <IconButton title="Delete variable" onClick={() => set(vars.filter((_, j) => j !== i))}>
              <Trash2 size={14} />
            </IconButton>
          </div>
          <div className="flex gap-1">
            <Input value={v.name} onChange={(e) => patch(i, { name: e.target.value })} placeholder="Display name" />
            <div className="w-28 shrink-0">
              {v.type === 'boolean' ? (
                <Select className="w-full" value={String(v.initialValue)} onChange={(e) => patch(i, { initialValue: e.target.value === 'true' })}>
                  <option>true</option>
                  <option>false</option>
                </Select>
              ) : v.type === 'number' ? (
                <Input type="number" value={Number(v.initialValue)} onChange={(e) => patch(i, { initialValue: Number(e.target.value) })} />
              ) : (
                <Input value={String(v.initialValue)} onChange={(e) => patch(i, { initialValue: e.target.value })} />
              )}
            </div>
          </div>
        </Card>
      ))}
      <Button onClick={() => set([...vars, { id: uniqueId('var', vars.map((v) => v.id)), name: 'New variable', type: 'boolean', initialValue: false }])}>
        <Plus size={14} /> Add variable
      </Button>
    </>
  );
}

function ActorsTab({ config, onChange }: Props) {
  const set = (next: Actor[]) => onChange({ ...config, actors: next });
  const patch = (i: number, p: Partial<Actor>) => set(config.actors.map((a, j) => (j === i ? { ...a, ...p } : a)));
  return (
    <>
      <p className="text-xs text-slate-500">
        Actor attributes are state too. Reference them as <code className="font-mono">actorId.attribute</code>.
      </p>
      {config.actors.map((a, i) => {
        const attrs = Object.entries(a.statusAttributes);
        const setAttrs = (entries: [string, WorldVariable['initialValue']][]) => patch(i, { statusAttributes: Object.fromEntries(entries) });
        return (
          <Card key={i} className="space-y-1.5">
            <div className="flex gap-1">
              <Input value={a.id} onChange={(e) => patch(i, { id: e.target.value })} placeholder="id" className="font-mono" />
              <Input value={a.name} onChange={(e) => patch(i, { name: e.target.value })} placeholder="Name" />
              <IconButton title="Delete actor" onClick={() => set(config.actors.filter((_, j) => j !== i))}>
                <Trash2 size={14} />
              </IconButton>
            </div>
            {attrs.map(([k, v], j) => (
              <div key={j} className="flex gap-1 pl-3">
                <Input value={k} onChange={(e) => setAttrs(attrs.map((x, n) => (n === j ? [e.target.value, x[1]] : x)))} className="font-mono" />
                <ValueInput value={v} onChange={(val) => setAttrs(attrs.map((x, n) => (n === j ? [x[0], val] : x)))} />
                <IconButton title="Delete attribute" onClick={() => setAttrs(attrs.filter((_, n) => n !== j))}>
                  <Trash2 size={14} />
                </IconButton>
              </div>
            ))}
            <Button variant="ghost" className="ml-3 text-xs" onClick={() => setAttrs([...attrs, [uniqueId('attr', attrs.map((x) => x[0])), true]])}>
              <Plus size={12} /> attribute
            </Button>
          </Card>
        );
      })}
      <Button onClick={() => set([...config.actors, { id: uniqueId('actor', config.actors.map((a) => a.id)), name: 'New actor', statusAttributes: {} }])}>
        <Plus size={14} /> Add actor
      </Button>
    </>
  );
}

function EventsTab({ config, onChange, keys }: Props & { keys: string[] }) {
  const set = (next: SimEvent[]) => onChange({ ...config, events: next });
  const patch = (i: number, p: Partial<SimEvent>) => set(config.events.map((e, j) => (j === i ? { ...e, ...p } : e)));
  const [lastAdded, setLastAdded] = useState<number | null>(null);
  return (
    <>
      <p className="text-xs text-slate-500">
        Events can happen in any order once their conditions hold. Each step, eligible events compete in proportion to their probability.
      </p>
      {config.events.map((e, i) => (
        <Collapsible key={`${i}-${e.id}`} title={e.title} subtitle={`p=${e.probability}${e.repeatable ? ' ↻' : ''}`} onRemove={() => set(config.events.filter((_, j) => j !== i))} defaultOpen={lastAdded === i}>
          <div className="flex gap-1">
            <Field label="Title" className="min-w-0 flex-1">
              <Input value={e.title} onChange={(ev) => patch(i, { title: ev.target.value })} />
            </Field>
            <div className="w-32 shrink-0">
              <Field label="Id">
                <Input value={e.id} onChange={(ev) => patch(i, { id: ev.target.value })} className="font-mono" />
              </Field>
            </div>
          </div>
          <Field label="Description">
            <Input value={e.description ?? ''} onChange={(ev) => patch(i, { description: ev.target.value || undefined })} />
          </Field>
          <Field label={`Probability: ${(e.probability * 100).toFixed(1)}%`}>
            <div className="flex items-center gap-2">
              <input type="range" min={0} max={1} step={0.01} value={e.probability} onChange={(ev) => patch(i, { probability: Number(ev.target.value) })} className="flex-1 accent-indigo-600" />
              <Input type="number" min={0} max={1} step={0.01} value={e.probability} onChange={(ev) => patch(i, { probability: Math.min(1, Math.max(0, Number(ev.target.value))) })} className="!w-20" />
            </div>
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!e.repeatable} onChange={(ev) => patch(i, { repeatable: ev.target.checked })} className="accent-indigo-600" />
            Repeatable (can happen more than once)
          </label>
          <PreconditionList items={e.preconditions} keys={keys} onChange={(p) => patch(i, { preconditions: p })} />
          <MutationList items={e.mutations} keys={keys} onChange={(m) => patch(i, { mutations: m })} />
        </Collapsible>
      ))}
      <Button
        onClick={() => {
          setLastAdded(config.events.length);
          set([...config.events, { id: uniqueId('event', config.events.map((e) => e.id)), title: 'New event', probability: 0.3, preconditions: [], mutations: [] }]);
        }}
      >
        <Plus size={14} /> Add event
      </Button>
    </>
  );
}

function DecisionsTab({ config, onChange, keys }: Props & { keys: string[] }) {
  const set = (next: DecisionNode[]) => onChange({ ...config, decisions: next });
  const patch = (i: number, p: Partial<DecisionNode>) => set(config.decisions.map((d, j) => (j === i ? { ...d, ...p } : d)));
  const [lastAdded, setLastAdded] = useState<number | null>(null);
  return (
    <>
      <p className="text-xs text-slate-500">
        A decision happens once, as soon as its conditions hold. It takes the step and branches into every valid choice.
      </p>
      {config.decisions.map((d, i) => {
        const patchChoice = (j: number, p: Partial<DecisionChoice>) => patch(i, { choices: d.choices.map((c, n) => (n === j ? { ...c, ...p } : c)) });
        return (
          <Collapsible key={`${i}-${d.id}`} title={d.title} subtitle={`${d.choices.length} choices`} onRemove={() => set(config.decisions.filter((_, j) => j !== i))} defaultOpen={lastAdded === i}>
            <div className="flex gap-1">
              <Field label="Question" className="min-w-0 flex-1">
                <Input value={d.title} onChange={(ev) => patch(i, { title: ev.target.value })} />
              </Field>
              <div className="w-32 shrink-0">
                <Field label="Id">
                  <Input value={d.id} onChange={(ev) => patch(i, { id: ev.target.value })} className="font-mono" />
                </Field>
              </div>
            </div>
            <PreconditionList items={d.preconditions} keys={keys} onChange={(p) => patch(i, { preconditions: p })} label="Comes up when" />
            {d.choices.map((c, j) => (
              <div key={j} className="space-y-1.5 rounded-md border border-amber-200 bg-amber-50/50 p-2">
                <div className="flex gap-1">
                  <Input value={c.label} onChange={(ev) => patchChoice(j, { label: ev.target.value })} placeholder="Choice label" />
                  <Input value={c.id} onChange={(ev) => patchChoice(j, { id: ev.target.value })} className="!w-24 font-mono" />
                  <IconButton title="Delete choice" disabled={d.choices.length <= 1} onClick={() => patch(i, { choices: d.choices.filter((_, n) => n !== j) })}>
                    <Trash2 size={14} />
                  </IconButton>
                </div>
                <PreconditionList items={c.preconditions ?? []} keys={keys} onChange={(p) => patchChoice(j, { preconditions: p })} label="Available only if" />
                <MutationList items={c.mutations} keys={keys} onChange={(m) => patchChoice(j, { mutations: m })} />
              </div>
            ))}
            <Button variant="ghost" className="text-xs" onClick={() => patch(i, { choices: [...d.choices, { id: uniqueId('choice', d.choices.map((c) => c.id)), label: 'New choice', mutations: [] }] })}>
              <Plus size={12} /> choice
            </Button>
          </Collapsible>
        );
      })}
      <Button
        onClick={() => {
          setLastAdded(config.decisions.length);
          set([
            ...config.decisions,
            {
              id: uniqueId('decision', config.decisions.map((d) => d.id)),
              title: 'New decision',
              preconditions: [],
              choices: [
                { id: 'yes', label: 'Yes', mutations: [] },
                { id: 'no', label: 'No', mutations: [] },
              ],
            },
          ]);
        }}
      >
        <Plus size={14} /> Add decision
      </Button>
    </>
  );
}

function SettingsTab({ config, onChange }: Props) {
  const patch = (p: Partial<SimulationConfig>) => onChange({ ...config, ...p });
  const mc = config.mode === 'montecarlo';
  return (
    <div className="space-y-3">
      <Field label="Scenario title">
        <Input value={config.title ?? ''} onChange={(e) => patch({ title: e.target.value })} />
      </Field>
      <Field label="Mode" hint={mc ? 'Samples random paths. Fast for big scenarios; probabilities are estimates.' : 'Explores every branch exactly, merging identical states.'}>
        <Select className="w-full" value={config.mode ?? 'exhaustive'} onChange={(e) => patch({ mode: e.target.value as SimulationConfig['mode'] })}>
          <option value="exhaustive">Exhaustive (exact)</option>
          <option value="montecarlo">Monte Carlo (sampled)</option>
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Max steps">
          <Input type="number" min={1} max={30} value={config.maxDepth} onChange={(e) => patch({ maxDepth: Math.max(1, Math.min(30, Math.round(Number(e.target.value)))) })} />
        </Field>
        <Field label="Prune below P">
          <Input type="number" min={0} max={1} step={0.001} value={config.pruneThreshold} onChange={(e) => patch({ pruneThreshold: Math.max(0, Math.min(1, Number(e.target.value))) })} />
        </Field>
        {mc && (
          <>
            <Field label="Runs">
              <Input type="number" min={1} max={200000} value={config.runs ?? 2000} onChange={(e) => patch({ runs: Math.max(1, Math.min(200000, Math.round(Number(e.target.value)))) })} />
            </Field>
            <Field label="Seed">
              <Input type="number" value={config.seed ?? 42} onChange={(e) => patch({ seed: Math.round(Number(e.target.value)) })} />
            </Field>
          </>
        )}
        <Field label="Node limit" hint="Safety cap">
          <Input type="number" min={10} max={50000} value={config.maxNodes ?? 4000} onChange={(e) => patch({ maxNodes: Math.max(10, Math.min(50000, Math.round(Number(e.target.value)))) })} />
        </Field>
      </div>
      {!mc && (
        <Field
          label="How choices count"
          hint={
            config.choicePolicy === 'uniform'
              ? 'Every valid choice is equally likely, so all outcomes add up to 100%.'
              : 'Each choice is followed in full, so probabilities read "given the choices on this path".'
          }
        >
          <Select className="w-full" value={config.choicePolicy ?? 'conditional'} onChange={(e) => patch({ choicePolicy: e.target.value as SimulationConfig['choicePolicy'] })}>
            <option value="conditional">Conditional on choices</option>
            <option value="uniform">Choices are coin flips</option>
          </Select>
        </Field>
      )}
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1 accent-indigo-600" checked={!!config.includeQuietSteps} onChange={(e) => patch({ includeQuietSteps: e.target.checked })} />
        <span>
          Allow quiet steps
          <span className="block text-xs text-slate-400">When eligible probabilities add up to under 100%, the rest becomes a "nothing happens" branch instead of being rescaled.</span>
        </span>
      </label>
    </div>
  );
}

function JsonTab({ config, onChange }: Props) {
  const [text, setText] = useState(() => JSON.stringify(config, null, 2));
  const [errors, setErrors] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) setText(JSON.stringify(config, null, 2));
  }, [config, dirty]);
  return (
    <div className="flex h-full flex-col gap-2">
      <textarea
        spellCheck={false}
        className="min-h-[50vh] flex-1 rounded-md border border-slate-300 bg-white p-2 font-mono text-xs outline-none focus:border-indigo-500"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setDirty(true);
        }}
      />
      {errors.length > 0 && (
        <ul className="space-y-0.5 rounded-md bg-rose-50 p-2 text-xs text-rose-700">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Button
          variant="primary"
          disabled={!dirty}
          onClick={() => {
            const r = parseConfigJson(text);
            if (r.ok) {
              onChange(r.config);
              setErrors([]);
              setDirty(false);
            } else setErrors(r.errors);
          }}
        >
          Apply JSON
        </Button>
        <Button
          disabled={!dirty}
          onClick={() => {
            setDirty(false);
            setErrors([]);
          }}
        >
          Discard
        </Button>
      </div>
    </div>
  );
}
