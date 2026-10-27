import { Braces, ChevronDown, ChevronRight, Cpu, Plus, Radar, Settings2, Trash2, Users, Variable } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { parseConfigJson } from '../engine/schema';
import { isHighRisk } from '../engine/analysis';
import { sensorKeys } from '../engine/state';
import type { Actor, Contingency, ContingencyAction, ExternalEvent, Severity, SimulationConfig, Timeline, VariableType, WorldVariable } from '../types/simulation';
import { MutationList, PreconditionList, ValueInput } from './RuleEditors';
import { Button, Card, Field, IconButton, Input, Select, Tabs } from './ui';

type Tab = 'variables' | 'actors' | 'shocks' | 'contingencies' | 'settings' | 'json';

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
  const [tab, setTab] = useState<Tab>('shocks');
  const keys = sensorKeys(config);
  const tabs = [
    { id: 'variables' as const, label: 'Variables', icon: <Variable size={13} /> },
    { id: 'actors' as const, label: 'Actors', icon: <Users size={13} /> },
    { id: 'shocks' as const, label: `Shocks (${config.externalEvents.length})`, icon: <Radar size={13} /> },
    { id: 'contingencies' as const, label: `If-Then (${config.contingencies.length})`, icon: <Cpu size={13} /> },
    { id: 'settings' as const, label: 'Run', icon: <Settings2 size={13} /> },
    { id: 'json' as const, label: 'JSON', icon: <Braces size={13} /> },
  ];
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-800 px-3 py-2">
        <h2 className="text-sm font-semibold text-slate-200">Plan the operation</h2>
        <p className="text-xs text-slate-400">Separate the chaos (external shocks) from your agency (If-Then contingencies). The map and resilience score update as you type.</p>
      </div>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {tab === 'variables' && <VariablesTab config={config} onChange={onChange} />}
        {tab === 'actors' && <ActorsTab config={config} onChange={onChange} />}
        {tab === 'shocks' && <ShocksTab config={config} onChange={onChange} keys={keys} />}
        {tab === 'contingencies' && <ContingenciesTab config={config} onChange={onChange} keys={keys} />}
        {tab === 'settings' && <SettingsTab config={config} onChange={onChange} />}
        {tab === 'json' && <JsonTab config={config} onChange={onChange} />}
      </div>
    </div>
  );
}

function Collapsible({ title, subtitle, children, onRemove, defaultOpen = false, tone }: { title: string; subtitle?: string; children: ReactNode; onRemove: () => void; defaultOpen?: boolean; tone?: 'shock' | 'contingency' }) {
  const [open, setOpen] = useState(defaultOpen);
  const accent = tone === 'shock' ? 'border-l-2 !border-l-rose-500/70' : tone === 'contingency' ? 'border-l-2 !border-l-sky-500/70' : '';
  return (
    <Card className={`!p-0 ${accent}`}>
      <div className="flex items-center gap-1 px-2 py-1.5">
        <button type="button" className="flex min-w-0 flex-1 items-center gap-1 text-left" onClick={() => setOpen(!open)}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span className="truncate text-sm font-medium">{title || '(untitled)'}</span>
          {subtitle && <span className="ml-auto shrink-0 pl-2 text-xs text-slate-500">{subtitle}</span>}
        </button>
        <IconButton title="Delete" onClick={onRemove}>
          <Trash2 size={14} />
        </IconButton>
      </div>
      {open && <div className="space-y-2 border-t border-slate-800 p-3">{children}</div>}
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
      <p className="text-xs text-slate-400">World variables make up the state. Events and choices read and change them.</p>
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
      <p className="text-xs text-slate-400">
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

const SEVERITIES: Severity[] = ['low', 'medium', 'high', 'critical'];

function tickInput(v: number | undefined, onChange: (n: number | undefined) => void, placeholder: string) {
  return (
    <Input
      type="number"
      min={0}
      max={1000}
      placeholder={placeholder}
      value={v ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? undefined : Math.max(0, Math.min(1000, Math.round(Number(e.target.value)))))}
    />
  );
}

function ShocksTab({ config, onChange, keys }: Props & { keys: string[] }) {
  const set = (next: ExternalEvent[]) => onChange({ ...config, externalEvents: next });
  const patch = (i: number, p: Partial<ExternalEvent>) => set(config.externalEvents.map((e, j) => (j === i ? { ...e, ...p } : e)));
  const [lastAdded, setLastAdded] = useState<number | null>(null);
  return (
    <>
      <p className="text-xs text-slate-400">
        <Radar size={12} className="mr-1 inline text-rose-400" />
        External shocks are the chaos you cannot control. Each tick, the eligible ones compete by probability, unless a contingency trips first or intercepts them.
      </p>
      {config.externalEvents.map((e, i) => {
        const setWindow = (w: Partial<NonNullable<ExternalEvent['window']>>) => {
          const next = { ...e.window, ...w };
          patch(i, { window: next.from === undefined && next.until === undefined ? undefined : next });
        };
        return (
          <Collapsible
            key={`${i}-${e.id}`}
            title={e.title}
            subtitle={`P=${Math.round(e.probability * 100)}%${e.severity ? ` · ${e.severity}` : ''}${e.repeatable ? ' ↻' : ''}`}
            tone="shock"
            onRemove={() => set(config.externalEvents.filter((_, j) => j !== i))}
            defaultOpen={lastAdded === i}
          >
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
            <Field label={`Probability: P = ${(e.probability * 100).toFixed(1)}%`}>
              <div className="flex items-center gap-2">
                <input type="range" min={0} max={1} step={0.01} value={e.probability} onChange={(ev) => patch(i, { probability: Number(ev.target.value) })} className="flex-1 accent-rose-500" />
                <Input type="number" min={0} max={1} step={0.01} value={e.probability} onChange={(ev) => patch(i, { probability: Math.min(1, Math.max(0, Number(ev.target.value))) })} className="!w-20" />
              </div>
            </Field>
            <div className="grid grid-cols-3 gap-1">
              <Field label="Severity" hint={e.severity ? undefined : `auto: ${isHighRisk(e) ? 'high' : 'medium'}`}>
                <Select className="w-full" value={e.severity ?? ''} onChange={(ev) => patch(i, { severity: (ev.target.value || undefined) as Severity | undefined })}>
                  <option value="">auto</option>
                  {SEVERITIES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </Select>
              </Field>
              <Field label="From tick">{tickInput(e.window?.from, (from) => setWindow({ from }), 'any')}</Field>
              <Field label="Until tick">{tickInput(e.window?.until, (until) => setWindow({ until }), 'any')}</Field>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!e.repeatable} onChange={(ev) => patch(i, { repeatable: ev.target.checked })} className="accent-rose-500" />
              Repeatable (can hit more than once)
            </label>
            <PreconditionList items={e.conditions} keys={keys} onChange={(p) => patch(i, { conditions: p })} label="Can hit when" />
            <MutationList items={e.mutations} keys={keys} onChange={(m) => patch(i, { mutations: m })} label="Impact" />
          </Collapsible>
        );
      })}
      <Button
        onClick={() => {
          setLastAdded(config.externalEvents.length);
          set([...config.externalEvents, { id: uniqueId('shock', config.externalEvents.map((e) => e.id)), title: 'New shock', probability: 0.3, severity: 'high', conditions: [], mutations: [] }]);
        }}
      >
        <Plus size={14} /> Add external shock
      </Button>
    </>
  );
}

function ContingenciesTab({ config, onChange, keys }: Props & { keys: string[] }) {
  const set = (next: Contingency[]) => onChange({ ...config, contingencies: next });
  const patch = (i: number, p: Partial<Contingency>) => set(config.contingencies.map((d, j) => (j === i ? { ...d, ...p } : d)));
  const [lastAdded, setLastAdded] = useState<number | null>(null);
  return (
    <>
      <p className="text-xs text-slate-400">
        <Cpu size={12} className="mr-1 inline text-sky-400" />
        Contingencies are your pre-planned If-Then rules. Sensors are checked at every tick before any shock can hit. An interceptor instead waits, armed, and cancels the shocks it names.
      </p>
      {config.contingencies.map((c, i) => {
        const patchAction = (j: number, p: Partial<ContingencyAction>) => patch(i, { actions: c.actions.map((a, n) => (n === j ? { ...a, ...p } : a)) });
        const intercepts = c.intercepts ?? [];
        return (
          <Collapsible
            key={`${i}-${c.id}`}
            title={c.title}
            subtitle={intercepts.length ? `intercepts ${intercepts.length}` : `${c.actions.length} ${c.actions.length === 1 ? 'action' : 'options'}`}
            tone="contingency"
            onRemove={() => set(config.contingencies.filter((_, j) => j !== i))}
            defaultOpen={lastAdded === i}
          >
            <div className="flex gap-1">
              <Field label="Rule name" className="min-w-0 flex-1">
                <Input value={c.title} onChange={(ev) => patch(i, { title: ev.target.value })} />
              </Field>
              <div className="w-32 shrink-0">
                <Field label="Id">
                  <Input value={c.id} onChange={(ev) => patch(i, { id: ev.target.value })} className="font-mono" />
                </Field>
              </div>
            </div>
            <Field label="Description">
              <Input value={c.description ?? ''} onChange={(ev) => patch(i, { description: ev.target.value || undefined })} />
            </Field>
            <PreconditionList items={c.sensors} keys={keys} onChange={(p) => patch(i, { sensors: p })} label="IF sensors read" emptyText="Always tripped" />
            <div className="space-y-1">
              <span className="text-xs font-medium text-slate-400">Intercepts (leave empty to fire as soon as the sensors trip)</span>
              <div className="flex flex-wrap gap-1">
                {config.externalEvents.map((e) => {
                  const on = intercepts.includes(e.id);
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => {
                        const next = on ? intercepts.filter((x) => x !== e.id) : [...intercepts, e.id];
                        patch(i, { intercepts: next.length ? next : undefined });
                      }}
                      className={`rounded px-1.5 py-0.5 text-[11px] ring-1 ${on ? 'bg-rose-500/20 text-rose-200 ring-rose-500/60' : 'text-slate-400 ring-slate-700 hover:text-slate-200'}`}
                    >
                      {e.title}
                    </button>
                  );
                })}
              </div>
            </div>
            {c.actions.map((a, j) => (
              <div key={j} className="space-y-1.5 rounded-md border border-sky-900/80 bg-sky-950/30 p-2">
                <div className="flex gap-1">
                  <span className="self-center font-mono text-[10px] font-bold text-sky-400">THEN</span>
                  <Input value={a.label} onChange={(ev) => patchAction(j, { label: ev.target.value })} placeholder="Action" />
                  <Input value={a.id} onChange={(ev) => patchAction(j, { id: ev.target.value })} className="!w-24 font-mono" />
                  <IconButton title="Delete action" disabled={c.actions.length <= 1} onClick={() => patch(i, { actions: c.actions.filter((_, n) => n !== j) })}>
                    <Trash2 size={14} />
                  </IconButton>
                </div>
                <PreconditionList items={a.requires ?? []} keys={keys} onChange={(p) => patchAction(j, { requires: p })} label="Available only if" />
                <MutationList items={a.mutations} keys={keys} onChange={(m) => patchAction(j, { mutations: m })} />
              </div>
            ))}
            <Button variant="ghost" className="text-xs" onClick={() => patch(i, { actions: [...c.actions, { id: uniqueId('action', c.actions.map((a) => a.id)), label: 'Alternative', mutations: [] }] })}>
              <Plus size={12} /> option
            </Button>
          </Collapsible>
        );
      })}
      <Button
        onClick={() => {
          setLastAdded(config.contingencies.length);
          set([
            ...config.contingencies,
            {
              id: uniqueId('rule', config.contingencies.map((d) => d.id)),
              title: 'New contingency',
              sensors: [{ variableId: keys[0] ?? '', operator: '==', value: true }],
              actions: [{ id: 'plan_b', label: 'Execute plan B', mutations: [] }],
            },
          ]);
        }}
      >
        <Plus size={14} /> Add contingency
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
      <div className="grid grid-cols-2 gap-2">
        <Field label="Tick unit">
          <Select className="w-full" value={config.timeline?.unit ?? 'step'} onChange={(e) => patch({ timeline: { ...config.timeline, unit: e.target.value as Timeline['unit'] } })}>
            <option value="step">step</option>
            <option value="day">day</option>
            <option value="week">week</option>
            <option value="month">month</option>
          </Select>
        </Field>
        <Field label="Start date" hint="Enables the date sensor">
          <Input
            type="date"
            value={config.timeline?.start ?? ''}
            onChange={(e) => patch({ timeline: { unit: config.timeline?.unit ?? 'day', start: e.target.value || undefined } })}
          />
        </Field>
      </div>
      <Field label="Mode" hint={mc ? 'Samples random paths. Fast for big scenarios; probabilities are estimates.' : 'Explores every branch exactly, merging identical states.'}>
        <Select className="w-full" value={config.mode ?? 'exhaustive'} onChange={(e) => patch({ mode: e.target.value as SimulationConfig['mode'] })}>
          <option value="exhaustive">Exhaustive (exact)</option>
          <option value="montecarlo">Monte Carlo (sampled)</option>
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Max ticks">
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
          label="How options count"
          hint={
            config.choicePolicy === 'uniform'
              ? 'When a contingency has several options, each is equally likely, so all outcomes add up to 100%.'
              : 'Each option is followed in full, so probabilities read "given the options taken on this path".'
          }
        >
          <Select className="w-full" value={config.choicePolicy ?? 'conditional'} onChange={(e) => patch({ choicePolicy: e.target.value as SimulationConfig['choicePolicy'] })}>
            <option value="conditional">Conditional on options</option>
            <option value="uniform">Options are coin flips</option>
          </Select>
        </Field>
      )}
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1 accent-cyan-600" checked={!!config.includeQuietSteps} onChange={(e) => patch({ includeQuietSteps: e.target.checked })} />
        <span>
          Allow quiet ticks
          <span className="block text-xs text-slate-500">When eligible shock probabilities add up to under 100%, the rest becomes a "quiet tick" branch instead of being rescaled.</span>
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
        className="min-h-[50vh] flex-1 rounded-md border border-slate-700 bg-slate-900 p-2 font-mono text-xs outline-none focus:border-cyan-500"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setDirty(true);
        }}
      />
      {errors.length > 0 && (
        <ul className="space-y-0.5 rounded-md bg-rose-950/40 p-2 text-xs text-rose-300">
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
