import { ChevronDown, ChevronRight, Flag, Loader2, Route } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { formatP } from '../engine/analysis';
import { analyzePlans, type NumericSummary, type PlanAnalysis, type PlanResult } from '../engine/plans';
import type { SimResult, SimulationConfig, Value } from '../types/simulation';
import { Story } from './Dossier';
import { Card, Select, formatValue } from './ui';

const SHOWN_GROUPS = 6;

function useNames(config: SimulationConfig) {
  return useMemo(() => {
    const names = new Map<string, string>();
    for (const v of config.variables ?? []) names.set(v.id, v.name || v.id);
    return (k: string) => names.get(k) ?? k;
  }, [config]);
}

const fmtNum = (n: number) => (Math.abs(n) >= 1000 ? Math.round(n).toLocaleString('en-US') : String(Math.round(n * 100) / 100));

function Numeric({ label, s }: { label: string; s: NumericSummary }) {
  return (
    <span className="whitespace-nowrap">
      <span className="text-slate-400">{label}</span> <span className="font-semibold text-slate-100 tabular-nums">{fmtNum(s.mean)}</span>
      {s.min !== s.max && (
        <span className="text-slate-500 tabular-nums">
          {' '}
          ({fmtNum(s.min)} to {fmtNum(s.max)})
        </span>
      )}
    </span>
  );
}

function EndState({ values, keys, name }: { values: Record<string, Value | undefined>; keys: string[]; name: (k: string) => string }) {
  return (
    <span className="flex flex-wrap gap-1">
      {keys.map((k) => (
        <span key={k} className="rounded bg-slate-800 px-1.5 py-0.5 text-[11px] text-slate-200" title={name(k)}>
          <span className="text-slate-500">{name(k)}:</span> {formatValue(values[k])}
        </span>
      ))}
    </span>
  );
}

function PlanCard({ plan, analysis, config, name }: { plan: PlanResult; analysis: PlanAnalysis; config: SimulationConfig; name: (k: string) => string }) {
  const [all, setAll] = useState(false);
  const [story, setStory] = useState<string | null>(null);
  const groups = all ? plan.groups : plan.groups.slice(0, SHOWN_GROUPS);
  const rest = plan.groups.slice(SHOWN_GROUPS);
  const restP = rest.reduce((s, g) => s + g.probability, 0);
  // Only show keys that differ between this plan's end states; the rest go in one line.
  const varying = analysis.outcomeKeys.filter((k) => new Set(plan.groups.map((g) => String(g.values[k]))).size > 1);
  const fixed = analysis.outcomeKeys.filter((k) => !varying.includes(k));
  return (
    <Card className="space-y-2">
      <ol className="flex flex-wrap items-center gap-1 text-xs">
        {plan.steps.length === 0 && <li className="text-slate-400">No choices to make</li>}
        {plan.steps.map((s, i) => (
          <li key={s.decision.contingency.id} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={12} className="text-slate-600" />}
            <span className="rounded-md border border-sky-700/60 bg-sky-950/50 px-1.5 py-0.5" title={s.decision.contingency.title}>
              <span className="font-mono text-[10px] text-sky-400">{String.fromCharCode(65 + i)}</span> <span className="text-slate-400">{s.decision.contingency.title}:</span>{' '}
              <span className="text-slate-100">{s.action.label}</span>
              {s.probability < 0.995 && <span className="ml-1 text-[10px] text-slate-400">(comes up in {formatP(s.probability)})</span>}
            </span>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
        {analysis.numericKeys.map((k) => (
          <Numeric key={k} label={`${name(k)}, average`} s={plan.numeric[k]} />
        ))}
        {plan.coverage < 0.95 && <span className="text-amber-300">covers {formatP(plan.coverage)} of runs; the rest were too unlikely to follow</span>}
      </div>
      {fixed.length > 0 && (
        <div className="text-[11px] text-slate-500">
          Always: {fixed.map((k) => `${name(k)} = ${formatValue(plan.groups[0]?.values[k])}`).join(' · ')}
        </div>
      )}
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-[10px] tracking-wider text-slate-500 uppercase">
            <th className="pb-1 font-medium">Chance</th>
            <th className="pb-1 font-medium">Where it ends</th>
            <th className="pb-1 text-right font-medium">{analysis.numericKeys.map(name).join(' / ')}</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => [
            <tr key={g.key} className="border-t border-slate-800 align-top">
              <td className="w-20 py-1 pr-2">
                <div className="font-semibold text-slate-100 tabular-nums">{formatP(g.probability)}</div>
                <div className="mt-0.5 h-1 rounded bg-slate-800">
                  <div className="h-1 rounded bg-cyan-400" style={{ width: `${Math.max(2, g.probability * 100)}%` }} />
                </div>
              </td>
              <td className="py-1 pr-2">
                <EndState values={g.values} keys={varying.length ? varying : analysis.outcomeKeys} name={name} />
              </td>
              <td className="py-1 text-right whitespace-nowrap">
                {analysis.numericKeys.map((k) => (
                  <div key={k} className="tabular-nums text-slate-300" title={`${name(k)}: ${fmtNum(g.numeric[k].min)} to ${fmtNum(g.numeric[k].max)}`}>
                    {fmtNum(g.numeric[k].mean)}
                  </div>
                ))}
                <button type="button" className="text-[10px] text-cyan-400 hover:underline" onClick={() => setStory(story === g.key ? null : g.key)} title="The most likely sequence of events ending here">
                  {story === g.key ? 'hide story' : 'story'}
                </button>
              </td>
            </tr>,
            story === g.key && (
              <tr key={`${g.key}-story`}>
                <td colSpan={3} className="pb-2 pl-2">
                  <Story config={config} result={plan.result} nodeId={g.example.id} />
                </td>
              </tr>
            ),
          ])}
        </tbody>
      </table>
      {rest.length > 0 && (
        <button type="button" className="flex items-center gap-1 text-xs text-cyan-400 hover:underline" onClick={() => setAll(!all)}>
          {all ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {all ? 'Show fewer' : `${rest.length} more end states (${formatP(restP)})`}
        </button>
      )}
    </Card>
  );
}

/**
 * The "choices A, B, C lead to these endings" view. Each card is one plan the
 * actor can commit to; its table lists where the story ends and how likely each
 * ending is under that plan, with the random events averaged in.
 */
export function PlansView({ config, result }: { config: SimulationConfig; result: SimResult }) {
  const name = useNames(config);
  const [done, setDone] = useState<{ result: SimResult; analysis: PlanAnalysis } | null>(null);
  const analysis = done?.result === result ? done.analysis : null;
  const [sortKey, setSortKey] = useState<string>('written');
  const [first, setFirst] = useState<string>('all');

  // Simulating every plan can take a second, so let the "working" state paint first.
  useEffect(() => {
    const t = setTimeout(() => setDone({ result, analysis: analyzePlans(config, result) }), 30);
    return () => clearTimeout(t);
  }, [config, result]);

  const firstDecision = analysis?.decisions[0];
  const plans = useMemo(() => {
    if (!analysis) return [];
    let list = analysis.plans;
    if (first !== 'all' && firstDecision) list = list.filter((p) => p.plan[firstDecision.contingency.id] === first);
    if (sortKey !== 'written') list = [...list].sort((a, b) => b.numeric[sortKey].mean - a.numeric[sortKey].mean);
    return list;
  }, [analysis, sortKey, first, firstDecision]);

  if (!analysis)
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-slate-400">
        <Loader2 size={16} className="animate-spin" /> Simulating each plan…
      </div>
    );

  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="mx-auto max-w-4xl space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <Route size={14} className="text-cyan-400" />
          <span className="flex-1">
            Each card is one plan: the choices made at each decision point (A, B, C…). Below it are the endings that plan leads to, with their probability once the random events are
            averaged in. Quiet months and event order are folded away.
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
          {firstDecision && (
            <label className="flex items-center gap-1">
              First choice
              <Select className="!py-0.5 text-xs" value={first} onChange={(e) => setFirst(e.target.value)}>
                <option value="all">all</option>
                {firstDecision.actions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </Select>
            </label>
          )}
          {analysis.numericKeys.length > 0 && (
            <label className="flex items-center gap-1">
              Order
              <Select className="!py-0.5 text-xs" value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
                <option value="written">as the choices are written</option>
                {analysis.numericKeys.map((k) => (
                  <option key={k} value={k}>
                    by average {name(k)}, highest first
                  </option>
                ))}
              </Select>
            </label>
          )}
          <span className="ml-auto text-slate-500">
            {analysis.plans.length} plans · {analysis.decisions.length} decision points
            {analysis.capped && ' · only the first 64 combinations were simulated'}
          </span>
        </div>
        {analysis.decisions.length === 0 && (
          <p className="flex items-center gap-1 text-sm text-slate-400">
            <Flag size={14} /> No decision in this scenario offers more than one option, so there is a single plan.
          </p>
        )}
        {plans.map((p) => (
          <PlanCard key={p.id} plan={p} analysis={analysis} config={config} name={name} />
        ))}
      </div>
    </div>
  );
}
