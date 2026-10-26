import type { SimEdge, SimNode, SimResult, WorldState } from '../types/simulation';
import { stateSignature } from './state';

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
