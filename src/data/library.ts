import type { SimulationConfig } from '../types/simulation';
import { cinderella, hanselAndGretel, redRidingHood, threeLittlePigs } from './fairyTales';
import { redHoodWeather } from './redHoodWeather';
import { sampleScenario } from './sampleScenario';
import { docksRaid, layoffRunway } from './warRoom';

export interface LibraryEntry {
  id: string;
  label: string;
  config: SimulationConfig;
}

export const examples: LibraryEntry[] = [
  { id: 'docks-raid', label: 'War room: night raid on the docks', config: docksRaid },
  { id: 'layoff-runway', label: 'War room: layoff runway plan', config: layoffRunway },
  { id: 'career', label: 'Career crossroads', config: sampleScenario },
  { id: 'red-riding-hood', label: 'Little Red Riding Hood', config: redRidingHood },
  { id: 'red-hood-weather', label: 'Red Riding Hood: weather and nerve', config: redHoodWeather },
  { id: 'three-little-pigs', label: 'The Three Little Pigs', config: threeLittlePigs },
  { id: 'hansel-and-gretel', label: 'Hansel and Gretel', config: hanselAndGretel },
  { id: 'cinderella', label: 'Cinderella', config: cinderella },
];

/** Starting point for a scenario of your own: one variable, one shock and one contingency to edit. */
export function blankScenario(): SimulationConfig {
  return {
    schemaVersion: 2,
    title: 'My scenario',
    maxDepth: 6,
    pruneThreshold: 0.005,
    mode: 'exhaustive',
    runs: 5000,
    seed: 42,
    choicePolicy: 'uniform',
    includeQuietSteps: false,
    initialState: {},
    variables: [
      { id: 'hit', name: 'Shock has hit', type: 'boolean', initialValue: false },
      { id: 'plan', name: 'Active plan', type: 'string', initialValue: 'A' },
    ],
    actors: [],
    externalEvents: [
      {
        id: 'first_shock',
        title: 'Something hits',
        description: 'Rename me, set a probability, and add what it changes.',
        probability: 0.5,
        severity: 'high',
        conditions: [{ variableId: 'hit', operator: '==', value: false }],
        mutations: [{ variableId: 'hit', action: 'set', value: true }],
      },
    ],
    contingencies: [
      {
        id: 'first_rule',
        title: 'Fallback',
        sensors: [{ variableId: 'hit', operator: '==', value: true }],
        actions: [{ id: 'plan_b', label: 'Switch to plan B', mutations: [{ variableId: 'plan', action: 'set', value: 'B' }] }],
      },
    ],
  };
}

export function matchesExample(config: SimulationConfig): boolean {
  const json = JSON.stringify(config);
  return examples.some((e) => JSON.stringify(e.config) === json) || json === JSON.stringify(blankScenario());
}
