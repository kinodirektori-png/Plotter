import { z } from 'zod';
import type { SimulationConfig } from '../types/simulation';

// Every scenario that enters the app (import, localStorage, paste) is parsed
// here first. Strings are length-capped and collections size-capped so a
// hostile file cannot blow up memory before the engine even starts.

// Ids double as object keys in world state, so keys that could reach
// Object.prototype are rejected outright.
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const safeKey = z
  .string()
  .max(80)
  .refine((k) => !FORBIDDEN_KEYS.has(k) && !k.split('.').some((p) => FORBIDDEN_KEYS.has(p)), 'Reserved key');
const id = safeKey.pipe(z.string().trim().min(1));
const text = z.string().max(2000);
const value = z.union([z.boolean(), z.number().finite(), z.string().max(500)]);

const precondition = z.object({
  variableId: id,
  operator: z.enum(['==', '!=', '>', '<', '>=', '<=', 'contains']),
  value,
});

const mutation = z.object({
  variableId: id,
  action: z.enum(['set', 'increment', 'decrement', 'toggle']),
  value: value.optional(),
});

const variable = z.object({
  id,
  name: z.string().max(200),
  type: z.enum(['boolean', 'number', 'string']),
  initialValue: value,
});

const actor = z.object({
  id,
  name: z.string().max(200),
  statusAttributes: z.record(safeKey, value),
});

const event = z.object({
  id,
  title: z.string().max(200),
  description: text.optional(),
  probability: z.number().min(0).max(1),
  preconditions: z.array(precondition).max(50),
  mutations: z.array(mutation).max(50),
  repeatable: z.boolean().optional(),
});

const choice = z.object({
  id,
  label: z.string().max(200),
  description: text.optional(),
  preconditions: z.array(precondition).max(50).optional(),
  mutations: z.array(mutation).max(50),
});

const decision = z.object({
  id,
  title: z.string().max(200),
  preconditions: z.array(precondition).max(50),
  choices: z.array(choice).min(1).max(20),
});

export const simulationConfigSchema = z
  .object({
    title: z.string().max(200).optional(),
    maxDepth: z.number().int().min(1).max(30),
    pruneThreshold: z.number().min(0).max(1),
    actors: z.array(actor).max(50),
    initialState: z.record(safeKey, value),
    variables: z.array(variable).max(200).optional(),
    events: z.array(event).max(200),
    decisions: z.array(decision).max(100),
    mode: z.enum(['exhaustive', 'montecarlo']).optional(),
    runs: z.number().int().min(1).max(200_000).optional(),
    seed: z.number().int().optional(),
    choicePolicy: z.enum(['conditional', 'uniform']).optional(),
    includeQuietSteps: z.boolean().optional(),
    maxNodes: z.number().int().min(10).max(50_000).optional(),
  })
  .superRefine((cfg, ctx) => {
    const seen = new Set<string>();
    for (const [i, e] of cfg.events.entries()) {
      if (seen.has(e.id)) ctx.addIssue({ code: 'custom', path: ['events', i, 'id'], message: `Duplicate id "${e.id}"` });
      seen.add(e.id);
    }
    for (const [i, d] of cfg.decisions.entries()) {
      if (seen.has(d.id)) ctx.addIssue({ code: 'custom', path: ['decisions', i, 'id'], message: `Duplicate id "${d.id}"` });
      seen.add(d.id);
    }
  });

export type ParseResult =
  | { ok: true; config: SimulationConfig }
  | { ok: false; errors: string[] };

export function parseConfig(input: unknown): ParseResult {
  const r = simulationConfigSchema.safeParse(input);
  if (r.success) return { ok: true, config: r.data as SimulationConfig };
  return {
    ok: false,
    errors: r.error.issues.slice(0, 20).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
  };
}

export function parseConfigJson(json: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    return { ok: false, errors: [`Invalid JSON: ${(e as Error).message}`] };
  }
  return parseConfig(raw);
}
