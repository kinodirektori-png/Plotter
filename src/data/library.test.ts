import { describe, expect, it } from 'vitest';
import { computeOutcomes } from '../engine/analysis';
import { parseConfig } from '../engine/schema';
import { simulate } from '../engine/simulate';
import { stateKeys } from '../engine/state';
import { blankScenario, examples } from './library';

describe('scenario library', () => {
  for (const { label, config } of [...examples, { label: 'blank', config: blankScenario() }]) {
    it(`${label} is valid, fits the node cap and conserves probability`, () => {
      expect(parseConfig(config).ok).toBe(true);
      // Every rule must point at a real variable, or it silently never fires.
      const keys = new Set(stateKeys(config));
      const refs = [
        ...config.events.flatMap((e) => [...e.preconditions, ...e.mutations]),
        ...config.decisions.flatMap((d) => [...d.preconditions, ...d.choices.flatMap((c) => [...(c.preconditions ?? []), ...c.mutations])]),
      ].map((r) => r.variableId);
      expect(refs.filter((r) => !keys.has(r))).toEqual([]);

      const r = simulate(config);
      expect(r.stats.truncated).toBe(false);
      const total = Object.values(r.nodes).filter((n) => n.terminal).reduce((s, n) => s + n.probability, 0) + r.stats.prunedMass;
      if (config.choicePolicy === 'uniform') expect(total).toBeCloseTo(1);
      expect(computeOutcomes(r).length).toBeGreaterThan(0);
    });
  }

  it('Red Riding Hood can end with the classic rescue', () => {
    const red = examples.find((e) => e.id === 'red-riding-hood')!.config;
    const outcomes = computeOutcomes(simulate(red));
    expect(outcomes.some((o) => o.state.red === 'rescued' && o.state.grandma === 'rescued')).toBe(true);
    expect(outcomes.some((o) => o.state.red === 'safe with Grandma')).toBe(true);
  });

  it('Red Riding Hood weather model reproduces the drafted tree', () => {
    const cfg = examples.find((e) => e.id === 'red-hood-weather')!.config;
    const byEnding = Object.fromEntries(computeOutcomes(simulate(cfg)).map((o) => [String(o.state.ending).split(':')[0], o.probability]));
    const expected: Record<string, number> = {
      P1: 0.3, P2: 0.21, P3: 0.12, P4: 0.084, P5: 0.063, P6: 0.0588,
      P7: 0.05488, P8: 0.036879, P9: 0.027, P10: 0.024696, P11: 0.011525, P12: 0.00922,
    };
    expect(Object.keys(byEnding).sort()).toEqual(Object.keys(expected).sort());
    for (const [k, p] of Object.entries(expected)) expect(byEnding[k]).toBeCloseTo(p, 5);
  });
});
