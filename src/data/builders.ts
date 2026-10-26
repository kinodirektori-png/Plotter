import type { DecisionChoice, Operator, Precondition, SimEvent, StateMutation, Value } from '../types/simulation';

// Small helpers that keep hand-written example scenarios readable.

export const when = (variableId: string, operator: Operator, value: Value): Precondition => ({ variableId, operator, value });
export const is = (variableId: string, value: Value): Precondition => when(variableId, '==', value);

export const set = (variableId: string, value: Value): StateMutation => ({ variableId, action: 'set', value });
export const inc = (variableId: string, value = 1): StateMutation => ({ variableId, action: 'increment', value });
export const dec = (variableId: string, value = 1): StateMutation => ({ variableId, action: 'decrement', value });

export function event(
  id: string,
  title: string,
  probability: number,
  preconditions: Precondition[],
  mutations: StateMutation[],
  extra: Partial<Pick<SimEvent, 'description' | 'repeatable'>> = {},
): SimEvent {
  return { id, title, probability, preconditions, mutations, ...extra };
}

export function choice(id: string, label: string, mutations: StateMutation[], extra: Partial<Pick<DecisionChoice, 'description' | 'preconditions'>> = {}): DecisionChoice {
  return { id, label, mutations, ...extra };
}
