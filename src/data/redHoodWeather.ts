import type { ExternalEvent, Severity, SimulationConfig } from '../types/simulation';
import { event, is, set } from './builders';

// Little Red Riding Hood as a weighted tree: weather and scent decide whether
// the wolf finds her, then her caution and nerve decide how an encounter ends.
// Every branch point is a "stage"; the events leaving a stage add up to 100%,
// so the engine's cumulative probabilities follow the tree exactly.

interface Branch {
  id: string;
  title: string;
  p: number;
  then: { stage: string } | { ending: string; tone: string; story: string };
  mutations?: ReturnType<typeof set>[];
  severity?: Severity;
}

function stage(from: string, branches: Branch[]): ExternalEvent[] {
  return branches.map((b) =>
    event(
      b.id,
      b.title,
      b.p,
      [is('stage', from)],
      [
        ...(b.mutations ?? []),
        ...('stage' in b.then
          ? [set('stage', b.then.stage)]
          : [set('stage', 'ended'), set('ending', b.then.ending), set('tone', b.then.tone)]),
      ],
      { ...('story' in b.then ? { description: b.then.story } : {}), ...(b.severity ? { severity: b.severity } : {}) },
    ),
  );
}

export const redHoodWeather: SimulationConfig = {
  schemaVersion: 2,
  title: 'Red Riding Hood: weather and nerve',
  maxDepth: 10,
  pruneThreshold: 0,
  mode: 'exhaustive',
  runs: 5000,
  seed: 42,
  choicePolicy: 'uniform',
  includeQuietSteps: false,
  initialState: {},
  variables: [
    { id: 'stage', name: 'Where the story is', type: 'string', initialValue: 'departure' },
    { id: 'weather', name: 'Weather', type: 'string', initialValue: 'unknown' },
    { id: 'wolf', name: 'The wolf', type: 'string', initialValue: 'in his den' },
    { id: 'red', name: 'Red Riding Hood', type: 'string', initialValue: 'setting off' },
    { id: 'ending', name: 'Ending', type: 'string', initialValue: 'none yet' },
    { id: 'tone', name: 'Kind of ending', type: 'string', initialValue: 'none yet' },
  ],
  actors: [],
  contingencies: [],
  externalEvents: [
    ...stage('departure', [
      {
        id: 'storm',
        title: 'Severe storm',
        severity: 'low',
        p: 0.3,
        mutations: [set('weather', 'storm')],
        then: {
          ending: 'P1: Trip aborted, stays home',
          tone: 'Neutral / safe',
          story:
            "Gale-force winds and a heavy downpour make the forest impassable. Her mother forbids the trip, the treats stay on the kitchen counter, and the wolf never catches a scent.",
        },
      },
      { id: 'rain', title: 'Steady rain', p: 0.3, severity: 'low', mutations: [set('weather', 'rain')], then: { stage: 'rain' } },
      { id: 'sunny', title: 'Sunny, clear day', p: 0.4, severity: 'low', mutations: [set('weather', 'sunny')], then: { stage: 'sunny' } },
    ]),

    ...stage('rain', [
      {
        id: 'rain_masks_scent',
        title: 'Rain masks her scent',
        severity: 'low',
        p: 0.7,
        then: {
          ending: 'P2: Safe arrival in the rain',
          tone: 'Safe passage',
          story:
            "The rain muffles her footsteps and washes away the smell of fresh pastries. The wolf stays in his den out of the cold, and she reaches Grandma's cottage without meeting a predator.",
        },
      },
      { id: 'rain_encounter', title: 'Wolf encounter in the rain', p: 0.3, mutations: [set('wolf', 'met her')], then: { stage: 'rain encounter' } },
    ]),
    ...stage('rain encounter', [
      {
        id: 'shelter_doubt',
        title: 'Sheltering from the downpour, she has doubts',
        severity: 'low',
        p: 0.7,
        mutations: [set('red', 'suspicious')],
        then: {
          ending: 'P5: Trap evaded',
          tone: 'Threat averted',
          story:
            "A sudden torrent forces her under a rocky ledge and breaks the conversation's spell. Alone, she thinks about the stranger's oversized jaws. She circles the cottage, spots muddy paw prints and fetches the village woodcutters.",
        },
      },
      {
        id: 'rushes_blindly',
        title: 'Rushes blindly to get out of the rain',
        severity: 'critical',
        p: 0.3,
        mutations: [set('red', 'soaked and hurried')],
        then: {
          ending: 'P9: Cottage ambush',
          tone: 'Direct peril',
          story:
            "Shivering and disoriented, she takes the wolf's advice just to get out of the storm faster. She bursts into the dark cottage looking for warmth and ignores the silence until the latch clicks behind her.",
        },
      },
    ]),

    ...stage('sunny', [
      {
        id: 'off_trail',
        title: 'The wind carries her scent away',
        severity: 'low',
        p: 0.3,
        then: {
          ending: 'P3: Safe arrival on a clear day',
          tone: 'Safe passage',
          story: "Even in perfect tracking weather, the wolf's rounds never cross her path. She keeps to the beaten track and arrives on time.",
        },
      },
      { id: 'scent_spreads', title: 'The wolf picks up her scent', p: 0.7, mutations: [set('wolf', 'tracking her')], then: { stage: 'tracked' } },
    ]),
    ...stage('tracked', [
      {
        id: 'guarded',
        title: 'She stays guarded',
        severity: 'low',
        p: 0.3,
        mutations: [set('red', 'cautious')],
        then: {
          ending: 'P4: Plan thwarted',
          tone: 'Threat averted',
          story:
            "When the wolf appears with polite small talk, she remembers the warnings. She answers vaguely, never says where Grandma lives, and keeps walking along the sunny open road where he won't attack.",
        },
      },
      { id: 'naive', title: 'She naively tells him where she is going', p: 0.7, mutations: [set('red', 'naive'), set('wolf', "knows Grandma's house")], then: { stage: 'disclosed' } },
    ]),
    ...stage('disclosed', [
      {
        id: 'forages',
        title: 'Turns down the shortcut and forages instead',
        severity: 'low',
        p: 0.3,
        then: {
          ending: 'P6: Timing disrupted',
          tone: 'Threat averted',
          story:
            "She declines the wolf's suspicious shortcut and lingers in the clearings picking berries and mushrooms. The delay wrecks his timing: by the time she arrives he has given up and left, or a village patrol has passed by.",
        },
      },
      { id: 'shortcut', title: 'Takes the misleading shortcut', p: 0.7, mutations: [set('red', 'late and tired'), set('wolf', "in Grandma's bed")], then: { stage: 'bedside' } },
    ]),
    ...stage('bedside', [
      {
        id: 'fooled',
        title: 'Fully fooled by the disguise',
        severity: 'critical',
        p: 0.4,
        then: {
          ending: 'P7: Bedside ambush',
          tone: 'Direct peril',
          story:
            "Late and worn out, she accepts every explanation for the big ears and eyes and walks right up to the bed without raising her guard.",
        },
      },
      { id: 'questions', title: 'Questions the disguise', p: 0.6, mutations: [set('red', 'questioning')], then: { stage: 'questioning' } },
    ]),
    ...stage('questioning', [
      {
        id: 'hesitates',
        title: 'The wolf hesitates',
        severity: 'low',
        p: 0.3,
        then: {
          ending: 'P10: Escape window',
          tone: 'Standoff / escape',
          story:
            "Her sharp questions put the wolf on the defensive. Has she already raised the alarm? Is someone with her? While he hesitates, she backs out of the door and sprints for the clearing.",
        },
      },
      { id: 'attacks', title: 'The wolf attacks', p: 0.7, mutations: [set('wolf', 'attacking')], then: { stage: 'attack' } },
    ]),
    ...stage('attack', [
      {
        id: 'freezes',
        title: 'Freezes in shock',
        severity: 'critical',
        p: 0.2,
        then: {
          ending: 'P11: Cornered',
          tone: 'Direct peril',
          story: 'When the wolf throws off the covers and bares his fangs, terror closes her throat. She is backed into a corner without making a sound.',
        },
      },
      { id: 'screams', title: 'Screams in panic', p: 0.8, mutations: [set('red', 'screaming')], then: { stage: 'scream' } },
    ]),
    ...stage('scream', [
      {
        id: 'no_hunter',
        title: 'No one is near enough to hear',
        p: 0.8,
        then: {
          ending: 'P8: Fights and flees on her own',
          tone: 'Active climax',
          story:
            'Her screams echo into an empty valley. On pure adrenaline she overturns the nightstand, throws the hot kettle and scrambles out through the pantry window.',
        },
      },
      {
        id: 'hunter',
        title: 'The huntsman hears and bursts in',
        severity: 'low',
        p: 0.2,
        then: {
          ending: 'P12: Huntsman rescue',
          tone: 'Heroic rescue',
          story: 'The classic ending. A huntsman tracking game nearby hears the scream, breaks down the cottage door and deals with the wolf just in time.',
        },
      },
    ]),
  ],
};
