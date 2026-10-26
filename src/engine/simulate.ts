import type { SimEdge, SimNode, SimResult, SimulationConfig, WorldState } from '../types/simulation';
import { applyMutations, buildInitialState, checkAll, stateSignature } from './state';

export const DEFAULT_MAX_NODES = 4000;

interface Move {
  kind: SimEdge['kind'];
  refId: string;
  label: string;
  p: number;
  state: WorldState;
  fired: string[];
}

/** Decisions that already happened are stored in `fired` as "<decisionId>:<choiceId>". */
function decisionTaken(fired: string[], decisionId: string): boolean {
  const prefix = `${decisionId}:`;
  return fired.some((f) => f.startsWith(prefix));
}

/**
 * Everything that can happen next from a state. An open decision always takes
 * the step (the protagonist must choose before the world moves on). Otherwise
 * every eligible event competes for the step, weighted by its probability.
 */
export function getMoves(config: SimulationConfig, node: Pick<SimNode, 'state' | 'fired'>, sampling = false): { moves: Move[]; decisionId?: string } {
  const { state, fired } = node;
  const firedSet = new Set(fired);

  for (const d of config.decisions) {
    if (decisionTaken(fired, d.id) || !checkAll(state, d.preconditions)) continue;
    const valid = d.choices.filter((c) => checkAll(state, c.preconditions));
    if (!valid.length) continue;
    const uniform = sampling || config.choicePolicy === 'uniform';
    return {
      decisionId: d.id,
      moves: valid.map((c) => ({
        kind: 'choice',
        refId: `${d.id}:${c.id}`,
        label: `${d.title}: ${c.label}`,
        p: uniform ? 1 / valid.length : 1,
        state: applyMutations(state, c.mutations),
        fired: [...fired, `${d.id}:${c.id}`],
      })),
    };
  }

  const eligible = config.events.filter(
    (e) => e.probability > 0 && (e.repeatable || !firedSet.has(e.id)) && checkAll(state, e.preconditions),
  );
  if (!eligible.length) return { moves: [] };

  const total = eligible.reduce((s, e) => s + e.probability, 0);
  const quiet = config.includeQuietSteps && total < 1 ? 1 - total : 0;
  const norm = quiet > 0 ? 1 : total;
  const moves: Move[] = eligible.map((e) => ({
    kind: 'event',
    refId: e.id,
    label: e.title,
    p: e.probability / norm,
    state: applyMutations(state, e.mutations),
    fired: e.repeatable ? fired : [...fired, e.id],
  }));
  if (quiet > 0) moves.push({ kind: 'quiet', refId: '__quiet', label: 'Nothing happens', p: quiet, state, fired });
  return { moves };
}

function newNode(id: string, depth: number, state: WorldState, fired: string[]): SimNode {
  return { id, depth, state, fired, probability: 0, pathCount: 0, bestPathP: 0, terminal: false };
}

export function simulate(config: SimulationConfig): SimResult {
  return config.mode === 'montecarlo' ? simulateMonteCarlo(config) : simulateExhaustive(config);
}

/**
 * Breadth-first, one depth level at a time. Identical (state, used events)
 * pairs at the same depth are merged, so "A then B" and "B then A" become one
 * node whose probability is the sum of both routes. Because a level is fully
 * accumulated before it is expanded, pruning compares exact merged mass.
 */
export function simulateExhaustive(config: SimulationConfig): SimResult {
  const t0 = performance.now();
  const maxNodes = config.maxNodes ?? DEFAULT_MAX_NODES;
  const nodes: Record<string, SimNode> = {};
  const edges: SimEdge[] = [];
  let nodeSeq = 0;
  let edgeSeq = 0;
  let prunedMass = 0;
  let prunedNodes = 0;
  let merged = 0;
  let truncated = false;

  const root = newNode(`n${nodeSeq++}`, 0, buildInitialState(config), []);
  root.probability = 1;
  root.pathCount = 1;
  root.bestPathP = 1;
  nodes[root.id] = root;
  let frontier: SimNode[] = [root];

  for (let depth = 0; frontier.length; depth++) {
    const next = new Map<string, SimNode>();
    const levelEdges: SimEdge[] = [];
    for (const node of frontier) {
      if (depth >= config.maxDepth) {
        node.terminal = true;
        node.terminalReason = 'maxDepth';
        continue;
      }
      const { moves, decisionId } = getMoves(config, node);
      if (!moves.length) {
        node.terminal = true;
        node.terminalReason = 'noMoves';
        continue;
      }
      node.pendingDecision = decisionId;
      for (const mv of moves) {
        const sig = stateSignature(mv.state, mv.fired);
        let child = next.get(sig);
        if (!child) {
          child = newNode(`n${nodeSeq++}`, depth + 1, mv.state, mv.fired);
          next.set(sig, child);
        } else merged++;
        const flow = node.probability * mv.p;
        const edge: SimEdge = {
          id: `e${edgeSeq++}`,
          source: node.id,
          target: child.id,
          kind: mv.kind,
          refId: mv.refId,
          label: mv.label,
          probability: mv.p,
          flow,
        };
        child.probability += flow;
        child.pathCount += node.pathCount;
        const bp = node.bestPathP * mv.p;
        if (bp > child.bestPathP) {
          child.bestPathP = bp;
          child.bestParent = node.id;
          child.bestEdge = edge.id;
        }
        levelEdges.push(edge);
      }
    }

    let survivors: SimNode[] = [];
    for (const c of next.values()) {
      if (c.probability < config.pruneThreshold) {
        prunedMass += c.probability;
        prunedNodes++;
      } else survivors.push(c);
    }
    const room = maxNodes - Object.keys(nodes).length;
    if (survivors.length > room) {
      truncated = true;
      survivors.sort((a, b) => b.probability - a.probability);
      for (const c of survivors.slice(Math.max(room, 0))) {
        prunedMass += c.probability;
        prunedNodes++;
      }
      survivors = survivors.slice(0, Math.max(room, 0));
    }
    const keep = new Set(survivors.map((s) => s.id));
    for (const s of survivors) nodes[s.id] = s;
    for (const e of levelEdges) if (keep.has(e.target)) edges.push(e);
    frontier = survivors;
  }

  return finish(root.id, nodes, edges, { prunedMass, prunedNodes, truncated, mergedArrivals: merged, t0 });
}

/** Small, fast, seedable PRNG so Monte Carlo runs are reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Samples `runs` paths and folds them into the same depth-keyed DAG. Node and
 * edge probabilities are observed frequencies. Choices are sampled uniformly.
 */
export function simulateMonteCarlo(config: SimulationConfig): SimResult {
  const t0 = performance.now();
  const runs = config.runs ?? 2000;
  const maxNodes = config.maxNodes ?? DEFAULT_MAX_NODES;
  const rand = mulberry32(config.seed ?? 42);
  const byKey = new Map<string, SimNode>();
  const counts = new Map<string, number>();
  const edgeByKey = new Map<string, SimEdge & { count: number }>();
  const movesCache = new Map<string, ReturnType<typeof getMoves>>();
  let nodeSeq = 0;
  let edgeSeq = 0;
  let truncated = false;

  const root = newNode(`n${nodeSeq++}`, 0, buildInitialState(config), []);
  byKey.set(`0|${stateSignature(root.state, root.fired)}`, root);

  for (let r = 0; r < runs; r++) {
    let cur = root;
    counts.set(cur.id, (counts.get(cur.id) ?? 0) + 1);
    while (true) {
      if (cur.depth >= config.maxDepth) {
        cur.terminal = true;
        cur.terminalReason = 'maxDepth';
        break;
      }
      let m = movesCache.get(cur.id);
      if (!m) {
        m = getMoves(config, cur, true);
        movesCache.set(cur.id, m);
      }
      if (!m.moves.length) {
        cur.terminal = true;
        cur.terminalReason = 'noMoves';
        break;
      }
      cur.pendingDecision = m.decisionId;
      const total = m.moves.reduce((s, mv) => s + mv.p, 0);
      let x = rand() * total;
      let mv = m.moves[m.moves.length - 1];
      for (const cand of m.moves) {
        x -= cand.p;
        if (x < 0) {
          mv = cand;
          break;
        }
      }
      const key = `${cur.depth + 1}|${stateSignature(mv.state, mv.fired)}`;
      let child = byKey.get(key);
      if (!child) {
        if (byKey.size >= maxNodes) {
          truncated = true;
          break;
        }
        child = newNode(`n${nodeSeq++}`, cur.depth + 1, mv.state, mv.fired);
        byKey.set(key, child);
      }
      const ek = `${cur.id}>${child.id}|${mv.refId}`;
      let edge = edgeByKey.get(ek);
      if (!edge) {
        edge = { id: `e${edgeSeq++}`, source: cur.id, target: child.id, kind: mv.kind, refId: mv.refId, label: mv.label, probability: 0, flow: 0, count: 0 };
        edgeByKey.set(ek, edge);
      }
      edge.count++;
      counts.set(child.id, (counts.get(child.id) ?? 0) + 1);
      cur = child;
    }
  }

  const all = [...byKey.values()];
  for (const n of all) n.probability = (counts.get(n.id) ?? 0) / runs;
  const allEdges = [...edgeByKey.values()];
  for (const e of allEdges) {
    e.flow = e.count / runs;
    e.probability = e.count / (counts.get(e.source) ?? 1);
  }

  // Prune rare states, then anything no longer reachable from the root.
  const keepIds = new Set(all.filter((n) => n === root || n.probability >= config.pruneThreshold).map((n) => n.id));
  const reachable = new Set([root.id]);
  const sortedEdges = allEdges.filter((e) => keepIds.has(e.source) && keepIds.has(e.target));
  const nodeById = new Map(all.map((n) => [n.id, n]));
  sortedEdges.sort((a, b) => nodeById.get(a.source)!.depth - nodeById.get(b.source)!.depth);
  const edges: SimEdge[] = [];
  for (const e of sortedEdges) {
    if (!reachable.has(e.source)) continue;
    reachable.add(e.target);
    const { count: _count, ...plain } = e;
    edges.push(plain);
  }
  const nodes: Record<string, SimNode> = {};
  let prunedMass = 0;
  let prunedNodes = 0;
  for (const n of all) {
    if (reachable.has(n.id)) nodes[n.id] = n;
    else {
      prunedNodes++;
      if (n.terminal) prunedMass += n.probability;
    }
  }

  // Most-likely route and ordering counts, swept in depth order.
  root.bestPathP = 1;
  root.pathCount = 1;
  for (const e of edges) {
    const s = nodes[e.source];
    const t = nodes[e.target];
    t.pathCount += s.pathCount;
    const bp = s.bestPathP * e.probability;
    if (bp > t.bestPathP) {
      t.bestPathP = bp;
      t.bestParent = s.id;
      t.bestEdge = e.id;
    }
  }

  return finish(root.id, nodes, edges, { prunedMass, prunedNodes, truncated, mergedArrivals: 0, t0 });
}

function finish(
  rootId: string,
  nodes: Record<string, SimNode>,
  edges: SimEdge[],
  s: { prunedMass: number; prunedNodes: number; truncated: boolean; mergedArrivals: number; t0: number },
): SimResult {
  const list = Object.values(nodes);
  return {
    rootId,
    nodes,
    edges,
    stats: {
      nodes: list.length,
      edges: edges.length,
      terminals: list.filter((n) => n.terminal).length,
      prunedMass: s.prunedMass,
      prunedNodes: s.prunedNodes,
      truncated: s.truncated,
      mergedArrivals: s.mergedArrivals,
      ms: Math.round(performance.now() - s.t0),
    },
  };
}
