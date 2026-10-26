import { describe, expect, it } from 'vitest';
import { sampleScenario } from '../data/sampleScenario';
import type { SimulationConfig } from '../types/simulation';
import { computeOutcomes } from './analysis';
import { parseConfig, parseConfigJson } from './schema';
import { simulate } from './simulate';
import { applyMutations, checkPrecondition } from './state';

const base = (over: Partial<SimulationConfig>): SimulationConfig => ({
  maxDepth: 5,
  pruneThreshold: 0,
  actors: [],
  initialState: {},
  events: [],
  decisions: [],
  ...over,
});

const sumTerminals = (cfg: SimulationConfig) => {
  const r = simulate(cfg);
  return Object.values(r.nodes).filter((n) => n.terminal).reduce((s, n) => s + n.probability, 0) + r.stats.prunedMass;
};

describe('state', () => {
  it('evaluates operators', () => {
    const s = { n: 3, b: true, t: 'Hello world' };
    expect(checkPrecondition(s, { variableId: 'n', operator: '>=', value: 3 })).toBe(true);
    expect(checkPrecondition(s, { variableId: 'n', operator: '<', value: 3 })).toBe(false);
    expect(checkPrecondition(s, { variableId: 'b', operator: '==', value: 'true' })).toBe(true);
    expect(checkPrecondition(s, { variableId: 't', operator: 'contains', value: 'WORLD' })).toBe(true);
    expect(checkPrecondition(s, { variableId: 'missing', operator: '!=', value: 1 })).toBe(true);
  });

  it('applies mutations without touching the input', () => {
    const s = { n: 1, b: false };
    const out = applyMutations(s, [
      { variableId: 'n', action: 'increment', value: 0.1 },
      { variableId: 'n', action: 'increment', value: 0.2 },
      { variableId: 'b', action: 'toggle' },
    ]);
    expect(out).toEqual({ n: 1.3, b: true });
    expect(s).toEqual({ n: 1, b: false });
  });
});

describe('exhaustive engine', () => {
  const ab = base({
    initialState: { a: false, b: false },
    events: [
      { id: 'A', title: 'A', probability: 0.5, preconditions: [], mutations: [{ variableId: 'a', action: 'set', value: true }] },
      { id: 'B', title: 'B', probability: 0.5, preconditions: [], mutations: [{ variableId: 'b', action: 'set', value: true }] },
    ],
  });

  it('merges A-then-B and B-then-A into one state', () => {
    const r = simulate(ab);
    const both = Object.values(r.nodes).filter((n) => n.state.a && n.state.b);
    expect(both).toHaveLength(1);
    expect(both[0].pathCount).toBe(2);
    expect(both[0].probability).toBeCloseTo(1);
    expect(r.stats.mergedArrivals).toBe(1);
  });

  it('conserves probability mass, with and without quiet steps and pruning', () => {
    expect(sumTerminals(ab)).toBeCloseTo(1);
    const quiet = { ...ab, includeQuietSteps: true, events: ab.events.map((e) => ({ ...e, probability: 0.2 })) };
    expect(sumTerminals(quiet)).toBeCloseTo(1);
    expect(sumTerminals({ ...sampleScenario, choicePolicy: 'uniform' })).toBeCloseTo(1);
    expect(sumTerminals({ ...sampleScenario, choicePolicy: 'uniform', pruneThreshold: 0.02 })).toBeCloseTo(1);
  });

  it('respects preconditions so order matters only where causality says so', () => {
    const cfg = base({
      initialState: { door: false, inside: false },
      events: [
        { id: 'open', title: 'Open', probability: 0.5, preconditions: [], mutations: [{ variableId: 'door', action: 'set', value: true }] },
        { id: 'enter', title: 'Enter', probability: 0.5, preconditions: [{ variableId: 'door', operator: '==', value: true }], mutations: [{ variableId: 'inside', action: 'set', value: true }] },
      ],
    });
    const r = simulate(cfg);
    // "enter" can never happen before "open"
    for (const e of r.edges.filter((e) => e.refId === 'enter')) expect(r.nodes[e.source].state.door).toBe(true);
  });

  it('branches on decisions; conditional policy gives each branch full weight', () => {
    const cfg = base({
      initialState: { x: 0 },
      decisions: [{ id: 'd', title: 'D', preconditions: [], choices: [
        { id: 'l', label: 'L', mutations: [{ variableId: 'x', action: 'set', value: 1 }] },
        { id: 'r', label: 'R', mutations: [{ variableId: 'x', action: 'set', value: 2 }] },
      ] }],
    });
    const outcomes = computeOutcomes(simulate(cfg));
    expect(outcomes.map((o) => o.probability)).toEqual([1, 1]);
    const uni = computeOutcomes(simulate({ ...cfg, choicePolicy: 'uniform' }));
    expect(uni.map((o) => o.probability)).toEqual([0.5, 0.5]);
  });

  it('caps node count', () => {
    const cfg = base({
      maxDepth: 20,
      initialState: { n: 0 },
      events: Array.from({ length: 6 }, (_, i) => ({ id: `e${i}`, title: `e${i}`, probability: 0.5, repeatable: true, preconditions: [], mutations: [{ variableId: 'n', action: 'increment' as const, value: i + 1 }] })),
      maxNodes: 100,
    });
    const r = simulate(cfg);
    expect(r.stats.nodes).toBeLessThanOrEqual(100);
    expect(r.stats.truncated).toBe(true);
  });
});

describe('monte carlo', () => {
  it('is reproducible and approximates the exhaustive answer', () => {
    const cfg: SimulationConfig = { ...sampleScenario, choicePolicy: 'uniform', pruneThreshold: 0 };
    const exact = computeOutcomes(simulate(cfg));
    const mc1 = simulate({ ...cfg, mode: 'montecarlo', runs: 20000, seed: 7 });
    const mc2 = simulate({ ...cfg, mode: 'montecarlo', runs: 20000, seed: 7 });
    expect(mc1.stats.nodes).toBe(mc2.stats.nodes);
    const mcOut = computeOutcomes(mc1);
    const top = exact[0];
    const match = mcOut.find((o) => JSON.stringify(o.state) === JSON.stringify(top.state));
    expect(match).toBeDefined();
    expect(Math.abs(match!.probability - top.probability)).toBeLessThan(0.02);
  });
});

describe('schema', () => {
  it('accepts the sample and rejects bad input', () => {
    expect(parseConfig(sampleScenario).ok).toBe(true);
    expect(parseConfigJson('{').ok).toBe(false);
    expect(parseConfig({ ...sampleScenario, maxDepth: 1000 }).ok).toBe(false);
    // A "__proto__" key must never reach engine state as a prototype-polluting key.
    const evil = parseConfigJson(JSON.stringify(sampleScenario).replace('"initialState":{}', '"initialState":{"__proto__":{"polluted":1}}'));
    if (evil.ok) {
      expect(Object.hasOwn(evil.config.initialState, '__proto__')).toBe(false);
      expect(Object.getPrototypeOf(evil.config.initialState)).toBe(Object.prototype);
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    const dup = { ...sampleScenario, events: [sampleScenario.events[0], sampleScenario.events[0]] };
    expect(parseConfig(dup).ok).toBe(false);
  });
});
