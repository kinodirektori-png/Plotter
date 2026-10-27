import type { SimulationConfig } from '../types/simulation';
import { action, contingency, dec, event, inc, is, set, when } from './builders';

// War-room examples: uncontrollable shocks on one side, pre-planned If-Then
// contingencies on the other. Each leaves at least one gap on purpose so the
// resilience panel has a blind spot to show.

export const docksRaid: SimulationConfig = {
  schemaVersion: 2,
  title: 'Night raid on the docks',
  maxDepth: 10,
  pruneThreshold: 0.001,
  mode: 'exhaustive',
  runs: 5000,
  seed: 42,
  choicePolicy: 'uniform',
  includeQuietSteps: false,
  timeline: { unit: 'step' },
  initialState: {},
  variables: [
    { id: 'phase', name: 'Operation phase', type: 'string', initialValue: 'approach' },
    { id: 'alarm', name: 'Alarm raised', type: 'boolean', initialValue: false },
    { id: 'intel', name: 'Has the informant’s map', type: 'boolean', initialValue: false },
    { id: 'comms', name: 'Team comms', type: 'string', initialValue: 'up' },
    { id: 'outcome', name: 'Outcome', type: 'string', initialValue: 'none yet' },
  ],
  actors: [],
  externalEvents: [
    event('informant', 'Informant slips you a map of the tunnels', 0.4, [is('phase', 'approach'), is('intel', false)], [set('intel', true)], { severity: 'low' }),
    event('breach', 'Team slips inside the warehouse', 0.6, [is('phase', 'approach')], [set('phase', 'inside')], { severity: 'low' }),
    event('patrol', 'A patrol spots the team', 0.3, [is('phase', 'inside'), is('alarm', false)], [set('alarm', true)], {
      severity: 'high',
      description: 'Flashlights sweep the catwalk and someone shouts.',
    }),
    event('jam', 'Radio jammer kills team comms', 0.2, [is('phase', 'inside'), is('comms', 'up')], [set('comms', 'jammed')], { severity: 'high' }),
    event('secured', 'Hostages secured', 0.5, [is('phase', 'inside')], [set('phase', 'extracting')], { severity: 'low' }),
    event('ambush', 'Ambush at the north gate', 0.35, [is('phase', 'extracting')], [set('phase', 'ended'), set('outcome', 'Pinned down at the north gate')], {
      severity: 'critical',
      description: 'They were waiting at the only exit you planned for.',
    }),
    event('reinforcements', 'Enemy reinforcements seal the yard', 0.15, [is('phase', 'extracting'), is('alarm', true)], [set('phase', 'ended'), set('outcome', 'Overrun in the yard')], {
      severity: 'critical',
    }),
    event('clean_exit', 'Clean exit through the north gate', 0.5, [is('phase', 'extracting')], [set('phase', 'ended'), set('outcome', 'Clean extraction')], { severity: 'low' }),
  ],
  contingencies: [
    contingency(
      'go_loud',
      'Alarm protocol',
      [is('alarm', true), is('phase', 'inside')],
      [
        action('push', 'Go loud: smoke and push to the hostages', [set('phase', 'extracting')]),
        action('abort', 'Abort and pull the team out', [set('phase', 'ended'), set('outcome', 'Aborted, team intact')]),
      ],
      { description: 'The moment the alarm trips, the plan is no longer quiet.' },
    ),
    contingency('reroute', 'Culvert reroute', [is('intel', true)], [action('culvert', 'Exfil through the south culvert', [set('phase', 'ended'), set('outcome', 'Extracted via the culvert')])], {
      intercepts: ['ambush'],
      description: 'With the tunnel map in hand, an ambush at the gate just means the other way out.',
    }),
    contingency('flares', 'Comms fallback', [is('comms', 'jammed')], [action('flares', 'Switch to flare signals', [set('comms', 'flares')])]),
    contingency('deadline', 'H+6 hard stop', [when('tick', '>=', 6), when('phase', '!=', 'ended')], [action('stop', 'Abort at the deadline', [set('phase', 'ended'), set('outcome', 'Aborted at H+6')])]),
  ],
};

export const layoffRunway: SimulationConfig = {
  schemaVersion: 2,
  title: 'Layoff runway plan',
  maxDepth: 10,
  pruneThreshold: 0.002,
  mode: 'exhaustive',
  runs: 5000,
  seed: 42,
  choicePolicy: 'uniform',
  includeQuietSteps: true, // shock probabilities are per-week odds, not a race
  timeline: { unit: 'week', start: '2026-10-03' },
  initialState: {},
  variables: [
    { id: 'employed', name: 'Employed', type: 'boolean', initialValue: true },
    { id: 'savings', name: 'Savings (€)', type: 'number', initialValue: 1500 },
    { id: 'housing', name: 'Housing', type: 'string', initialValue: 'secure' },
    { id: 'insured', name: 'Health insurance', type: 'boolean', initialValue: true },
    { id: 'plan', name: 'Active plan', type: 'string', initialValue: 'A' },
  ],
  actors: [],
  externalEvents: [
    event('layoff', 'Laid off in the restructuring', 0.4, [is('employed', true)], [set('employed', false)], { severity: 'critical', window: { until: 3 } }),
    event('unpaid_week', 'Another week without pay', 0.7, [is('employed', false), when('savings', '>', 0)], [dec('savings', 400)], { repeatable: true }),
    event('car', 'Car breaks down', 0.2, [], [dec('savings', 700)], { severity: 'high' }),
    event('medical', 'Emergency room visit', 0.15, [], [dec('savings', 900)], { severity: 'high' }),
    event('eviction', 'Landlord serves notice', 0.6, [when('savings', '<', 0), is('housing', 'secure')], [set('housing', 'notice served')], {
      severity: 'critical',
      description: 'Rent bounced. Nothing in the plan watches for this.',
    }),
    event('offer', 'A job offer lands', 0.3, [is('employed', false)], [set('employed', true)], { severity: 'low' }),
  ],
  contingencies: [
    contingency('plan_b', 'Plan B: cash floor', [when('savings', '<', 500)], [action('sublet', 'Sublet the spare room', [inc('savings', 800), set('plan', 'B')])], {
      description: 'If savings drop under €500, the spare room goes on the market that day.',
    }),
    contingency(
      'checkpoint',
      'October 31 checkpoint',
      [when('date', '>=', '2026-10-31'), is('employed', false)],
      [
        action('bridge', 'Take a bridge job', [set('employed', true), set('plan', 'bridge')]),
        action('hold', 'Hold out for the right role', [set('plan', 'holding out')]),
      ],
    ),
    contingency('insurance', 'Insurance claim', [is('insured', true)], [action('claim', 'Insurer pays the bill', [])], { intercepts: ['medical'] }),
  ],
};
