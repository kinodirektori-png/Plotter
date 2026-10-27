import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { Clock, Cpu, Flag, Gauge, Play, Radar, ShieldAlert, ShieldCheck, Skull, Timer } from 'lucide-react';
import { memo } from 'react';
import { formatP } from '../engine/analysis';
import { formatCondition, type DoctrineNode } from '../engine/doctrine';
import type { Contingency, EdgeKind, ExternalEvent, Severity, SimNode, Timeline } from '../types/simulation';
import { formatTick } from '../engine/state';

// The war-room visual language, shared by the doctrine map and the timeline:
//   shocks       crimson / amber glowing cards with a radar icon and a P tag
//   contingency  steel-blue tactical blocks that print their If -> Then rule
//   sensors      neon-cyan pills; their trigger edges pulse

export const DOCTRINE_SIZE = {
  shock: { w: 250, h: 100 },
  sensor: { w: 200, h: 54 },
  contingency: (c: Contingency) => ({ w: 280, h: 96 + 16 * Math.min(c.actions.length, 4) + (c.intercepts?.length ? 16 : 0) }),
};
export const TIMELINE_SIZE = { w: 224, h: 92 };

const handle = '!h-1.5 !w-1.5 !border-0';

export function shockTone(severity: Severity | undefined, highRisk: boolean) {
  const s = severity ?? (highRisk ? 'high' : 'medium');
  if (s === 'critical') return { card: 'shock-card shock-critical border-rose-500', accent: 'text-rose-400', tag: 'bg-rose-500/20 text-rose-200 ring-rose-500/60' };
  if (s === 'high') return { card: 'shock-card border-rose-500/80', accent: 'text-rose-400', tag: 'bg-rose-500/15 text-rose-200 ring-rose-500/40' };
  if (s === 'medium') return { card: 'shock-card shock-amber border-amber-400/80', accent: 'text-amber-300', tag: 'bg-amber-500/15 text-amber-200 ring-amber-400/40' };
  return { card: 'shock-card shock-dim border-amber-700/60', accent: 'text-amber-500/80', tag: 'bg-amber-900/30 text-amber-300/80 ring-amber-700/40' };
}

export function windowLabel(e: ExternalEvent, timeline?: Timeline): string | undefined {
  const w = e.window;
  if (!w || (w.from === undefined && w.until === undefined)) return undefined;
  if (w.from !== undefined && w.from === w.until) return `at ${formatTick(timeline, w.from)}`;
  if (w.until === undefined) return `from ${formatTick(timeline, w.from!)}`;
  if (w.from === undefined) return `until ${formatTick(timeline, w.until)}`;
  return `${formatTick(timeline, w.from)} – ${formatTick(timeline, w.until)}`;
}

export const ifClause = (c: Contingency) => (c.sensors.length ? c.sensors.map(formatCondition).join(' ∧ ') : 'always armed');

// ---------- Doctrine map nodes ----------

type DoctrineData = { node: DoctrineNode; timeline?: Timeline; dimmed: boolean };

const ShockNode = memo(({ data }: NodeProps<Node<DoctrineData>>) => {
  if (data.node.kind !== 'shock') return null;
  const { shock, highRisk, covered } = data.node;
  const tone = shockTone(shock.severity, highRisk);
  const when = windowLabel(shock, data.timeline);
  return (
    <div className={`rounded-xl border-2 px-2.5 py-2 text-[11px] ${tone.card} ${data.dimmed ? 'opacity-25' : ''}`} style={{ width: DOCTRINE_SIZE.shock.w, height: DOCTRINE_SIZE.shock.h }}>
      <Handle type="target" position={Position.Left} className={`${handle} !bg-rose-400`} />
      <div className="flex items-center gap-1.5">
        <Radar size={13} className={tone.accent} />
        <span className={`text-[9px] font-bold tracking-[0.2em] uppercase ${tone.accent}`}>External shock</span>
        {shock.severity && <span className="ml-auto text-[9px] font-bold tracking-wider text-slate-400 uppercase">{shock.severity}</span>}
      </div>
      <div className="mt-1 line-clamp-2 text-[12px] leading-snug font-semibold text-slate-100">{shock.title}</div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <span className={`rounded px-1.5 py-px font-mono text-[11px] font-bold ring-1 ${tone.tag}`}>P = {Math.round(shock.probability * 1000) / 10}%</span>
        {when && (
          <span className="flex items-center gap-0.5 rounded bg-slate-800/80 px-1 py-px font-mono text-[10px] text-slate-300">
            <Clock size={10} /> {when}
          </span>
        )}
        {highRisk &&
          (covered ? (
            <span className="ml-auto flex items-center gap-0.5 text-[10px] text-sky-300">
              <ShieldCheck size={11} /> covered
            </span>
          ) : (
            <span className="ml-auto flex items-center gap-0.5 text-[10px] font-semibold text-rose-300">
              <ShieldAlert size={11} /> exposed
            </span>
          ))}
      </div>
      <Handle type="source" position={Position.Right} className={`${handle} !bg-rose-400`} />
    </div>
  );
});

const ContingencyNode = memo(({ data }: NodeProps<Node<DoctrineData>>) => {
  if (data.node.kind !== 'contingency') return null;
  const c = data.node.contingency;
  const size = DOCTRINE_SIZE.contingency(c);
  const interceptor = !!c.intercepts?.length;
  return (
    <div className={`tactical-card rounded-sm border border-sky-500/70 px-2.5 py-2 text-[11px] ${data.dimmed ? 'opacity-25' : ''}`} style={{ width: size.w, height: size.h }}>
      <Handle type="target" position={Position.Left} className={`${handle} !bg-cyan-300`} />
      <div className="flex items-center gap-1.5">
        {interceptor ? <ShieldCheck size={13} className="text-sky-300" /> : <Cpu size={13} className="text-sky-300" />}
        <span className="text-[9px] font-bold tracking-[0.2em] text-sky-300 uppercase">{interceptor ? 'Interceptor' : 'Contingency'}</span>
        <span className="ml-auto truncate font-mono text-[9px] text-slate-500">{c.id}</span>
      </div>
      <div className="mt-0.5 truncate text-[12px] font-semibold text-slate-100">{c.title}</div>
      <div className="mt-1 space-y-0.5 rounded-sm border border-slate-700/80 bg-slate-950/70 px-1.5 py-1 font-mono text-[10px] leading-tight">
        <div className="truncate">
          <span className="font-bold text-cyan-300">IF </span>
          <span className="text-cyan-100">{ifClause(c)}</span>
        </div>
        {c.actions.slice(0, 4).map((a, i) => (
          <div key={a.id} className="truncate">
            <span className="font-bold text-sky-400">{i === 0 ? (c.actions.length > 1 ? '→ THEN one of ' : '→ THEN ') : '              '}</span>
            <span className="text-slate-200">{c.actions.length > 1 ? `${i + 1}. ` : ''}{a.label}</span>
          </div>
        ))}
        {interceptor && (
          <div className="truncate text-rose-300">
            <span className="font-bold">⟂ ON </span>
            {c.intercepts!.join(', ')}
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Right} className={`${handle} !bg-sky-400`} />
    </div>
  );
});

const SensorNode = memo(({ data }: NodeProps<Node<DoctrineData>>) => {
  if (data.node.kind !== 'sensor') return null;
  const s = data.node;
  return (
    <div className={`sensor-pill flex items-center gap-2 rounded-full border border-cyan-400/80 bg-slate-950 px-3 ${data.dimmed ? 'opacity-25' : ''}`} style={{ width: DOCTRINE_SIZE.sensor.w, height: DOCTRINE_SIZE.sensor.h }}>
      <Handle type="target" position={Position.Left} className={`${handle} !bg-cyan-300`} />
      {s.clock ? <Timer size={16} className="shrink-0 text-cyan-300" /> : <Gauge size={16} className="shrink-0 text-cyan-300" />}
      <div className="min-w-0 leading-tight">
        <div className="text-[8px] font-bold tracking-[0.2em] text-cyan-400 uppercase">Sensor</div>
        <div className="truncate text-[11px] font-semibold text-cyan-50">{s.name}</div>
        <div className="truncate font-mono text-[9px] text-slate-400">
          {s.variableId}
          {s.initial !== undefined && ` · start ${s.initial}`}
        </div>
      </div>
      <Handle type="source" position={Position.Right} className={`${handle} !bg-cyan-300`} />
    </div>
  );
});

export const doctrineNodeTypes = { shock: ShockNode, contingency: ContingencyNode, sensor: SensorNode };
export type { DoctrineData };

// ---------- Timeline (simulated run) node ----------

export interface TimelineData {
  sim: SimNode;
  isRoot: boolean;
  arrival?: EdgeKind; // how the most likely route got here
  heading: string; // shock title, or the fired rule
  detail?: string; // IF clause, intercept, or state change
  stepP?: number; // probability of the arriving transition
  tick: string;
  changes: string[];
  blindSpot: boolean;
  tripped?: string; // contingency whose sensors tripped in this state
  highlighted: boolean;
  selected: boolean;
  dimmed: boolean;
  maxP: number;
  [key: string]: unknown;
}

const ARRIVAL = {
  shock: { card: 'shock-card border-rose-500/70', icon: <Radar size={11} className="text-rose-400" />, label: 'Shock', accent: 'text-rose-300' },
  contingency: { card: 'tactical-card border-sky-500/70', icon: <Cpu size={11} className="text-sky-300" />, label: 'Contingency', accent: 'text-sky-300' },
  intercept: { card: 'tactical-card border-cyan-400/80', icon: <ShieldCheck size={11} className="text-cyan-300" />, label: 'Intercepted', accent: 'text-cyan-300' },
  quiet: { card: 'border-slate-700 bg-slate-900', icon: <Clock size={11} className="text-slate-400" />, label: 'Time passes', accent: 'text-slate-400' },
} as const;

export const TimelineNode = memo(({ data }: NodeProps<Node<TimelineData>>) => {
  const { sim, isRoot, arrival, heading, detail, stepP, tick, changes, blindSpot, tripped, highlighted, selected, dimmed, maxP } = data;
  const a = arrival ? ARRIVAL[arrival] : undefined;
  const card = isRoot ? 'border-slate-500 bg-slate-800' : (a?.card ?? 'border-slate-700 bg-slate-900');
  const ring = selected ? 'ring-2 ring-cyan-300 ring-offset-1 ring-offset-slate-950' : highlighted ? 'ring-2 ring-cyan-500/60' : '';
  const share = maxP > 0 ? Math.min(1, sim.probability / maxP) : 0;
  return (
    <div
      className={`rounded-md border px-2 py-1.5 text-[11px] leading-tight ${card} ${ring} ${blindSpot ? '!border-rose-500 blind-spot' : ''} ${dimmed ? 'opacity-20' : ''}`}
      style={{ width: TIMELINE_SIZE.w, height: TIMELINE_SIZE.h }}
    >
      <Handle type="target" position={Position.Top} className={`${handle} !bg-slate-500`} />
      <div className="flex items-center gap-1">
        {isRoot ? <Play size={11} className="text-slate-300" /> : a?.icon}
        <span className={`text-[9px] font-bold tracking-widest uppercase ${isRoot ? 'text-slate-300' : a?.accent}`}>{isRoot ? 'H-hour' : a?.label}</span>
        {stepP !== undefined && arrival === 'shock' && <span className="rounded bg-rose-500/15 px-1 font-mono text-[9px] text-rose-200">P={formatP(stepP)}</span>}
        <span className="ml-auto font-mono text-[9px] text-slate-500">{tick}</span>
        <span className="font-semibold text-slate-100 tabular-nums">{formatP(sim.probability)}</span>
      </div>
      <div className="mt-0.5 h-0.5 rounded bg-slate-800">
        <div className={`h-0.5 rounded ${arrival === 'shock' ? 'bg-rose-400' : 'bg-cyan-400'}`} style={{ width: `${share * 100}%` }} />
      </div>
      <div className="mt-1 truncate font-semibold text-slate-100">{isRoot ? 'Initial state' : heading}</div>
      <div className="truncate font-mono text-[10px] text-slate-400">{detail ?? (changes[0] || 'no state change')}</div>
      <div className="mt-0.5 flex items-center gap-1 text-[9px]">
        {tripped && <span className="rounded bg-cyan-400/15 px-1 font-bold tracking-wider text-cyan-300 uppercase">sensor tripped: {tripped}</span>}
        {blindSpot && (
          <span className="flex items-center gap-0.5 rounded bg-rose-500/20 px-1 font-bold tracking-wider text-rose-300 uppercase">
            <Skull size={9} /> blind spot
          </span>
        )}
        {sim.terminal && !blindSpot && (
          <span className="flex items-center gap-0.5 rounded bg-emerald-500/15 px-1 font-bold tracking-wider text-emerald-300 uppercase">
            <Flag size={9} /> {sim.terminalReason === 'maxDepth' ? 'step limit' : 'end'}
          </span>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className={`${handle} !bg-slate-500`} />
    </div>
  );
});
