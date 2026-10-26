import type { Precondition, SimulationConfig, StateMutation, Value, WorldState } from '../types/simulation';

/** Variables first, then actor attributes as "<actorId>.<attr>", then initialState overrides. */
export function buildInitialState(config: SimulationConfig): WorldState {
  const state: WorldState = {};
  for (const v of config.variables ?? []) state[v.id] = v.initialValue;
  for (const a of config.actors) {
    for (const [k, val] of Object.entries(a.statusAttributes)) state[`${a.id}.${k}`] = val;
  }
  for (const [k, val] of Object.entries(config.initialState)) state[k] = val;
  return state;
}

function looseEqual(a: Value | undefined, b: Value): boolean {
  if (a === b) return true;
  if (a === undefined) return false;
  return String(a) === String(b);
}

function toNumber(v: Value | undefined): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

export function checkPrecondition(state: WorldState, p: Precondition): boolean {
  const cur = Object.hasOwn(state, p.variableId) ? state[p.variableId] : undefined;
  switch (p.operator) {
    case '==':
      return looseEqual(cur, p.value);
    case '!=':
      return !looseEqual(cur, p.value);
    case 'contains':
      return cur !== undefined && String(cur).toLowerCase().includes(String(p.value).toLowerCase());
    default: {
      const a = toNumber(cur);
      const b = toNumber(p.value);
      if (Number.isNaN(a) || Number.isNaN(b)) return false;
      if (p.operator === '>') return a > b;
      if (p.operator === '<') return a < b;
      if (p.operator === '>=') return a >= b;
      return a <= b;
    }
  }
}

export function checkAll(state: WorldState, pre: Precondition[] | undefined): boolean {
  return (pre ?? []).every((p) => checkPrecondition(state, p));
}

export function applyMutations(state: WorldState, mutations: StateMutation[]): WorldState {
  const next: WorldState = { ...state };
  for (const m of mutations) {
    const cur = Object.hasOwn(next, m.variableId) ? next[m.variableId] : undefined;
    switch (m.action) {
      case 'set':
        if (m.value !== undefined) next[m.variableId] = m.value;
        break;
      case 'increment':
      case 'decrement': {
        const base = toNumber(cur);
        const step = m.value === undefined ? 1 : toNumber(m.value);
        if (Number.isNaN(step)) break;
        const b = Number.isNaN(base) ? 0 : base;
        // Round to dodge 0.1 + 0.2 style drift creating "different" states.
        next[m.variableId] = Math.round((m.action === 'increment' ? b + step : b - step) * 1e9) / 1e9;
        break;
      }
      case 'toggle':
        next[m.variableId] = !(cur === true || cur === 'true');
        break;
    }
  }
  return next;
}

/** Canonical string for a world state + used-up events. Equal strings = same situation. */
export function stateSignature(state: WorldState, fired: string[]): string {
  const keys = Object.keys(state).sort();
  return JSON.stringify([keys.map((k) => [k, state[k]]), [...fired].sort()]);
}

export function diffState(from: WorldState, to: WorldState): { key: string; before: Value | undefined; after: Value | undefined }[] {
  const keys = new Set([...Object.keys(from), ...Object.keys(to)]);
  const out: { key: string; before: Value | undefined; after: Value | undefined }[] = [];
  for (const k of [...keys].sort()) {
    if (from[k] !== to[k]) out.push({ key: k, before: from[k], after: to[k] });
  }
  return out;
}

/** Every state key a scenario defines, for variable pickers. */
export function stateKeys(config: SimulationConfig): string[] {
  const keys = new Set<string>();
  for (const v of config.variables ?? []) keys.add(v.id);
  for (const a of config.actors) for (const k of Object.keys(a.statusAttributes)) keys.add(`${a.id}.${k}`);
  for (const k of Object.keys(config.initialState)) keys.add(k);
  return [...keys];
}
