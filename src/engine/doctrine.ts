import type { Contingency, ExternalEvent, Precondition, SimulationConfig, StateMutation } from '../types/simulation';
import { answeringContingencies, isHighRisk } from './analysis';
import { couldSatisfy, isClockKey } from './state';

// The doctrine map is the plan itself rather than a simulated run: every
// external shock, every If-Then contingency, and the sensors that wake them,
// wired together by what can cause what.

export type DoctrineNode =
  | { id: string; kind: 'shock'; shock: ExternalEvent; highRisk: boolean; covered: boolean }
  | { id: string; kind: 'contingency'; contingency: Contingency }
  | { id: string; kind: 'sensor'; variableId: string; name: string; initial?: string; clock: boolean };

// causal: the source's mutations can satisfy the target's conditions (solid).
// trigger: a sensor threshold that wakes a contingency (pulsing, dashed).
// intercept: a contingency armed to cancel a shock.
export interface DoctrineEdge {
  id: string;
  source: string;
  target: string;
  kind: 'causal' | 'trigger' | 'intercept';
  label?: string;
}

export type Layer = 'all' | 'shocks' | 'contingencies';

export const shockNodeId = (id: string) => `shock:${id}`;
export const contingencyNodeId = (id: string) => `cont:${id}`;
export const sensorNodeId = (variableId: string) => `sensor:${variableId}`;

export function formatCondition(c: Precondition): string {
  return `${c.variableId} ${c.operator} ${String(c.value)}`;
}

export function formatMutation(m: StateMutation): string {
  if (m.action === 'toggle') return `flip ${m.variableId}`;
  if (m.action === 'increment') return `${m.variableId} += ${m.value ?? 1}`;
  if (m.action === 'decrement') return `${m.variableId} -= ${m.value ?? 1}`;
  return `${m.variableId} = ${String(m.value)}`;
}

const enables = (mutations: StateMutation[], conditions: Precondition[]) => conditions.some((c) => mutations.some((m) => couldSatisfy(m, c)));

export function buildDoctrine(config: SimulationConfig, layer: Layer = 'all'): { nodes: DoctrineNode[]; edges: DoctrineEdge[] } {
  const nodes: DoctrineNode[] = [];
  const edges: DoctrineEdge[] = [];
  const names = new Map((config.variables ?? []).map((v) => [v.id, v]));
  const showShocks = layer !== 'contingencies';
  const showRules = layer !== 'shocks';

  // Sensor nodes: every variable some contingency watches.
  const sensors = new Map<string, Precondition[]>();
  for (const c of config.contingencies) for (const s of c.sensors) sensors.set(s.variableId, [...(sensors.get(s.variableId) ?? []), s]);

  if (showShocks) {
    for (const shock of config.externalEvents) {
      nodes.push({ id: shockNodeId(shock.id), kind: 'shock', shock, highRisk: isHighRisk(shock), covered: config.contingencies.some((c) => c.intercepts?.includes(shock.id)) || answeringContingencies(config, shock).length > 0 });
    }
  }
  if (showRules) {
    for (const [variableId] of sensors) {
      const v = names.get(variableId);
      nodes.push({ id: sensorNodeId(variableId), kind: 'sensor', variableId, name: v?.name ?? (isClockKey(variableId) ? `Clock (${variableId})` : variableId), initial: v ? String(v.initialValue) : undefined, clock: isClockKey(variableId) });
    }
    for (const c of config.contingencies) nodes.push({ id: contingencyNodeId(c.id), kind: 'contingency', contingency: c });
  }

  const sources: { id: string; mutations: StateMutation[] }[] = [
    ...(showShocks ? config.externalEvents.map((e) => ({ id: shockNodeId(e.id), mutations: e.mutations })) : []),
    ...(showRules ? config.contingencies.map((c) => ({ id: contingencyNodeId(c.id), mutations: c.actions.flatMap((a) => a.mutations) })) : []),
  ];

  for (const src of sources) {
    if (showShocks) {
      for (const e of config.externalEvents) {
        const target = shockNodeId(e.id);
        if (target !== src.id && enables(src.mutations, e.conditions)) edges.push({ id: `${src.id}>${target}`, source: src.id, target, kind: 'causal' });
      }
    }
    if (showRules) {
      for (const [variableId, conds] of sensors) {
        if (enables(src.mutations, conds)) edges.push({ id: `${src.id}>${sensorNodeId(variableId)}`, source: src.id, target: sensorNodeId(variableId), kind: 'causal' });
      }
    }
  }

  if (showRules) {
    for (const c of config.contingencies) {
      const target = contingencyNodeId(c.id);
      const byVar = new Map<string, string[]>();
      for (const s of c.sensors) byVar.set(s.variableId, [...(byVar.get(s.variableId) ?? []), `${s.operator} ${String(s.value)}`]);
      for (const [variableId, thresholds] of byVar) {
        edges.push({ id: `${sensorNodeId(variableId)}>${target}`, source: sensorNodeId(variableId), target, kind: 'trigger', label: thresholds.join(' & ') });
      }
      if (showShocks) {
        for (const s of c.intercepts ?? []) edges.push({ id: `${target}>|${s}`, source: target, target: shockNodeId(s), kind: 'intercept', label: 'intercepts' });
      }
    }
  }

  const ids = new Set(nodes.map((n) => n.id));
  return { nodes, edges: edges.filter((e) => ids.has(e.source) && ids.has(e.target)) };
}
