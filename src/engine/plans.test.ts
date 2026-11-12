import { describe, expect, it } from 'vitest';
import { layoffRunway } from '../data/warRoom';
import type { SimulationConfig } from '../types/simulation';
import { analyzePlans, findDecisions } from './plans';
import { simulate } from './simulate';

// Choose to go out or stay in; going out risks rain (50%), and if it rains
// you either run home or wait it out under a tree.
const walk: SimulationConfig = {
  schemaVersion: 2,
  title: 'Walk',
  maxDepth: 6,
  pruneThreshold: 0,
  choicePolicy: 'uniform',
  includeQuietSteps: true,
  actors: [],
  initialState: {},
  variables: [
    { id: 'where', name: 'Where', type: 'string', initialValue: 'home' },
    { id: 'wet', name: 'Wet', type: 'boolean', initialValue: false },
    { id: 'fun', name: 'Fun', type: 'number', initialValue: 0 },
  ],
  externalEvents: [
    { id: 'rain', title: 'Rain', probability: 0.5, conditions: [{ variableId: 'where', operator: '==', value: 'park' }], mutations: [{ variableId: 'wet', action: 'set', value: true }], window: { from: 1, until: 1 } },
  ],
  contingencies: [
    {
      id: 'start',
      title: 'Go out?',
      sensors: [{ variableId: 'where', operator: '==', value: 'home' }],
      actions: [
        { id: 'out', label: 'Go to the park', mutations: [{ variableId: 'where', action: 'set', value: 'park' }, { variableId: 'fun', action: 'increment', value: 10 }] },
        { id: 'in', label: 'Stay in', mutations: [{ variableId: 'where', action: 'set', value: 'sofa' }] },
      ],
    },
    {
      id: 'rainy',
      title: 'It rains',
      sensors: [{ variableId: 'wet', operator: '==', value: true }],
      actions: [
        { id: 'run', label: 'Run home', mutations: [{ variableId: 'where', action: 'set', value: 'home, soaked' }, { variableId: 'fun', action: 'decrement', value: 5 }] },
        { id: 'tree', label: 'Wait under a tree', mutations: [{ variableId: 'where', action: 'set', value: 'tree' }] },
      ],
    },
  ],
};

describe('plans', () => {
  it('finds the contingencies that offered a real choice', () => {
    const d = findDecisions(walk, simulate(walk));
    expect(d.map((x) => x.contingency.id)).toEqual(['start', 'rainy']);
  });

  it('gives outcome probabilities conditional on each plan', () => {
    const a = analyzePlans(walk, simulate(walk));
    // "Stay in" never meets the rain decision, so its two combinations merge into one plan.
    expect(a.plans).toHaveLength(3);
    const label = (p: (typeof a.plans)[number]) => p.steps.map((s) => s.action.id).join('>');
    const byLabel = Object.fromEntries(a.plans.map((p) => [label(p), p]));
    expect(Object.keys(byLabel).sort()).toEqual(['in', 'out>run', 'out>tree']);

    const run = byLabel['out>run'];
    const total = run.groups.reduce((s, g) => s + g.probability, 0);
    expect(total).toBeCloseTo(1, 9);
    const soaked = run.groups.find((g) => g.values.where === 'home, soaked');
    expect(soaked?.probability).toBeCloseTo(0.5, 9);
    expect(run.steps.find((s) => s.decision.contingency.id === 'rainy')?.probability).toBeCloseTo(0.5, 9);
    expect(run.numeric.fun.mean).toBeCloseTo(7.5, 9);
    expect(run.numeric.fun.min).toBe(5);

    expect(byLabel.in.groups).toHaveLength(1);
    expect(byLabel.in.groups[0].probability).toBeCloseTo(1, 9);
  });

  it('honours outcomeVariables', () => {
    const a = analyzePlans({ ...walk, outcomeVariables: ['wet'] }, simulate(walk));
    expect(a.outcomeKeys).toEqual(['wet']);
    expect(a.numericKeys).toEqual([]);
    const b = analyzePlans(walk, simulate(walk));
    expect(b.outcomeKeys).toEqual(['where', 'wet']);
    expect(b.numericKeys).toEqual(['fun']);
  });

  it('works on the layoff example', () => {
    const a = analyzePlans(layoffRunway, simulate(layoffRunway));
    expect(a.decisions.map((d) => d.contingency.id)).toContain('checkpoint');
    for (const p of a.plans) expect(p.groups.reduce((s, g) => s + g.probability, 0)).toBeCloseTo(1, 6);
  });
});
