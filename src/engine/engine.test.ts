import { describe, expect, it } from 'vitest';
import { sampleScenario } from '../data/sampleScenario';
import type { SimulationConfig } from '../types/simulation';
import { computeOutcomes, computeResilience } from './analysis';
import { buildDoctrine } from './doctrine';
import { parseConfig, parseConfigJson } from './schema';
import { simulate } from './simulate';
import { applyMutations, checkPrecondition, clockAt } from './state';

const base = (over: Partial<SimulationConfig>): SimulationConfig => ({
  schemaVersion: 2,
  maxDepth: 5,
  pruneThreshold: 0,
  actors: [],
  initialState: {},
  externalEvents: [],
  contingencies: [],
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
    externalEvents: [
      { id: 'A', title: 'A', probability: 0.5, conditions: [], mutations: [{ variableId: 'a', action: 'set', value: true }] },
      { id: 'B', title: 'B', probability: 0.5, conditions: [], mutations: [{ variableId: 'b', action: 'set', value: true }] },
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
    const quiet = { ...ab, includeQuietSteps: true, externalEvents: ab.externalEvents.map((e) => ({ ...e, probability: 0.2 })) };
    expect(sumTerminals(quiet)).toBeCloseTo(1);
    expect(sumTerminals({ ...sampleScenario, choicePolicy: 'uniform' })).toBeCloseTo(1);
    expect(sumTerminals({ ...sampleScenario, choicePolicy: 'uniform', pruneThreshold: 0.02 })).toBeCloseTo(1);
  });

  it('respects preconditions so order matters only where causality says so', () => {
    const cfg = base({
      initialState: { door: false, inside: false },
      externalEvents: [
        { id: 'open', title: 'Open', probability: 0.5, conditions: [], mutations: [{ variableId: 'door', action: 'set', value: true }] },
        { id: 'enter', title: 'Enter', probability: 0.5, conditions: [{ variableId: 'door', operator: '==', value: true }], mutations: [{ variableId: 'inside', action: 'set', value: true }] },
      ],
    });
    const r = simulate(cfg);
    // "enter" can never happen before "open"
    for (const e of r.edges.filter((e) => e.refId === 'enter')) expect(r.nodes[e.source].state.door).toBe(true);
  });

  it('branches on contingency actions; conditional policy gives each branch full weight', () => {
    const cfg = base({
      initialState: { x: 0 },
      contingencies: [{ id: 'd', title: 'D', sensors: [], actions: [
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
      externalEvents: Array.from({ length: 6 }, (_, i) => ({ id: `e${i}`, title: `e${i}`, probability: 0.5, repeatable: true, conditions: [], mutations: [{ variableId: 'n', action: 'increment' as const, value: i + 1 }] })),
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
    const dup = { ...sampleScenario, externalEvents: [sampleScenario.externalEvents[0], sampleScenario.externalEvents[0]] };
    expect(parseConfig(dup).ok).toBe(false);
  });
});

describe('war room engine', () => {
  const drain = { id: 'drain', title: 'Drain', probability: 1, repeatable: true, conditions: [{ variableId: 'cash', operator: '>' as const, value: 0 }], mutations: [{ variableId: 'cash', action: 'decrement' as const, value: 1 }] };

  it('trips sensors before the next shock can hit', () => {
    const cfg = base({
      maxDepth: 6,
      initialState: { cash: 3, plan: 'A' },
      externalEvents: [drain],
      contingencies: [{ id: 'b', title: 'Plan B', sensors: [{ variableId: 'cash', operator: '<', value: 2 }], actions: [{ id: 'go', label: 'Sell car', mutations: [{ variableId: 'cash', action: 'increment', value: 5 }, { variableId: 'plan', action: 'set', value: 'B' }] }] }],
    });
    const r = simulate(cfg);
    const fire = r.edges.find((e) => e.kind === 'contingency');
    expect(fire).toBeDefined();
    // It fires in the first state where cash < 2, not a shock later.
    expect(r.nodes[fire!.source].state.cash).toBe(1);
    expect(r.nodes[fire!.source].pendingContingency).toBe('b');
  });

  it('lets an armed contingency intercept a shock and cancel its effects', () => {
    const cfg = base({
      initialState: { armed: true, hurt: false, dodged: false },
      externalEvents: [{ id: 'ambush', title: 'Ambush', probability: 1, conditions: [], mutations: [{ variableId: 'hurt', action: 'set', value: true }] }],
      contingencies: [{ id: 'shield', title: 'Shield', sensors: [{ variableId: 'armed', operator: '==', value: true }], intercepts: ['ambush'], actions: [{ id: 'dodge', label: 'Dodge', mutations: [{ variableId: 'dodged', action: 'set', value: true }] }] }],
    });
    const r = simulate(cfg);
    expect(r.edges.map((e) => e.kind)).toEqual(['intercept']);
    const end = computeOutcomes(r)[0].state;
    expect(end).toMatchObject({ hurt: false, dodged: true });
    // Disarmed, the same shock hits unopposed.
    const off = computeOutcomes(simulate({ ...cfg, initialState: { ...cfg.initialState, armed: false } }))[0].state;
    expect(off).toMatchObject({ hurt: true, dodged: false });
  });

  it('waits for scheduled shocks and date sensors', () => {
    const cfg = base({
      maxDepth: 8,
      timeline: { unit: 'week', start: '2026-10-03' },
      initialState: { war: false, plan: 'A' },
      externalEvents: [{ id: 'war', title: 'War starts', probability: 1, window: { from: 3 }, conditions: [], mutations: [{ variableId: 'war', action: 'set', value: true }] }],
      contingencies: [{ id: 'dl', title: 'Deadline', sensors: [{ variableId: 'date', operator: '>=', value: '2026-10-31' }], actions: [{ id: 'go', label: 'Leave', mutations: [{ variableId: 'plan', action: 'set', value: 'left' }] }] }],
    });
    expect(clockAt(cfg.timeline, 4).date).toBe('2026-10-31');
    const r = simulate(cfg);
    const war = r.edges.find((e) => e.refId === 'war')!;
    expect(r.nodes[war.source].depth).toBe(3);
    const leave = r.edges.find((e) => e.kind === 'contingency')!;
    expect(r.nodes[leave.source].depth).toBe(4);
    expect(r.edges.filter((e) => e.kind === 'quiet').length).toBeGreaterThan(0);
  });

  it('scores coverage and finds blind spots', () => {
    const cfg = base({
      initialState: { armed: true, phase: 'go', out: 'none' },
      externalEvents: [
        { id: 'covered', title: 'Covered', probability: 0.5, severity: 'critical', conditions: [{ variableId: 'phase', operator: '==', value: 'go' }], mutations: [{ variableId: 'phase', action: 'set', value: 'end' }] },
        { id: 'naked', title: 'Naked', probability: 0.5, severity: 'high', conditions: [{ variableId: 'phase', operator: '==', value: 'go' }], mutations: [{ variableId: 'phase', action: 'set', value: 'dead' }] },
        { id: 'minor', title: 'Minor', probability: 0.1, severity: 'low', conditions: [{ variableId: 'phase', operator: '==', value: 'nothing' }], mutations: [] },
      ],
      contingencies: [{ id: 'c', title: 'C', sensors: [{ variableId: 'armed', operator: '==', value: true }], intercepts: ['covered'], actions: [{ id: 'a', label: 'A', mutations: [{ variableId: 'phase', action: 'set', value: 'safe' }] }] }],
    });
    const res = computeResilience(cfg, simulate(cfg));
    expect(res.highRisk).toBe(2);
    expect(res.coverage).toBe(0.5);
    expect(res.blindSpots.map((b) => b.shock.id)).toEqual(['naked']);
    expect(res.blindSpotMass).toBeCloseTo(0.5);
    expect(res.dormant).toEqual([]);
  });

  it('draws sensor triggers and filters doctrine layers', () => {
    const all = buildDoctrine(sampleScenario);
    expect(all.edges.some((e) => e.kind === 'trigger' && e.source === 'sensor:savings' && e.target === 'cont:runway')).toBe(true);
    expect(all.edges.some((e) => e.kind === 'intercept' && e.target === 'shock:partner_leaves')).toBe(true);
    expect(all.edges.some((e) => e.kind === 'causal' && e.source === 'shock:burn_savings' && e.target === 'sensor:savings')).toBe(true);
    expect(buildDoctrine(sampleScenario, 'shocks').nodes.every((n) => n.kind === 'shock')).toBe(true);
    expect(buildDoctrine(sampleScenario, 'contingencies').nodes.some((n) => n.kind === 'shock')).toBe(false);
  });
});

describe('legacy import', () => {
  it('migrates v1 events and decisions', () => {
    const v1 = {
      maxDepth: 3, pruneThreshold: 0, actors: [], initialState: { x: 0 },
      events: [{ id: 'e', title: 'E', probability: 0.5, preconditions: [], mutations: [] }],
      decisions: [{ id: 'd', title: 'D', preconditions: [{ variableId: 'x', operator: '==', value: 0 }], choices: [{ id: 'c', label: 'C', preconditions: [], mutations: [] }] }],
    };
    const r = parseConfig(v1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.migrated).toBe(true);
    expect(r.config.externalEvents[0].conditions).toEqual([]);
    expect(r.config.contingencies[0].sensors).toEqual(v1.decisions[0].preconditions);
    expect(r.config.contingencies[0].actions[0]).toMatchObject({ id: 'c', requires: [] });
  });
});
