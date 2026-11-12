import type { Contingency, ContingencyAction, ExternalEvent, SimulationConfig, Value, WorldState } from '../types/simulation';
import { getMoves } from './simulate';
import { buildInitialState, stateKeys, stateSignature } from './state';

// The story as a reader follows it: her choices, and what the world does in
// between. A choice has no probability, it is hers to make. Between two
// choices the random events (and the rules that fire on their own) are folded
// into "turns": each turn is a set of things that happened, with the chance
// that it happens given everything chosen so far. Months where nothing happens
// and the order of events within a stretch are folded away.
//
// The model is a weighted set of concrete situations (a "belief"), because one
// turn such as "the husband loses his job" can land in different months.

export interface Point {
  state: WorldState;
  fired: string[];
  depth: number;
  intercept?: string; // a shock just hit and she must answer it: the shock id
}

export interface Weighted {
  pt: Point;
  w: number;
}

/** Something that happened between two choices. */
export interface Happening {
  kind: 'event' | 'auto'; // a random event, or a rule that fired on its own
  id: string;
  title: string;
  detail?: string; // for an automatic rule, the action it took
  from: number; // earliest and latest tick it happened in, across the folded situations
  until: number;
  severity?: ExternalEvent['severity'];
  minor?: boolean; // background detail that does not split the story
}

export interface ChoiceOption {
  action: ContingencyAction;
  share: number; // share of the situations where it is available (1 = always)
}

export type Stop =
  | { kind: 'choice'; contingency: Contingency; shock?: ExternalEvent; options: ChoiceOption[]; items: Weighted[]; from: number; until: number }
  | { kind: 'end'; items: Weighted[]; values: Record<string, Value | undefined>; numeric: Record<string, { mean: number; min: number; max: number }>; from: number; until: number };

export interface Turn {
  key: string;
  probability: number; // given the choices made so far
  happenings: Happening[]; // what splits this turn from the others, in the most likely order
  along: { happening: Happening; probability: number }[]; // background events, with their chance within this turn
  stop: Stop;
}

export interface Unfolded {
  turns: Turn[]; // most likely first
  lost: number; // mass dropped as too unlikely to follow
}

export interface StoryOptions {
  allEvents?: boolean; // let every event split the story, background ones included
  minP?: number;
}

/**
 * Events that are background detail: marked `minor`, or low/medium severity
 * events whose effects none of her rules and no ending looks at (a price move
 * or a sale that only changes a number, for example). Other random events may
 * still depend on them; they are still simulated, just not split on.
 */
export function minorEvents(config: SimulationConfig): Set<string> {
  const read = new Set<string>();
  for (const c of config.contingencies) {
    for (const s of c.sensors) read.add(s.variableId);
    for (const a of c.actions) for (const r of a.requires ?? []) read.add(r.variableId);
  }
  for (const k of endingKeys(config).keys) read.add(k);
  const out = new Set<string>();
  for (const e of config.externalEvents) {
    const quiet = (e.severity === 'low' || e.severity === 'medium') && e.mutations.every((m) => !read.has(m.variableId));
    if (e.minor ?? quiet) out.add(e.id);
  }
  return out;
}

export function startPoint(config: SimulationConfig): Weighted[] {
  return [{ pt: { state: buildInitialState(config), fired: [], depth: 0 }, w: 1 }];
}

/** The keys that describe an ending: the scenario's outcomeVariables, or every variable. */
export function endingKeys(config: SimulationConfig): { keys: string[]; numeric: string[] } {
  const all = stateKeys(config);
  const listed = (config.outcomeVariables ?? []).filter((k) => all.includes(k));
  const pool = listed.length ? listed : all;
  const types = new Map((config.variables ?? []).map((v) => [v.id, v.type]));
  const isNum = (k: string) => (types.get(k) ?? typeof config.initialState[k]) === 'number';
  return { keys: pool.filter((k) => !isNum(k)), numeric: pool.filter(isNum) };
}

const conditional = (config: SimulationConfig): SimulationConfig => ({ ...config, choicePolicy: 'conditional' });

type Classified =
  | { kind: 'end' }
  | { kind: 'choice'; contingency: Contingency; actions: string[]; shock?: ExternalEvent }
  | { kind: 'auto'; contingency: Contingency; action: ContingencyAction; next: Point }
  | { kind: 'chance'; moves: { p: number; next: Point; happen: Omit<Happening, 'from' | 'until'>[] }[] };

function classify(config: SimulationConfig, pt: Point, minor: Set<string>): Classified {
  const cfg = conditional(config);
  if (pt.intercept) {
    const { moves } = getMoves(cfg, pt);
    const mine = moves.filter((m) => m.kind === 'intercept' && m.refId.startsWith(`${pt.intercept}>`));
    const cid = mine[0]?.refId.split('>')[1].split(':')[0];
    const c = config.contingencies.find((x) => x.id === cid);
    if (!c) return { kind: 'end' };
    return { kind: 'choice', contingency: c, actions: mine.map((m) => m.refId.split(':').pop()!), shock: config.externalEvents.find((e) => e.id === pt.intercept) };
  }
  if (pt.depth >= config.maxDepth) return { kind: 'end' };
  const { moves, contingencyId } = getMoves(cfg, pt);
  if (!moves.length) return { kind: 'end' };
  if (contingencyId) {
    const c = config.contingencies.find((x) => x.id === contingencyId)!;
    const ids = moves.map((m) => m.refId.split(':')[1]);
    if (ids.length > 1) return { kind: 'choice', contingency: c, actions: ids };
    const m = moves[0];
    return { kind: 'auto', contingency: c, action: c.actions.find((a) => a.id === ids[0])!, next: { state: m.state, fired: m.fired, depth: pt.depth + 1 } };
  }
  const out: Extract<Classified, { kind: 'chance' }>['moves'] = [];
  const answered = new Set<string>();
  for (const m of moves) {
    if (m.kind === 'quiet') out.push({ p: m.p, next: { state: m.state, fired: m.fired, depth: pt.depth + 1 }, happen: [] });
    else if (m.kind === 'shock') {
      const e = config.externalEvents.find((x) => x.id === m.refId);
      out.push({ p: m.p, next: { state: m.state, fired: m.fired, depth: pt.depth + 1 }, happen: [{ kind: 'event', id: m.refId, title: e?.title ?? m.label, severity: e?.severity, minor: minor.has(m.refId) }] });
    } else if (m.kind === 'intercept') {
      const [sid, rest] = m.refId.split('>');
      if (answered.has(sid)) continue;
      answered.add(sid);
      const e = config.externalEvents.find((x) => x.id === sid);
      const all = moves.filter((x) => x.kind === 'intercept' && x.refId.startsWith(`${sid}>`));
      const happen: Omit<Happening, 'from' | 'until'>[] = [{ kind: 'event', id: sid, title: e?.title ?? sid, severity: e?.severity }];
      if (all.length > 1) out.push({ p: m.p, next: { ...pt, intercept: sid }, happen });
      else {
        const [cid, aid] = rest.split(':');
        const c = config.contingencies.find((x) => x.id === cid);
        happen.push({ kind: 'auto', id: `${cid}:${aid}`, title: c?.title ?? cid, detail: c?.actions.find((a) => a.id === aid)?.label });
        out.push({ p: m.p, next: { state: m.state, fired: m.fired, depth: pt.depth + 1 }, happen });
      }
    }
  }
  return { kind: 'chance', moves: out };
}

interface Trail {
  pt: Point;
  w: number;
  seq: Happening[];
  bestW: number; // weight of the ordering kept in seq
}

function setKey(seq: Happening[]): string {
  return seq
    .filter((h) => !h.minor)
    .map((h) => h.id)
    .sort()
    .join(',');
}

function extend(seq: Happening[], h: Omit<Happening, 'from' | 'until'>, tick: number): Happening[] {
  return [...seq, { ...h, from: tick, until: tick }];
}

function mergeTicks(into: Happening[], from: Happening[]) {
  for (const h of into) {
    const o = from.find((x) => x.id === h.id);
    if (o) {
      h.from = Math.min(h.from, o.from);
      h.until = Math.max(h.until, o.until);
    }
  }
}

/** Walks forward from a belief through everything she does not choose, until each situation reaches a choice or an ending. */
export function unfold(config: SimulationConfig, items: Weighted[], opts: StoryOptions = {}): Unfolded {
  const minP = opts.minP ?? 1e-5;
  const total = items.reduce((s, x) => s + x.w, 0) || 1;
  const { keys, numeric } = endingKeys(config);
  const minor = opts.allEvents ? new Set<string>() : minorEvents(config);
  let frontier = new Map<string, Trail>();
  const add = (map: Map<string, Trail>, t: Trail) => {
    const k = `${t.pt.depth}|${t.pt.intercept ?? ''}|${stateSignature(t.pt.state, t.pt.fired)}|${t.seq.map((h) => h.id).sort().join(',')}`;
    const cur = map.get(k);
    if (!cur) map.set(k, { ...t, seq: t.seq.map((h) => ({ ...h })) });
    else {
      cur.w += t.w;
      if (t.bestW > cur.bestW) {
        const old = cur.seq;
        cur.seq = t.seq.map((h) => ({ ...h }));
        cur.bestW = t.bestW;
        mergeTicks(cur.seq, old);
      } else mergeTicks(cur.seq, t.seq);
    }
  };
  for (const it of items) add(frontier, { pt: it.pt, w: it.w / total, seq: [], bestW: it.w / total });

  const stops: { t: Trail; c: Extract<Classified, { kind: 'choice' | 'end' }> }[] = [];
  let lost = 0;
  for (let guard = 0; frontier.size && guard < 500; guard++) {
    const next = new Map<string, Trail>();
    for (const t of frontier.values()) {
      if (t.w < minP) {
        lost += t.w;
        continue;
      }
      const c = classify(config, t.pt, minor);
      if (c.kind === 'end' || c.kind === 'choice') stops.push({ t, c });
      else if (c.kind === 'auto') add(next, { pt: c.next, w: t.w, bestW: t.bestW, seq: extend(t.seq, { kind: 'auto', id: `${c.contingency.id}:${c.action.id}`, title: c.contingency.title, detail: c.action.label }, t.pt.depth) });
      else
        for (const m of c.moves) {
          let seq = t.seq;
          for (const h of m.happen) seq = extend(seq, h, t.pt.depth);
          add(next, { pt: m.next, w: t.w * m.p, bestW: t.bestW * m.p, seq });
        }
    }
    frontier = next;
  }
  lost += [...frontier.values()].reduce((s, t) => s + t.w, 0);

  // Group the stops into turns.
  const groups = new Map<string, { w: number; seq: Happening[]; bestW: number; stops: typeof stops; along: Map<string, { h: Happening; w: number }> }>();
  for (const s of stops) {
    const id =
      s.c.kind === 'choice'
        ? `C:${s.c.contingency.id}|${s.c.shock?.id ?? ''}`
        : `E:${JSON.stringify(keys.map((k) => s.t.pt.state[k]))}`;
    const key = `${setKey(s.t.seq)}#${id}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { w: 0, seq: s.t.seq.map((h) => ({ ...h })), bestW: s.t.bestW, stops: [], along: new Map() }));
    else if (s.t.bestW > g.bestW) {
      const old = g.seq;
      g.seq = s.t.seq.map((h) => ({ ...h }));
      g.bestW = s.t.bestW;
      mergeTicks(g.seq, old);
    } else mergeTicks(g.seq, s.t.seq);
    g.w += s.t.w;
    g.stops.push(s);
    for (const h of s.t.seq) {
      if (!h.minor) continue;
      const a = g.along.get(h.id);
      if (a) {
        a.w += s.t.w;
        a.h.from = Math.min(a.h.from, h.from);
        a.h.until = Math.max(a.h.until, h.until);
      } else g.along.set(h.id, { h: { ...h }, w: s.t.w });
    }
  }

  const turns: Turn[] = [];
  for (const [key, g] of groups) {
    const itemsOut: Weighted[] = g.stops.map((s) => ({ pt: s.t.pt, w: s.t.w / g.w }));
    const ticks = g.stops.map((s) => s.t.pt.depth);
    const from = Math.min(...ticks);
    const until = Math.max(...ticks);
    const first = g.stops[0].c;
    let stop: Stop;
    if (first.kind === 'choice') {
      const avail = new Map<string, number>();
      for (const s of g.stops) if (s.c.kind === 'choice') for (const a of s.c.actions) avail.set(a, (avail.get(a) ?? 0) + s.t.w / g.w);
      stop = {
        kind: 'choice',
        contingency: first.contingency,
        shock: first.shock,
        options: first.contingency.actions.filter((a) => avail.has(a.id)).map((a) => ({ action: a, share: avail.get(a.id)! })),
        items: itemsOut,
        from,
        until,
      };
    } else {
      stop = {
        kind: 'end',
        items: itemsOut,
        values: Object.fromEntries(keys.map((k) => [k, g.stops[0].t.pt.state[k]])),
        numeric: Object.fromEntries(
          numeric.map((k) => {
            const vs = itemsOut.map((i) => ({ w: i.w, v: Number(i.pt.state[k]) }));
            return [k, { mean: vs.reduce((s, x) => s + x.w * x.v, 0), min: Math.min(...vs.map((x) => x.v)), max: Math.max(...vs.map((x) => x.v)) }];
          }),
        ),
        from,
        until,
      };
    }
    turns.push({
      key,
      probability: g.w,
      happenings: g.seq.filter((h) => !h.minor),
      along: [...g.along.values()].map((a) => ({ happening: a.h, probability: a.w / g.w })).sort((a, b) => b.probability - a.probability),
      stop,
    });
  }
  turns.sort((a, b) => b.probability - a.probability);
  return { turns, lost };
}

/** Applies her choice to every situation in a choice stop. Situations where that action is unavailable drop out. */
export function choose(config: SimulationConfig, stop: Extract<Stop, { kind: 'choice' }>, actionId: string): Weighted[] {
  const cfg = conditional(config);
  const out: Weighted[] = [];
  for (const it of stop.items) {
    const { moves } = getMoves(cfg, it.pt);
    const ref = it.pt.intercept ? `${it.pt.intercept}>${stop.contingency.id}:${actionId}` : `${stop.contingency.id}:${actionId}`;
    const m = moves.find((x) => x.refId === ref);
    if (m) out.push({ pt: { state: m.state, fired: m.fired, depth: it.pt.depth + 1 }, w: it.w });
  }
  const total = out.reduce((s, x) => s + x.w, 0) || 1;
  return out.map((x) => ({ ...x, w: x.w / total }));
}

/** Picks a turn at random by its probability. */
export function roll(u: Unfolded, rand = Math.random): number {
  const total = u.turns.reduce((s, t) => s + t.probability, 0);
  let x = rand() * total;
  for (let i = 0; i < u.turns.length; i++) {
    x -= u.turns[i].probability;
    if (x < 0) return i;
  }
  return u.turns.length - 1;
}
