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
const tick = z.number().int().min(0).max(1000);

const condition = z.object({
  variableId: id,
  operator: z.enum(['==', '!=', '>', '<', '>=', '<=', 'contains']),
  value,
});
const conditions = z.array(condition).max(50);

const mutation = z.object({
  variableId: id,
  action: z.enum(['set', 'increment', 'decrement', 'toggle']),
  value: value.optional(),
});
const mutations = z.array(mutation).max(50);

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

const externalEvent = z.object({
  id,
  title: z.string().max(200),
  description: text.optional(),
  probability: z.number().min(0).max(1),
  conditions,
  window: z.object({ from: tick.optional(), until: tick.optional() }).optional(),
  mutations,
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  repeatable: z.boolean().optional(),
});

const action = z.object({
  id,
  label: z.string().max(200),
  description: text.optional(),
  requires: conditions.optional(),
  mutations,
});

const contingency = z.object({
  id,
  title: z.string().max(200),
  description: text.optional(),
  sensors: conditions,
  intercepts: z.array(id).max(50).optional(),
  actions: z.array(action).min(1).max(20),
});

const runSettings = {
  title: z.string().max(200).optional(),
  maxDepth: z.number().int().min(1).max(30),
  pruneThreshold: z.number().min(0).max(1),
  actors: z.array(actor).max(50),
  initialState: z.record(safeKey, value),
  variables: z.array(variable).max(200).optional(),
  mode: z.enum(['exhaustive', 'montecarlo']).optional(),
  runs: z.number().int().min(1).max(200_000).optional(),
  seed: z.number().int().optional(),
  choicePolicy: z.enum(['conditional', 'uniform']).optional(),
  includeQuietSteps: z.boolean().optional(),
  maxNodes: z.number().int().min(10).max(50_000).optional(),
};

export const simulationConfigSchema = z
  .object({
    schemaVersion: z.literal(2),
    ...runSettings,
    externalEvents: z.array(externalEvent).max(200),
    contingencies: z.array(contingency).max(100),
    timeline: z
      .object({
        unit: z.enum(['step', 'day', 'week', 'month']),
        start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').optional(),
      })
      .optional(),
  })
  .superRefine((cfg, ctx) => {
    const seen = new Set<string>();
    for (const [i, e] of cfg.externalEvents.entries()) {
      if (seen.has(e.id)) ctx.addIssue({ code: 'custom', path: ['externalEvents', i, 'id'], message: `Duplicate id "${e.id}"` });
      seen.add(e.id);
    }
    const shockIds = new Set(seen);
    for (const [i, c] of cfg.contingencies.entries()) {
      if (seen.has(c.id)) ctx.addIssue({ code: 'custom', path: ['contingencies', i, 'id'], message: `Duplicate id "${c.id}"` });
      seen.add(c.id);
      for (const [j, s] of (c.intercepts ?? []).entries()) {
        if (!shockIds.has(s)) ctx.addIssue({ code: 'custom', path: ['contingencies', i, 'intercepts', j], message: `No external event "${s}"` });
      }
    }
  });

// v1 scenarios (exported before the war-room redesign) had homogeneous
// "events" and "decisions". They still import: events become external shocks
// and decisions become proactive contingencies whose sensors are the old
// preconditions.
const legacySchema = z.object({
  ...runSettings,
  events: z.array(
    z.object({
      id,
      title: z.string().max(200),
      description: text.optional(),
      probability: z.number().min(0).max(1),
      preconditions: conditions,
      mutations,
      repeatable: z.boolean().optional(),
    }),
  ).max(200),
  decisions: z.array(
    z.object({
      id,
      title: z.string().max(200),
      preconditions: conditions,
      choices: z.array(
        z.object({ id, label: z.string().max(200), description: text.optional(), preconditions: conditions.optional(), mutations }),
      ).min(1).max(20),
    }),
  ).max(100),
});

export function migrateLegacy(v1: z.infer<typeof legacySchema>): unknown {
  const { events, decisions, ...rest } = v1;
  return {
    schemaVersion: 2,
    ...rest,
    externalEvents: events.map(({ preconditions, ...e }) => ({ ...e, conditions: preconditions })),
    contingencies: decisions.map((d) => ({
      id: d.id,
      title: d.title,
      sensors: d.preconditions,
      actions: d.choices.map(({ preconditions, ...c }) => (preconditions ? { ...c, requires: preconditions } : c)),
    })),
  };
}

export type ParseResult =
  | { ok: true; config: SimulationConfig; migrated?: boolean }
  | { ok: false; errors: string[] };

const formatIssues = (issues: z.core.$ZodIssue[]) => issues.slice(0, 20).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);

export function parseConfig(input: unknown): ParseResult {
  const isLegacy = typeof input === 'object' && input !== null && !('schemaVersion' in input) && 'events' in input;
  if (isLegacy) {
    const legacy = legacySchema.safeParse(input);
    if (!legacy.success) return { ok: false, errors: formatIssues(legacy.error.issues) };
    const r = parseConfig(migrateLegacy(legacy.data));
    return r.ok ? { ...r, migrated: true } : r;
  }
  const r = simulationConfigSchema.safeParse(input);
  if (r.success) return { ok: true, config: r.data as SimulationConfig };
  return { ok: false, errors: formatIssues(r.error.issues) };
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
