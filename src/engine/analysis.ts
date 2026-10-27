import type { Contingency, ExternalEvent, SimEdge, SimNode, SimResult, SimulationConfig, WorldState } from '../types/simulation';
import { couldSatisfy, stateSignature } from './state';

export interface Outcome {
  id: string;
  state: WorldState;
  probability: number;
  pathCount: number; // distinct event orderings that end in this outcome
  nodes: SimNode[]; // terminal nodes (maybe at different depths) sharing this final state
  best: SimNode; // terminal node holding the single most likely route
}

/**
 * Terminal nodes grouped by final world state only, ignoring depth and which
 * events were used. This is the "where you end up" view of the DAG.
 */
export function computeOutcomes(result: SimResult): Outcome[] {
  const groups = new Map<string, Outcome>();
  for (const n of Object.values(result.nodes)) {
    if (!n.terminal) continue;
    const sig = stateSignature(n.state, []);
    let g = groups.get(sig);
    if (!g) {
      g = { id: `o${groups.size + 1}`, state: n.state, probability: 0, pathCount: 0, nodes: [], best: n };
      groups.set(sig, g);
    }
    g.probability += n.probability;
    g.pathCount += n.pathCount;
    g.nodes.push(n);
    if (n.bestPathP > g.best.bestPathP) g.best = n;
  }
  return [...groups.values()].sort((a, b) => b.probability - a.probability);
}

/** Root-to-node edge list along the most likely route. */
export function bestPath(result: SimResult, nodeId: string): SimEdge[] {
  const byId = new Map(result.edges.map((e) => [e.id, e]));
  const out: SimEdge[] = [];
  let cur: SimNode | undefined = result.nodes[nodeId];
  while (cur?.bestEdge) {
    const e = byId.get(cur.bestEdge);
    if (!e) break;
    out.push(e);
    cur = result.nodes[cur.bestParent!];
  }
  return out.reverse();
}

export function formatP(p: number): string {
  if (p >= 0.995 && p <= 1.0000001) return '100%';
  if (p > 1) return `${p.toFixed(2)}×`;
  if (p >= 0.1) return `${(p * 100).toFixed(1)}%`;
  if (p >= 0.001) return `${(p * 100).toFixed(2)}%`;
  if (p === 0) return '0%';
  return `${(p * 100).toExponential(1)}%`;
}

// ---------- Tactical resilience ----------

/** Shocks without an explicit severity count as high risk from this probability up. */
export const HIGH_RISK_P = 0.25;

export function isHighRisk(e: ExternalEvent): boolean {
  return e.severity ? e.severity === 'high' || e.severity === 'critical' : e.probability >= HIGH_RISK_P;
}

/** Proactive contingencies whose sensors this shock's mutations can trip. */
export function answeringContingencies(config: SimulationConfig, e: ExternalEvent): Contingency[] {
  return config.contingencies.filter((c) => !c.intercepts?.length && c.sensors.some((s) => e.mutations.some((m) => couldSatisfy(m, s))));
}

export interface ShockCover {
  shock: ExternalEvent;
  highRisk: boolean;
  interceptedBy: Contingency[]; // armed rules that cancel it when it hits
  answeredBy: Contingency[]; // rules whose sensors it can trip afterwards
  covered: boolean;
  hitMass: number; // probability mass where it hit unopposed
  interceptedMass: number; // probability mass where a contingency cancelled it
}

export interface BlindSpot {
  shock: ExternalEvent;
  probability: number; // mass of dead ends this shock caused
  nodes: SimNode[]; // the terminal states it left behind
  best: SimNode; // the most likely of them, for the story view
}

export interface Resilience {
  shocks: ShockCover[];
  highRisk: number;
  coveredHighRisk: number;
  coverage: number | null; // null when the scenario has no high-risk shocks
  blindSpots: BlindSpot[];
  blindSpotMass: number;
  activations: Map<string, number>; // contingency id -> probability mass where it fired
  dormant: Contingency[]; // never fired in this run
}

/**
 * Contingency coverage is static: does every high-risk shock have an If-Then
 * rule that intercepts it or reacts to what it changes? Blind spots come from
 * the run: terminal states reached straight from an unopposed high-risk
 * shock, so the story ended before any sensor could trip.
 */
export function computeResilience(config: SimulationConfig, result: SimResult): Resilience {
  const hit = new Map<string, number>();
  const intercepted = new Map<string, number>();
  const activations = new Map<string, number>();
  const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);
  for (const e of result.edges) {
    if (e.kind === 'shock') add(hit, e.refId, e.flow);
    else if (e.kind === 'intercept') {
      const [shockId, rest] = e.refId.split('>');
      add(intercepted, shockId, e.flow);
      add(activations, rest.split(':')[0], e.flow);
    } else if (e.kind === 'contingency') add(activations, e.refId.split(':')[0], e.flow);
  }

  const shocks: ShockCover[] = config.externalEvents.map((shock) => {
    const interceptedBy = config.contingencies.filter((c) => c.intercepts?.includes(shock.id));
    const answeredBy = answeringContingencies(config, shock);
    return {
      shock,
      highRisk: isHighRisk(shock),
      interceptedBy,
      answeredBy,
      covered: interceptedBy.length > 0 || answeredBy.length > 0,
      hitMass: hit.get(shock.id) ?? 0,
      interceptedMass: intercepted.get(shock.id) ?? 0,
    };
  });
  const high = shocks.filter((s) => s.highRisk);
  const coveredHighRisk = high.filter((s) => s.covered).length;

  const byShock = new Map(config.externalEvents.map((e) => [e.id, e]));
  const spots = new Map<string, BlindSpot>();
  for (const e of result.edges) {
    const t = result.nodes[e.target];
    if (e.kind !== 'shock' || !t?.terminal || t.terminalReason !== 'noMoves') continue;
    const shock = byShock.get(e.refId);
    if (!shock || !isHighRisk(shock)) continue;
    let b = spots.get(shock.id);
    if (!b) {
      b = { shock, probability: 0, nodes: [], best: t };
      spots.set(shock.id, b);
    }
    b.probability += e.flow;
    if (!b.nodes.includes(t)) b.nodes.push(t);
    if (t.bestPathP > b.best.bestPathP) b.best = t;
  }
  const blindSpots = [...spots.values()].sort((a, b) => b.probability - a.probability);

  return {
    shocks,
    highRisk: high.length,
    coveredHighRisk,
    coverage: high.length ? coveredHighRisk / high.length : null,
    blindSpots,
    blindSpotMass: blindSpots.reduce((s, b) => s + b.probability, 0),
    activations,
    dormant: config.contingencies.filter((c) => !activations.get(c.id)),
  };
}
