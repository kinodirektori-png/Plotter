import { describe, expect, it } from 'vitest';
import { computeOutcomes, computeResilience } from '../engine/analysis';
import { parseConfig } from '../engine/schema';
import { simulate } from '../engine/simulate';
import { sensorKeys } from '../engine/state';
import { blankScenario, examples } from './library';

describe('scenario library', () => {
  for (const { label, config } of [...examples, { label: 'blank', config: blankScenario() }]) {
    it(`${label} is valid, fits the node cap and conserves probability`, () => {
      expect(parseConfig(config).ok).toBe(true);
      // Every rule must point at a real variable, or it silently never fires.
      const keys = new Set(sensorKeys(config));
      const shockIds = new Set(config.externalEvents.map((e) => e.id));
      expect(config.contingencies.flatMap((c) => c.intercepts ?? []).filter((s) => !shockIds.has(s))).toEqual([]);
      const refs = [
        ...config.externalEvents.flatMap((e) => [...e.conditions, ...e.mutations]),
        ...config.contingencies.flatMap((c) => [...c.sensors, ...c.actions.flatMap((a) => [...(a.requires ?? []), ...a.mutations])]),
      ].map((r) => r.variableId);
      expect(refs.filter((r) => !keys.has(r))).toEqual([]);

      const r = simulate(config);
      expect(r.stats.truncated).toBe(false);
      const total = Object.values(r.nodes).filter((n) => n.terminal).reduce((s, n) => s + n.probability, 0) + r.stats.prunedMass;
      if (config.choicePolicy === 'uniform') expect(total).toBeCloseTo(1);
      expect(computeOutcomes(r).length).toBeGreaterThan(0);
    });
  }

  it('war-room examples exercise every contingency and leave a blind spot', () => {
    for (const id of ['docks-raid', 'layoff-runway']) {
      const cfg = examples.find((e) => e.id === id)!.config;
      const res = computeResilience(cfg, simulate(cfg));
      expect(res.dormant.map((c) => c.id)).toEqual([]);
      expect(res.coverage).toBeGreaterThan(0);
      expect(res.coverage).toBeLessThan(1);
    }
    const docks = examples.find((e) => e.id === 'docks-raid')!.config;
    const res = computeResilience(docks, simulate(docks));
    expect(res.blindSpots.map((b) => b.shock.id)).toContain('ambush');
  });

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
