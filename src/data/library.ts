import type { SimulationConfig } from '../types/simulation';
import { cinderella, hanselAndGretel, redRidingHood, threeLittlePigs } from './fairyTales';
import { sampleScenario } from './sampleScenario';

export interface LibraryEntry {
  id: string;
  label: string;
  config: SimulationConfig;
}

export const examples: LibraryEntry[] = [
  { id: 'red-riding-hood', label: 'Little Red Riding Hood', config: redRidingHood },
  { id: 'three-little-pigs', label: 'The Three Little Pigs', config: threeLittlePigs },
  { id: 'hansel-and-gretel', label: 'Hansel and Gretel', config: hanselAndGretel },
  { id: 'cinderella', label: 'Cinderella', config: cinderella },
  { id: 'career', label: 'Career crossroads', config: sampleScenario },
];

/** Starting point for a scenario of your own: one variable, one event, one decision to edit. */
export function blankScenario(): SimulationConfig {
  return {
    title: 'My scenario',
    maxDepth: 6,
    pruneThreshold: 0.005,
    mode: 'exhaustive',
    runs: 5000,
    seed: 42,
    choicePolicy: 'uniform',
    includeQuietSteps: false,
    initialState: {},
    variables: [{ id: 'happened', name: 'Something happened', type: 'boolean', initialValue: false }],
    actors: [],
    events: [
      {
        id: 'first_event',
        title: 'Something happens',
        description: 'Rename me, set a probability, and add what changes.',
        probability: 0.5,
        preconditions: [{ variableId: 'happened', operator: '==', value: false }],
        mutations: [{ variableId: 'happened', action: 'set', value: true }],
      },
    ],
    decisions: [],
  };
}

export function matchesExample(config: SimulationConfig): boolean {
  const json = JSON.stringify(config);
  return examples.some((e) => JSON.stringify(e.config) === json) || json === JSON.stringify(blankScenario());
}
