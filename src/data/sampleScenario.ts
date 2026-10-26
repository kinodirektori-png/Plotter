import type { SimulationConfig } from '../types/simulation';

export const sampleScenario: SimulationConfig = {
  title: 'Career crossroads',
  maxDepth: 6,
  pruneThreshold: 0.005,
  mode: 'exhaustive',
  runs: 5000,
  seed: 42,
  choicePolicy: 'conditional',
  includeQuietSteps: false,
  variables: [
    { id: 'employed', name: 'Employed', type: 'boolean', initialValue: true },
    { id: 'savings', name: 'Savings (months)', type: 'number', initialValue: 3 },
    { id: 'stress', name: 'Stress', type: 'number', initialValue: 2 },
    { id: 'offer', name: 'Has relocation offer', type: 'boolean', initialValue: false },
    { id: 'city', name: 'City', type: 'string', initialValue: 'Hometown' },
  ],
  actors: [{ id: 'partner', name: 'Partner', statusAttributes: { together: true } }],
  initialState: {},
  events: [
    {
      id: 'lose_job',
      title: 'Lose job',
      description: 'The company restructures and the role disappears.',
      probability: 0.25,
      preconditions: [{ variableId: 'employed', operator: '==', value: true }],
      mutations: [
        { variableId: 'employed', action: 'set', value: false },
        { variableId: 'stress', action: 'increment', value: 2 },
      ],
      repeatable: false,
    },
    {
      id: 'find_job',
      title: 'Find a new job',
      description: 'After some searching, an offer lands.',
      probability: 0.45,
      preconditions: [{ variableId: 'employed', operator: '==', value: false }],
      mutations: [
        { variableId: 'employed', action: 'set', value: true },
        { variableId: 'stress', action: 'decrement', value: 1 },
      ],
      repeatable: false,
    },
    {
      id: 'relocation_offer',
      title: 'Relocation offer arrives',
      description: 'A recruiter offers a role in another city.',
      probability: 0.3,
      preconditions: [{ variableId: 'city', operator: '==', value: 'Hometown' }],
      mutations: [{ variableId: 'offer', action: 'set', value: true }],
    },
    {
      id: 'burn_savings',
      title: 'Burn a month of savings',
      probability: 0.35,
      preconditions: [
        { variableId: 'employed', operator: '==', value: false },
        { variableId: 'savings', operator: '>', value: 0 },
      ],
      mutations: [
        { variableId: 'savings', action: 'decrement', value: 1 },
        { variableId: 'stress', action: 'increment', value: 1 },
      ],
      repeatable: true,
    },
    {
      id: 'promotion',
      title: 'Get promoted',
      probability: 0.15,
      preconditions: [{ variableId: 'employed', operator: '==', value: true }],
      mutations: [{ variableId: 'savings', action: 'increment', value: 2 }],
    },
    {
      id: 'partner_leaves',
      title: 'Partner leaves',
      description: 'The strain becomes too much for the relationship.',
      probability: 0.2,
      preconditions: [
        { variableId: 'stress', operator: '>=', value: 4 },
        { variableId: 'partner.together', operator: '==', value: true },
      ],
      mutations: [{ variableId: 'partner.together', action: 'set', value: false }],
    },
  ],
  decisions: [
    {
      id: 'relocate',
      title: 'Take the relocation?',
      preconditions: [{ variableId: 'offer', operator: '==', value: true }],
      choices: [
        {
          id: 'move',
          label: 'Move to Berlin',
          mutations: [
            { variableId: 'city', action: 'set', value: 'Berlin' },
            { variableId: 'employed', action: 'set', value: true },
            { variableId: 'stress', action: 'increment', value: 1 },
            { variableId: 'offer', action: 'set', value: false },
          ],
        },
        {
          id: 'stay',
          label: 'Stay put',
          mutations: [{ variableId: 'offer', action: 'set', value: false }],
        },
      ],
    },
  ],
};
