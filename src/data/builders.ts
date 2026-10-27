import type { Contingency, ContingencyAction, ExternalEvent, Operator, Precondition, StateMutation, Value } from '../types/simulation';

// Small helpers that keep hand-written example scenarios readable.

export const when = (variableId: string, operator: Operator, value: Value): Precondition => ({ variableId, operator, value });
export const is = (variableId: string, value: Value): Precondition => when(variableId, '==', value);

export const set = (variableId: string, value: Value): StateMutation => ({ variableId, action: 'set', value });
export const inc = (variableId: string, value = 1): StateMutation => ({ variableId, action: 'increment', value });
export const dec = (variableId: string, value = 1): StateMutation => ({ variableId, action: 'decrement', value });

/** An external shock: uncontrollable, with a probability. */
export function event(
  id: string,
  title: string,
  probability: number,
  conditions: Precondition[],
  mutations: StateMutation[],
  extra: Partial<Pick<ExternalEvent, 'description' | 'repeatable' | 'severity' | 'window'>> = {},
): ExternalEvent {
  return { id, title, probability, conditions, mutations, ...extra };
}

/** One "Then" of a contingency. */
export function action(id: string, label: string, mutations: StateMutation[], extra: Partial<Pick<ContingencyAction, 'description' | 'requires'>> = {}): ContingencyAction {
  return { id, label, mutations, ...extra };
}

/** An "If sensors -> Then actions" rule. */
export function contingency(
  id: string,
  title: string,
  sensors: Precondition[],
  actions: ContingencyAction[],
  extra: Partial<Pick<Contingency, 'description' | 'intercepts'>> = {},
): Contingency {
  return { id, title, sensors, actions, ...extra };
}
