import type { Contingency, ContingencyAction, SimNode, SimResult, SimulationConfig, Value } from '../types/simulation';
import { simulateExhaustive, type Plan } from './simulate';
import { stateKeys } from './state';

// "If she chooses A, then B, then C, where does she end up?"
//
// A decision is a contingency where the actor really had a choice: some state
// in the run offered two or more of its actions. A plan fixes one action per
// decision. Each plan is simulated on its own, so every probability in its
// outcome table is conditional on that plan, with the random events averaged in.

export interface Decision {
  contingency: Contingency;
  actions: ContingencyAction[];
  firstDepth: number; // earliest tick it came up, for ordering the steps
}

export interface PlanStep {
  decision: Decision;
  action: ContingencyAction;
  probability: number; // share of runs under this plan in which the decision came up
}

export interface NumericSummary {
  mean: number;
  min: number;
  max: number;
}

export interface OutcomeGroup {
  key: string;
  values: Record<string, Value | undefined>; // the outcome variables
  probability: number; // conditional on the plan
  numeric: Record<string, NumericSummary>;
  example: SimNode;
}

export interface PlanResult {
  id: string;
  plan: Plan;
  steps: PlanStep[]; // only the decisions that came up under this plan, in order
  groups: OutcomeGroup[];
  numeric: Record<string, NumericSummary>;
  coverage: number; // share of probability mass that reached an end state (the rest was pruned)
  truncated: boolean;
  result: SimResult; // the plan's own run, for telling the story of an ending
}

export interface PlanAnalysis {
  decisions: Decision[];
  plans: PlanResult[];
  outcomeKeys: string[];
  numericKeys: string[];
  capped: boolean; // more plan combinations existed than were simulated
}

export const MAX_PLANS = 64;

function ruleOf(refId: string): [string, string] {
  const [cid, aid] = refId.split('>').pop()!.split(':');
  return [cid, aid];
}

/** Contingencies that offered two or more actions somewhere in this run. */
export function findDecisions(config: SimulationConfig, result: SimResult): Decision[] {
  const offered = new Map<string, Map<string, Set<string>>>(); // place -> contingency -> actions
  const firstDepth = new Map<string, number>();
  for (const e of result.edges) {
    if (e.kind !== 'contingency' && e.kind !== 'intercept') continue;
    const [cid, aid] = ruleOf(e.refId);
    const place = e.kind === 'intercept' ? `${e.source}>${e.refId.split('>')[0]}` : e.source;
    let byRule = offered.get(place);
    if (!byRule) offered.set(place, (byRule = new Map()));
    let acts = byRule.get(cid);
    if (!acts) byRule.set(cid, (acts = new Set()));
    acts.add(aid);
    const d = result.nodes[e.source]?.depth ?? 0;
    firstDepth.set(cid, Math.min(firstDepth.get(cid) ?? Infinity, d));
  }
  const chosen = new Set<string>();
  for (const byRule of offered.values()) for (const [cid, acts] of byRule) if (acts.size > 1) chosen.add(cid);
  return config.contingencies
    .filter((c) => chosen.has(c.id))
    .map((c) => ({ contingency: c, actions: c.actions, firstDepth: firstDepth.get(c.id) ?? 0 }))
    .sort((a, b) => a.firstDepth - b.firstDepth);
}

/** Every combination of one action per decision, up to `cap`. */
export function enumeratePlans(decisions: Decision[], cap = MAX_PLANS): { plans: Plan[]; capped: boolean } {
  let plans: Plan[] = [{}];
  let capped = false;
  for (const d of decisions) {
    const next: Plan[] = [];
    for (const p of plans) for (const a of d.actions) next.push({ ...p, [d.contingency.id]: a.id });
    if (next.length > cap) {
      capped = true;
      plans = next.slice(0, cap);
    } else plans = next;
  }
  return { plans, capped };
}

/** The scenario's own outcomeVariables, or every key that differs between end states. Numbers are averaged, the rest group the endings. */
export function pickOutcomeKeys(config: SimulationConfig, result: SimResult): { outcomeKeys: string[]; numericKeys: string[] } {
  const terminals = Object.values(result.nodes).filter((n) => n.terminal);
  const keys = stateKeys(config);
  const varies = (k: string) => new Set(terminals.map((n) => String(n.state[k]))).size > 1;
  const isNumeric = (k: string) => terminals.length > 0 && terminals.every((n) => typeof n.state[k] === 'number');
  const listed = (config.outcomeVariables ?? []).filter((k) => keys.includes(k));
  const pool = listed.length ? listed : keys.filter(varies);
  return { outcomeKeys: pool.filter((k) => !isNumeric(k)), numericKeys: pool.filter(isNumeric) };
}

function summarize(items: { p: number; v: number }[]): NumericSummary {
  const total = items.reduce((s, x) => s + x.p, 0) || 1;
  return {
    mean: items.reduce((s, x) => s + x.p * x.v, 0) / total,
    min: Math.min(...items.map((x) => x.v)),
    max: Math.max(...items.map((x) => x.v)),
  };
}

/** Simulates one plan exhaustively and folds its end states into outcome groups. */
export function evaluatePlan(config: SimulationConfig, plan: Plan, decisions: Decision[], outcomeKeys: string[], numericKeys: string[], id = 'p'): PlanResult {
  const cfg: SimulationConfig = {
    ...config,
    mode: 'exhaustive',
    choicePolicy: 'uniform', // a planned rule has one action, so this only splits mass where the plan falls back
    pruneThreshold: Math.min(config.pruneThreshold, 1e-4),
    maxNodes: Math.min(50_000, Math.max(config.maxNodes ?? 4000, 20_000)),
  };
  const result = simulateExhaustive(cfg, plan);
  const terminals = Object.values(result.nodes).filter((n) => n.terminal);
  const reached = terminals.reduce((s, n) => s + n.probability, 0);
  const norm = reached || 1;

  const fired = new Map<string, number>();
  for (const e of result.edges) {
    if (e.kind !== 'contingency' && e.kind !== 'intercept') continue;
    const [cid, aid] = ruleOf(e.refId);
    if (plan[cid] === aid) fired.set(cid, (fired.get(cid) ?? 0) + e.flow);
  }
  const steps: PlanStep[] = decisions
    .filter((d) => (fired.get(d.contingency.id) ?? 0) > 0)
    .map((d) => ({ decision: d, action: d.actions.find((a) => a.id === plan[d.contingency.id])!, probability: Math.min(1, fired.get(d.contingency.id)! / norm) }));

  const byKey = new Map<string, { values: Record<string, Value | undefined>; p: number; nodes: SimNode[] }>();
  for (const n of terminals) {
    const values = Object.fromEntries(outcomeKeys.map((k) => [k, n.state[k]]));
    const key = JSON.stringify(outcomeKeys.map((k) => n.state[k]));
    let g = byKey.get(key);
    if (!g) byKey.set(key, (g = { values, p: 0, nodes: [] }));
    g.p += n.probability;
    g.nodes.push(n);
  }
  const numericOf = (nodes: SimNode[]) =>
    Object.fromEntries(numericKeys.map((k) => [k, summarize(nodes.map((n) => ({ p: n.probability, v: Number(n.state[k]) })))]));
  const groups: OutcomeGroup[] = [...byKey.entries()]
    .map(([key, g]) => ({
      key,
      values: g.values,
      probability: g.p / norm,
      numeric: numericOf(g.nodes),
      example: g.nodes.reduce((a, b) => (b.probability > a.probability ? b : a)),
    }))
    .sort((a, b) => b.probability - a.probability);

  return {
    id,
    plan,
    steps,
    groups,
    numeric: numericOf(terminals),
    coverage: reached / (reached + result.stats.prunedMass || 1),
    truncated: result.stats.truncated,
    result,
  };
}

/** All distinct plans for a scenario. Plans that only differ in decisions that never come up are merged. */
export function analyzePlans(config: SimulationConfig, result: SimResult, cap = MAX_PLANS): PlanAnalysis {
  const decisions = findDecisions(config, result);
  const { outcomeKeys, numericKeys } = pickOutcomeKeys(config, result);
  const { plans, capped } = enumeratePlans(decisions, cap);
  const seen = new Set<string>();
  const out: PlanResult[] = [];
  for (const plan of plans) {
    const r = evaluatePlan(config, plan, decisions, outcomeKeys, numericKeys, `plan${out.length + 1}`);
    const sig = r.steps.map((s) => `${s.decision.contingency.id}:${s.action.id}`).join('|');
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push(r);
  }
  return { decisions, plans: out, outcomeKeys, numericKeys, capped };
}
