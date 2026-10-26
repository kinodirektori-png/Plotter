import type { SimulationConfig } from '../types/simulation';
import { choice, event, inc, is, set, when } from './builders';

// Example scenarios built on well-known fairy tales. Each one has a couple of
// decisions for the protagonist and enough random events that the classic
// ending is only one of several.

const fairyTaleDefaults = {
  pruneThreshold: 0.003,
  mode: 'exhaustive',
  runs: 5000,
  seed: 42,
  // Choices count as coin flips, so the endings of a tale add up to 100%.
  choicePolicy: 'uniform',
  includeQuietSteps: false,
  initialState: {},
} as const;

export const redRidingHood: SimulationConfig = {
  ...fairyTaleDefaults,
  title: 'Little Red Riding Hood',
  maxDepth: 10,
  pruneThreshold: 0.001,
  variables: [
    { id: 'route', name: 'Route through the forest', type: 'string', initialValue: 'undecided' },
    { id: 'red', name: 'Red Riding Hood', type: 'string', initialValue: 'walking' },
    { id: 'grandma', name: 'Grandma', type: 'string', initialValue: 'at home' },
    { id: 'wolf_met', name: 'Has met the wolf', type: 'boolean', initialValue: false },
    { id: 'wolf_knows', name: 'Wolf knows where Grandma lives', type: 'boolean', initialValue: false },
    { id: 'flowers', name: 'Flowers picked', type: 'number', initialValue: 0 },
  ],
  actors: [
    { id: 'wolf', name: 'The Wolf', statusAttributes: { alive: true, in_bed: false } },
    { id: 'hunter', name: 'The Huntsman', statusAttributes: { nearby: false } },
  ],
  decisions: [
    {
      id: 'warning',
      title: "Mother's warning",
      preconditions: [is('route', 'undecided')],
      choices: [
        choice('path', 'Stay on the path', [set('route', 'path')], { description: 'Just as Mother said. Safer, but slower.' }),
        choice('woods', 'Cut through the woods', [set('route', 'woods')], { description: 'Quicker, and full of flowers.' }),
      ],
    },
    {
      id: 'talk',
      title: 'The wolf asks where she is going',
      preconditions: [is('wolf_met', true)],
      choices: [
        choice('tell', "Tell him about Grandma's house", [set('wolf_knows', true)], { description: 'He seems so friendly.' }),
        choice('quiet', 'Say nothing and walk on', []),
      ],
    },
  ],
  events: [
    event('meet_wolf_path', 'Meets the wolf on the path', 0.3, [is('route', 'path'), is('wolf_met', false), is('red', 'walking')], [set('wolf_met', true)]),
    event('meet_wolf_woods', 'Meets the wolf among the trees', 0.7, [is('route', 'woods'), is('wolf_met', false), is('red', 'walking')], [set('wolf_met', true)]),
    event('pick_flowers', 'Stops to pick flowers', 0.35, [is('route', 'woods'), is('red', 'walking'), when('flowers', '<', 2)], [inc('flowers')], {
      repeatable: true,
      description: 'Grandma would love a bunch. It takes a while.',
    }),
    event('wolf_follows', 'The wolf follows her anyway', 0.15, [is('wolf_met', true), is('wolf_knows', false), is('red', 'walking')], [set('wolf_knows', true)], {
      description: 'Keeping to the shadows, he trails her toward the cottage.',
    }),
    event('grandma_hides', 'Grandma hears heavy paws and hides', 0.12, [is('wolf_knows', true), is('grandma', 'at home'), is('wolf.in_bed', false)], [set('grandma', 'hiding in the wardrobe')]),
    event('wolf_eats_grandma', 'The wolf swallows Grandma', 0.5, [is('wolf_knows', true), is('grandma', 'at home'), is('wolf.in_bed', false)], [set('grandma', 'eaten'), set('wolf.in_bed', true)], {
      description: "He races ahead, gulps her down and climbs into her bed in her nightcap.",
    }),
    event('wolf_waits', 'The wolf climbs into the empty bed', 0.5, [is('grandma', 'hiding in the wardrobe'), is('wolf.in_bed', false)], [set('wolf.in_bed', true)]),
    event('arrive', "Arrives at Grandma's cottage", 0.35, [is('red', 'walking'), when('route', '!=', 'undecided')], [set('red', 'at the cottage')]),
    event('tea', 'Tea and cake with Grandma', 0.9, [is('red', 'at the cottage'), is('wolf.in_bed', false)], [set('red', 'safe with Grandma')]),
    event('big_teeth', '"What big teeth you have!" Gobbled up', 0.55, [is('red', 'at the cottage'), is('wolf.in_bed', true)], [set('red', 'eaten')]),
    event('flee', 'Spots the ears and runs', 0.3, [is('red', 'at the cottage'), is('wolf.in_bed', true)], [set('red', 'fleeing')], {
      description: 'She drops the basket and bolts out of the door.',
    }),
    event('run_home', 'Runs all the way home', 0.4, [is('red', 'fleeing')], [set('red', 'home, shaken')]),
    event('hunter_passes', 'The huntsman walks by', 0.2, [is('hunter.nearby', false), is('wolf.alive', true)], [set('hunter.nearby', true)], {
      description: 'He hears loud snoring from the cottage.',
    }),
    event('rescue_both', 'The huntsman cuts open the wolf', 0.7, [is('hunter.nearby', true), is('red', 'eaten'), is('grandma', 'eaten')], [set('red', 'rescued'), set('grandma', 'rescued'), set('wolf.alive', false)], {
      description: 'Red and Grandma climb out, blinking, safe and sound.',
    }),
    event('rescue_red', 'The huntsman cuts open the wolf (Grandma hid)', 0.7, [is('hunter.nearby', true), is('red', 'eaten'), is('grandma', 'hiding in the wardrobe')], [set('red', 'rescued'), set('wolf.alive', false)]),
    event('shoot_wolf', 'The huntsman shoots the wolf', 0.5, [is('hunter.nearby', true), is('wolf.in_bed', true), is('wolf.alive', true), is('red', 'fleeing')], [set('wolf.alive', false)]),
  ],
};

export const threeLittlePigs: SimulationConfig = {
  ...fairyTaleDefaults,
  title: 'The Three Little Pigs',
  maxDepth: 9,
  variables: [
    { id: 'house', name: 'House material', type: 'string', initialValue: 'none' },
    { id: 'standing', name: 'House still standing', type: 'boolean', initialValue: false },
    { id: 'pig', name: 'Youngest pig', type: 'string', initialValue: 'at home' },
    { id: 'chimney', name: 'Chimney', type: 'string', initialValue: 'open' },
  ],
  actors: [{ id: 'wolf', name: 'Big Bad Wolf', statusAttributes: { at_door: false, on_roof: false, alive: true } }],
  decisions: [
    {
      id: 'build',
      title: 'What to build the house from?',
      preconditions: [is('house', 'none')],
      choices: [
        choice('straw', 'Straw', [set('house', 'straw'), set('standing', true)], { description: 'Done by lunchtime.' }),
        choice('sticks', 'Sticks', [set('house', 'sticks'), set('standing', true)], { description: 'A day of work.' }),
        choice('bricks', 'Bricks', [set('house', 'bricks'), set('standing', true)], { description: 'A week of hard work.' }),
      ],
    },
    {
      id: 'roof',
      title: 'The wolf is on the roof',
      preconditions: [is('wolf.on_roof', true)],
      choices: [
        choice('pot', 'Put a pot of boiling water under the chimney', [set('chimney', 'boiling pot')]),
        choice('board', 'Nail a board over the chimney', [set('chimney', 'boarded')]),
      ],
    },
  ],
  events: [
    event('wolf_arrives', 'The wolf knocks: "Little pig, let me in!"', 0.5, [is('standing', true), is('wolf.at_door', false), is('pig', 'at home')], [set('wolf.at_door', true)]),
    event('blow_straw', 'He huffs and puffs: the straw flies away', 0.9, [is('wolf.at_door', true), is('house', 'straw'), is('standing', true)], [set('standing', false)]),
    event('blow_sticks', 'He huffs and puffs: the sticks collapse', 0.6, [is('wolf.at_door', true), is('house', 'sticks'), is('standing', true)], [set('standing', false)]),
    event('blow_bricks', 'He huffs and puffs: a lucky crack brings the bricks down', 0.03, [is('wolf.at_door', true), is('house', 'bricks'), is('standing', true)], [set('standing', false)]),
    event('climb_roof', 'The wolf climbs onto the roof', 0.4, [is('wolf.at_door', true), is('house', 'bricks'), is('standing', true), is('wolf.on_roof', false)], [set('wolf.on_roof', true)]),
    event('wolf_gives_up', 'Out of breath, the wolf slinks away', 0.15, [is('wolf.at_door', true), is('standing', true), is('wolf.on_roof', false), is('pig', 'at home')], [set('pig', 'safe'), set('wolf.at_door', false)]),
    event('eaten', 'Gobbled up in the rubble', 0.5, [is('standing', false), is('pig', 'at home')], [set('pig', 'eaten')]),
    event('flee', 'Squeals and runs for it', 0.5, [is('standing', false), is('pig', 'at home')], [set('pig', 'fleeing')]),
    event('reach_brother', "Reaches big brother's brick house", 0.6, [is('pig', 'fleeing')], [set('pig', 'safe with brother')]),
    event('caught', 'Caught on the lane', 0.3, [is('pig', 'fleeing')], [set('pig', 'eaten')]),
    event('into_pot', 'Slides down the chimney into the boiling pot', 0.8, [is('wolf.on_roof', true), is('chimney', 'boiling pot')], [set('wolf.alive', false), set('wolf.on_roof', false), set('pig', 'safe')], {
      description: 'And that is the end of the Big Bad Wolf.',
    }),
    event('board_holds', 'The board holds and the wolf gives up', 0.5, [is('wolf.on_roof', true), is('chimney', 'boarded')], [set('wolf.on_roof', false), set('pig', 'safe')]),
    event('board_breaks', 'The board snaps under the wolf', 0.3, [is('wolf.on_roof', true), is('chimney', 'boarded')], [set('wolf.on_roof', false), set('pig', 'eaten')]),
  ],
};

export const hanselAndGretel: SimulationConfig = {
  ...fairyTaleDefaults,
  title: 'Hansel and Gretel',
  maxDepth: 10,
  variables: [
    { id: 'trail', name: 'Trail marker', type: 'string', initialValue: 'none' },
    { id: 'trail_intact', name: 'Trail still there', type: 'boolean', initialValue: true },
    { id: 'where', name: 'Where the children are', type: 'string', initialValue: 'home' },
    { id: 'children', name: 'The children', type: 'string', initialValue: 'together' },
    { id: 'plan', name: "Gretel's plan", type: 'string', initialValue: 'none' },
    { id: 'hunger', name: 'Hunger', type: 'number', initialValue: 0 },
    { id: 'treasure', name: 'Brought home treasure', type: 'boolean', initialValue: false },
  ],
  actors: [{ id: 'witch', name: 'The Witch', statusAttributes: { alive: true } }],
  decisions: [
    {
      id: 'mark',
      title: 'Hansel overhears the plan to leave them',
      preconditions: [is('trail', 'none')],
      choices: [
        choice('pebbles', 'Fill his pockets with white pebbles', [set('trail', 'pebbles')], { description: 'They shine in the moonlight.' }),
        choice('crumbs', 'Save the breadcrumbs instead', [set('trail', 'breadcrumbs')], { description: 'The door is locked; bread is all he has.' }),
      ],
    },
    {
      id: 'trick',
      title: 'Locked in the witch’s house, Gretel thinks',
      preconditions: [is('children', 'captured')],
      choices: [
        choice('oven', 'Trick the witch into the oven', [set('plan', 'oven')]),
        choice('bone', 'Hold out a bone so Hansel seems too thin', [set('plan', 'bone')]),
        choice('escape', 'Slip out at night', [set('plan', 'escape')]),
      ],
    },
  ],
  events: [
    event('abandoned', 'Left deep in the forest', 0.9, [is('where', 'home'), when('trail', '!=', 'none'), is('children', 'together')], [set('where', 'forest')]),
    event('birds', 'Birds eat the breadcrumbs', 0.7, [is('trail', 'breadcrumbs'), is('trail_intact', true), is('where', 'forest')], [set('trail_intact', false)]),
    event('follow_trail', 'Follow the trail home by moonlight', 0.6, [is('trail_intact', true), is('where', 'forest')], [set('where', 'home'), set('children', 'home safe')]),
    event('wander', 'Wander, hungrier by the hour', 0.4, [is('where', 'forest'), is('trail_intact', false), when('hunger', '<', 2)], [inc('hunger')], { repeatable: true }),
    event('woodcutter', 'Their father finds them', 0.12, [is('where', 'forest'), is('trail_intact', false)], [set('where', 'home'), set('children', 'home safe')]),
    event('candy_house', 'Find a house made of gingerbread', 0.35, [is('where', 'forest'), is('trail_intact', false)], [set('where', "the witch's house")], {
      description: 'They are so hungry they start eating the walls.',
    }),
    event('captured', 'The witch locks Hansel in a cage', 0.85, [is('where', "the witch's house"), is('children', 'together')], [set('children', 'captured')]),
    event('oven_works', 'Shoves the witch into the oven', 0.65, [is('plan', 'oven'), is('children', 'captured')], [set('witch.alive', false), set('children', 'free')]),
    event('oven_fails', 'The witch sees through the trick', 0.3, [is('plan', 'oven'), is('children', 'captured')], [set('children', 'eaten')]),
    event('bone_helps', 'A woodcutter hears them while the witch waits', 0.3, [is('plan', 'bone'), is('children', 'captured')], [set('children', 'free')]),
    event('witch_impatient', 'The witch loses patience and lights the oven', 0.4, [is('plan', 'bone'), is('children', 'captured')], [set('plan', 'oven')]),
    event('escape_works', 'Escape through the window at night', 0.4, [is('plan', 'escape'), is('children', 'captured')], [set('children', 'free')]),
    event('escape_caught', 'Caught at the window', 0.45, [is('plan', 'escape'), is('children', 'captured')], [set('children', 'eaten')]),
    event('home_with_treasure', "Carry the witch's jewels home", 0.8, [is('children', 'free'), is('witch.alive', false)], [set('treasure', true), set('children', 'home safe'), set('where', 'home')]),
    event('home', 'Find the way home', 0.6, [is('children', 'free'), is('witch.alive', true)], [set('children', 'home safe'), set('where', 'home')]),
  ],
};

export const cinderella: SimulationConfig = {
  ...fairyTaleDefaults,
  title: 'Cinderella',
  maxDepth: 9,
  variables: [
    { id: 'cinderella', name: 'Cinderella', type: 'string', initialValue: 'among the cinders' },
    { id: 'godmother', name: 'Fairy godmother has come', type: 'boolean', initialValue: false },
    { id: 'locked_in', name: 'Locked in the attic', type: 'boolean', initialValue: false },
    { id: 'midnight', name: 'Clock strikes twelve', type: 'boolean', initialValue: false },
    { id: 'slipper_lost', name: 'Glass slipper left behind', type: 'boolean', initialValue: false },
  ],
  actors: [{ id: 'prince', name: 'The Prince', statusAttributes: { smitten: false, searching: false } }],
  decisions: [
    {
      id: 'ball',
      title: 'Go to the ball?',
      preconditions: [is('godmother', true), is('cinderella', 'among the cinders')],
      choices: [
        choice('go', 'Go to the ball', [set('cinderella', 'at the ball')]),
        choice('stay', 'Stay home', [set('cinderella', 'stayed home')], { description: 'It all seems too much.' }),
      ],
    },
    {
      id: 'twelve',
      title: 'Midnight! The spell is about to break',
      preconditions: [is('midnight', true), is('cinderella', 'at the ball')],
      choices: [
        choice('run', 'Run down the palace stairs', [set('cinderella', 'running home')]),
        choice('stay', 'Stay for one more dance', [set('cinderella', 'in rags at the ball')]),
      ],
    },
  ],
  events: [
    event('locked', 'The stepmother locks her in the attic', 0.2, [is('godmother', false), is('locked_in', false)], [set('locked_in', true), set('cinderella', 'locked in the attic')]),
    event('godmother', 'Her fairy godmother appears', 0.6, [is('godmother', false), is('locked_in', false)], [set('godmother', true)], {
      description: 'A pumpkin becomes a coach and rags become a gown.',
    }),
    event('dance', 'Dances all night with the prince', 0.7, [is('cinderella', 'at the ball'), is('prince.smitten', false)], [set('prince.smitten', true)]),
    event('clock', 'The clock begins to strike twelve', 0.45, [is('cinderella', 'at the ball'), is('midnight', false)], [set('midnight', true)]),
    event('slipper', 'Loses a glass slipper on the stairs', 0.6, [is('cinderella', 'running home')], [set('slipper_lost', true)]),
    event('home', 'Makes it home as the coach turns back into a pumpkin', 0.5, [is('cinderella', 'running home')], [set('cinderella', 'home')]),
    event('loved_anyway', 'The prince does not care about the rags', 0.5, [is('cinderella', 'in rags at the ball'), is('prince.smitten', true)], [set('cinderella', 'married the prince')]),
    event('mocked', 'The court laughs her out of the palace', 0.5, [is('cinderella', 'in rags at the ball')], [set('cinderella', 'home, humiliated')]),
    event('search', 'The prince searches the kingdom with the slipper', 0.7, [is('slipper_lost', true), is('prince.smitten', true), is('cinderella', 'home'), is('prince.searching', false)], [set('prince.searching', true)]),
    event('hidden', 'The stepsisters hide her when he calls', 0.3, [is('prince.searching', true), is('cinderella', 'home')], [set('cinderella', 'hidden away')]),
    event('fits', 'The slipper fits', 0.7, [is('prince.searching', true), is('cinderella', 'home')], [set('cinderella', 'married the prince')]),
    event('found_anyway', 'The prince hears her singing in the cellar', 0.35, [is('prince.searching', true), is('cinderella', 'hidden away')], [set('cinderella', 'married the prince')]),
  ],
};
