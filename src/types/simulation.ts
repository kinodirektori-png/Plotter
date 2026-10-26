// Data schema from the spec (section 3), plus a few optional extensions
// marked "ext". Extensions are optional so spec-shaped configs stay valid.

export type VariableType = 'boolean' | 'number' | 'string';
export type Value = boolean | number | string;

export interface WorldVariable {
  id: string;
  name: string;
  type: VariableType;
  initialValue: Value;
}

export interface Actor {
  id: string;
  name: string;
  // Each attribute is addressable in preconditions/mutations as "<actorId>.<attr>".
  statusAttributes: Record<string, Value>;
}

export type Operator = '==' | '!=' | '>' | '<' | '>=' | '<=' | 'contains';

export interface Precondition {
  variableId: string;
  operator: Operator;
  value: Value;
}

export type MutationAction = 'set' | 'increment' | 'decrement' | 'toggle';

export interface StateMutation {
  variableId: string;
  action: MutationAction;
  value?: Value;
}

export interface SimEvent {
  id: string;
  title: string;
  description?: string;
  probability: number; // 0.0 to 1.0, chance this event happens in a step where it is eligible
  preconditions: Precondition[];
  mutations: StateMutation[];
  repeatable?: boolean;
}

export interface DecisionChoice {
  id: string;
  label: string;
  description?: string;
  preconditions?: Precondition[];
  mutations: StateMutation[];
}

export interface DecisionNode {
  id: string;
  title: string;
  preconditions: Precondition[];
  choices: DecisionChoice[];
}

export type SimMode = 'exhaustive' | 'montecarlo';
// conditional: a choice edge has weight 1, so P is "given the choices made".
// uniform: every valid choice is equally likely, so all outcomes sum to 1.
export type ChoicePolicy = 'conditional' | 'uniform';

export interface SimulationConfig {
  maxDepth: number;
  pruneThreshold: number;
  actors: Actor[];
  initialState: Record<string, Value>;
  events: SimEvent[];
  decisions: DecisionNode[];
  // ext
  title?: string;
  variables?: WorldVariable[];
  mode?: SimMode;
  runs?: number; // Monte Carlo sample count
  seed?: number;
  choicePolicy?: ChoicePolicy;
  includeQuietSteps?: boolean; // add a "nothing happens" branch when event probabilities sum < 1
  maxNodes?: number; // safety cap so the browser never locks up
}

// ---------- Engine output ----------

export type WorldState = Record<string, Value>;

export interface SimNode {
  id: string;
  depth: number;
  state: WorldState;
  fired: string[]; // ids of non-repeatable events / decisions already used
  probability: number; // total probability mass reaching this state
  pathCount: number; // number of distinct orderings that reach it
  bestParent?: string; // parent on the most likely route (for the dossier)
  bestEdge?: string;
  bestPathP: number;
  terminal: boolean;
  terminalReason?: 'maxDepth' | 'noMoves';
  pendingDecision?: string; // decision node id resolved from this state
}

export interface SimEdge {
  id: string;
  source: string;
  target: string;
  kind: 'event' | 'choice' | 'quiet';
  refId: string; // event id or "<decisionId>:<choiceId>"
  label: string;
  probability: number; // transition probability (conditional on being at source)
  flow: number; // probability mass that travels along this edge
}

export interface SimStats {
  nodes: number;
  edges: number;
  terminals: number;
  prunedMass: number;
  prunedNodes: number;
  truncated: boolean; // hit maxNodes
  mergedArrivals: number; // arrivals that were deduplicated into an existing state
  ms: number;
}

export interface SimResult {
  rootId: string;
  nodes: Record<string, SimNode>;
  edges: SimEdge[];
  stats: SimStats;
}
