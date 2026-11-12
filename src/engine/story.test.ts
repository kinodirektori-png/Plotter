import { describe, expect, it } from 'vitest';
import { layoffRunway } from '../data/warRoom';
import type { SimulationConfig } from '../types/simulation';
import { choose, minorEvents, roll, startPoint, unfold } from './story';

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

describe('story', () => {
  it('starts at her first choice, with no probability on it', () => {
    const u = unfold(walk, startPoint(walk));
    expect(u.turns).toHaveLength(1);
    expect(u.turns[0].happenings).toEqual([]);
    const s = u.turns[0].stop;
    expect(s.kind).toBe('choice');
    if (s.kind === 'choice') expect(s.options.map((o) => o.action.id)).toEqual(['out', 'in']);
  });

  it('puts the probabilities on what happens after a choice', () => {
    const first = unfold(walk, startPoint(walk)).turns[0].stop;
    if (first.kind !== 'choice') throw new Error('expected a choice');
    const u = unfold(walk, choose(walk, first, 'out'));
    expect(u.turns).toHaveLength(2);
    const rain = u.turns.find((t) => t.happenings.some((h) => h.id === 'rain'))!;
    expect(rain.probability).toBeCloseTo(0.5, 9);
    expect(rain.stop.kind).toBe('choice');
    const dry = u.turns.find((t) => t.happenings.length === 0)!;
    expect(dry.probability).toBeCloseTo(0.5, 9);
    expect(dry.stop.kind).toBe('end');
    if (dry.stop.kind === 'end') {
      expect(dry.stop.values.where).toBe('park');
      expect(dry.stop.numeric.fun.mean).toBe(10);
    }
    if (rain.stop.kind !== 'choice') throw new Error('expected a choice');
    const after = unfold(walk, choose(walk, rain.stop, 'run'));
    expect(after.turns).toHaveLength(1);
    expect(after.turns[0].probability).toBeCloseTo(1, 9);
    expect(after.turns[0].stop.kind === 'end' && after.turns[0].stop.values.where).toBe('home, soaked');
  });

  it('rolls by probability', () => {
    const first = unfold(walk, startPoint(walk)).turns[0].stop;
    if (first.kind !== 'choice') throw new Error('expected a choice');
    const u = unfold(walk, choose(walk, first, 'out'));
    expect(roll(u, () => 0)).toBe(0);
    expect(roll(u, () => 0.999)).toBe(1);
  });

  it('keeps the probability mass of the layoff example', () => {
    const u = unfold(layoffRunway, startPoint(layoffRunway));
    const sum = u.turns.reduce((s, t) => s + t.probability, 0) + u.lost;
    expect(sum).toBeCloseTo(1, 6);
    expect(u.turns.length).toBeGreaterThan(0);
  });

  it('folds background events into the turn instead of splitting on them', () => {
    const cfg: SimulationConfig = {
      ...walk,
      externalEvents: [
        ...walk.externalEvents,
        { id: 'icecream', title: 'Ice cream van', probability: 0.25, severity: 'low', conditions: [{ variableId: 'where', operator: '==', value: 'park' }], mutations: [{ variableId: 'fun', action: 'increment', value: 1 }], window: { from: 1, until: 1 } },
      ],
    };
    expect([...minorEvents(cfg)]).toEqual(['icecream']);
    const first = unfold(cfg, startPoint(cfg)).turns[0].stop;
    if (first.kind !== 'choice') throw new Error('expected a choice');
    const u = unfold(cfg, choose(cfg, first, 'out'));
    expect(u.turns.every((t) => t.happenings.every((h) => h.id !== 'icecream'))).toBe(true);
    expect(u.turns.some((t) => t.along.some((a) => a.happening.id === 'icecream'))).toBe(true);
    expect(unfold(cfg, choose(cfg, first, 'out'), { allEvents: true }).turns.length).toBeGreaterThan(u.turns.length);
  });
});
