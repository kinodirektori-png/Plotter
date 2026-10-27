// War-room scenario schema (v2).
//
// A scenario separates what the planner cannot control from what they can:
//   - ExternalEvent ("shock"): the chaos. It has a probability, an optional
//     time window and world conditions, and the planner can never edit it.
//   - Contingency: the agency. A pre-planned "If [sensor] -> Then [action]"
//     rule that fires when its sensor thresholds are breached, or that
//     intercepts a named shock the moment it hits.
// Sensors are ordinary conditions over world state, plus two built-ins that
// read the timeline: `tick` (the current step) and `date` (ISO date of the
// current step, when `timeline.start` is set).

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
  // Each attribute is addressable in conditions/mutations as "<actorId>.<attr>".
  statusAttributes: Record<string, Value>;
}

export type Operator = '==' | '!=' | '>' | '<' | '>=' | '<=' | 'contains';

/** One threshold over world state: `savings < 500`, `date >= 2026-10-31`. */
export interface Precondition {
  variableId: string;
  operator: Operator;
  value: Value;
}
export type Sensor = Precondition;

export type MutationAction = 'set' | 'increment' | 'decrement' | 'toggle';

export interface StateMutation {
  variableId: string;
  action: MutationAction;
  value?: Value;
}

export type Severity = 'low' | 'medium' | 'high' | 'critical';

/** Steps (ticks) during which a shock may hit, inclusive. */
export interface TickWindow {
  from?: number;
  until?: number;
}

/** Uncontrollable reality: something the world does to the planner. */
export interface ExternalEvent {
  id: string;
  title: string;
  description?: string;
  probability: number; // 0.0 to 1.0, chance it hits in a step where it is eligible
  conditions: Precondition[]; // world state that makes the shock possible
  window?: TickWindow;
  mutations: StateMutation[];
  severity?: Severity; // unset: treated as high risk when probability >= HIGH_RISK_P
  repeatable?: boolean;
}

export interface ContingencyAction {
  id: string;
  label: string;
  description?: string;
  requires?: Precondition[]; // only available if these hold
  mutations: StateMutation[];
}

/** Controllable agency: an "If sensor -> Then action" rule. */
export interface Contingency {
  id: string;
  title: string;
  description?: string;
  sensors: Sensor[]; // all must be tripped (AND)
  // Empty: proactive, fires as soon as the sensors trip, before any shock that step.
  // Set: reactive interceptor, armed while the sensors hold, fires instead of
  // the listed shocks and cancels their mutations.
  intercepts?: string[];
  // One action is a committed plan. Several are options the actor keeps open,
  // and the timeline branches into each.
  actions: ContingencyAction[];
}

export interface Timeline {
  unit: 'step' | 'day' | 'week' | 'month';
  start?: string; // ISO date (YYYY-MM-DD) of tick 0; enables the `date` sensor
}

export type SimMode = 'exhaustive' | 'montecarlo';
// conditional: an action edge has weight 1, so P is "given the actions taken".
// uniform: every valid action is equally likely, so all outcomes sum to 1.
export type ChoicePolicy = 'conditional' | 'uniform';

export interface SimulationConfig {
  schemaVersion: 2;
  title?: string;
  maxDepth: number;
  pruneThreshold: number;
  actors: Actor[];
  initialState: Record<string, Value>;
  variables?: WorldVariable[];
  externalEvents: ExternalEvent[];
  contingencies: Contingency[];
  timeline?: Timeline;
  mode?: SimMode;
  runs?: number; // Monte Carlo sample count
  seed?: number;
  choicePolicy?: ChoicePolicy;
  includeQuietSteps?: boolean; // add a "quiet tick" branch when shock probabilities sum < 1
  maxNodes?: number; // safety cap so the browser never locks up
}

// ---------- Engine output ----------

export type WorldState = Record<string, Value>;

export interface SimNode {
  id: string;
  depth: number; // the tick this state is observed at
  state: WorldState;
  fired: string[]; // ids of non-repeatable shocks / contingencies already used
  probability: number; // total probability mass reaching this state
  pathCount: number; // number of distinct orderings that reach it
  bestParent?: string; // parent on the most likely route (for the dossier)
  bestEdge?: string;
  bestPathP: number;
  terminal: boolean;
  terminalReason?: 'maxDepth' | 'noMoves';
  pendingContingency?: string; // contingency whose sensors tripped in this state
}

// shock: an external event hit unopposed.
// contingency: a proactive rule fired because its sensors tripped.
// intercept: a shock hit, and an armed contingency cancelled it.
// quiet: nothing happened this tick (time passes).
export type EdgeKind = 'shock' | 'contingency' | 'intercept' | 'quiet';

export interface SimEdge {
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
  refId: string; // shock id, "<contingencyId>:<actionId>" or "<shockId>><contingencyId>:<actionId>"
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
