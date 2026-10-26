import { BookOpen, Flag, GitFork, ListTree, Route } from 'lucide-react';
import { useEffect, useState } from 'react';
import { bestPath, formatP, type Outcome } from '../engine/analysis';
import { diffState } from '../engine/state';
import type { SimEdge, SimResult, SimulationConfig, WorldState } from '../types/simulation';
import { Card, Tabs, formatValue } from './ui';

interface Props {
  config: SimulationConfig;
  result: SimResult;
  outcomes: Outcome[];
  selectedId: string | null;
  graphPick: number;
  onSelect: (id: string) => void;
}

function edgeDescription(config: SimulationConfig, e: SimEdge): string | undefined {
  if (e.kind === 'event') return config.events.find((x) => x.id === e.refId)?.description;
  if (e.kind === 'choice') {
    const [d, c] = e.refId.split(':');
    return config.decisions.find((x) => x.id === d)?.choices.find((x) => x.id === c)?.description;
  }
  return undefined;
}

function stepOdds(e: SimEdge): string {
  if (e.kind === 'choice' && e.probability === 1) return 'chosen';
  if (e.kind === 'event' && e.probability === 1) return 'the only thing that could happen next';
  return formatP(e.probability);
}

export function Story({ config, result, nodeId }: { config: SimulationConfig; result: SimResult; nodeId: string }) {
  const path = bestPath(result, nodeId);
  if (!path.length) return <p className="text-xs italic text-slate-400">This is the starting state.</p>;
  return (
    <ol className="space-y-1.5">
      {path.map((e, i) => {
        const prev = result.nodes[e.source].state;
        const next = result.nodes[e.target].state;
        const desc = edgeDescription(config, e);
        return (
          <li key={e.id} className="flex gap-2 text-xs">
            <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${e.kind === 'choice' ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'}`}>{i + 1}</span>
            <div className="min-w-0">
              <div className="font-medium text-slate-700">
                {e.kind === 'choice' && <GitFork size={11} className="mr-1 inline text-amber-600" />}
                {e.label} <span className="font-normal text-slate-400">({stepOdds(e)})</span>
              </div>
              {desc && <div className="text-slate-500">{desc}</div>}
              <div className="font-mono text-[10px] text-slate-400">
                {diffState(prev, next)
                  .map((d) => `${d.key}: ${formatValue(d.before)} → ${formatValue(d.after)}`)
                  .join(' · ') || 'no state change'}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function StateTable({ initial, state }: { initial: WorldState; state: WorldState }) {
  const keys = [...new Set([...Object.keys(initial), ...Object.keys(state)])].sort();
  return (
    <table className="w-full text-xs">
      <tbody>
        {keys.map((k) => {
          const changed = initial[k] !== state[k];
          return (
            <tr key={k} className={changed ? 'bg-indigo-50' : ''}>
              <td className="py-0.5 pr-2 font-mono text-slate-500">{k}</td>
              <td className={`py-0.5 font-mono ${changed ? 'font-semibold text-indigo-700' : 'text-slate-700'}`}>
                {formatValue(state[k])}
                {changed && <span className="ml-1 font-normal text-slate-400">(was {formatValue(initial[k])})</span>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function Dossier({ config, result, outcomes, selectedId, graphPick, onSelect }: Props) {
  const [tab, setTab] = useState<'outcomes' | 'selected'>('outcomes');
  const [open, setOpen] = useState<string | null>(outcomes[0]?.id ?? null);
  const initial = result.nodes[result.rootId].state;
  const conditional = config.mode !== 'montecarlo' && config.choicePolicy !== 'uniform' && config.decisions.length > 0;
  const sel = selectedId ? result.nodes[selectedId] : undefined;
  const activeTab = sel ? tab : 'outcomes';
  useEffect(() => {
    if (graphPick > 0) setTab('selected');
  }, [graphPick]);

  return (
    <div className="flex h-full flex-col">
      <Tabs
        tabs={[
          { id: 'outcomes', label: `Outcomes (${outcomes.length})`, icon: <ListTree size={13} /> },
          { id: 'selected', label: 'Selected state', icon: <Route size={13} /> },
        ]}
        value={activeTab}
        onChange={setTab}
      />
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {activeTab === 'outcomes' && (
          <>
            {conditional && (
              <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-800">
                Probabilities are conditional on the choices along each path, so outcomes from different choices can add up to more than 100%. Switch "How choices count" in Run to treat choices as coin flips.
              </p>
            )}
            {result.stats.prunedMass > 0 && (
              <p className="text-xs text-slate-500">
                {formatP(result.stats.prunedMass)} of probability was pruned as unlikely ({result.stats.prunedNodes} states).
              </p>
            )}
            {outcomes.length === 0 && <p className="text-sm text-slate-500">No outcomes yet. Add some events.</p>}
            {outcomes.map((o, rank) => {
              const changes = diffState(initial, o.state);
              const isOpen = open === o.id;
              return (
                <Card key={o.id} className="!p-0">
                  <button type="button" className="w-full p-2.5 text-left" onClick={() => { setOpen(isOpen ? null : o.id); onSelect(o.best.id); }}>
                    <div className="flex items-center gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-emerald-100 text-[11px] font-bold text-emerald-700">{rank + 1}</span>
                      <span className="text-sm font-semibold tabular-nums">{formatP(o.probability)}</span>
                      <span className="ml-auto text-xs text-slate-400">
                        {o.pathCount} {o.pathCount === 1 ? 'ordering' : 'orderings'}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 rounded bg-slate-100">
                      <div className="h-1.5 rounded bg-emerald-500" style={{ width: `${Math.min(1, o.probability) * 100}%` }} />
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {changes.length === 0 && <span className="text-xs italic text-slate-400">Nothing changed</span>}
                      {changes.map((d) => (
                        <span key={d.key} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
                          {d.key}={formatValue(d.after)}
                        </span>
                      ))}
                    </div>
                  </button>
                  {isOpen && (
                    <div className="border-t border-slate-100 p-2.5">
                      <div className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-slate-600">
                        <BookOpen size={12} /> Most likely story ({formatP(o.best.bestPathP)} for this exact route)
                      </div>
                      <Story config={config} result={result} nodeId={o.best.id} />
                    </div>
                  )}
                </Card>
              );
            })}
          </>
        )}
        {activeTab === 'selected' && sel && (
          <>
            <Card className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-semibold">
                {sel.terminal && <Flag size={13} className="text-emerald-600" />}
                {sel.id === result.rootId ? 'Start' : `Step ${sel.depth}`}
                <span className="ml-auto tabular-nums">{formatP(sel.probability)}</span>
              </div>
              <div className="text-xs text-slate-500">
                Reached by {sel.pathCount} {sel.pathCount === 1 ? 'ordering' : 'distinct orderings'}.
                {sel.terminal && (sel.terminalReason === 'maxDepth' ? ' Story ends at the step limit.' : ' Story ends: nothing else can happen.')}
                {sel.pendingDecision && ` Next: decision "${config.decisions.find((d) => d.id === sel.pendingDecision)?.title}".`}
              </div>
            </Card>
            <Card>
              <div className="mb-1.5 text-xs font-semibold text-slate-600">World state</div>
              <StateTable initial={initial} state={sel.state} />
            </Card>
            <Card>
              <div className="mb-1.5 text-xs font-semibold text-slate-600">Most likely way here</div>
              <Story config={config} result={result} nodeId={sel.id} />
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

export function buildDossierMarkdown(config: SimulationConfig, result: SimResult, outcomes: Outcome[]): string {
  const initial = result.nodes[result.rootId].state;
  const lines: string[] = [];
  lines.push(`# ${config.title || 'Scenario'}: outcome dossier`, '');
  lines.push(
    `Mode: ${config.mode === 'montecarlo' ? `Monte Carlo, ${config.runs ?? 2000} runs, seed ${config.seed ?? 42}` : 'exhaustive'} · max ${config.maxDepth} steps · prune below ${config.pruneThreshold}`,
    `States: ${result.stats.nodes} · transitions: ${result.stats.edges} · outcomes: ${outcomes.length} · pruned mass: ${formatP(result.stats.prunedMass)}`,
    '',
    '## Starting state',
    '',
  );
  for (const [k, v] of Object.entries(initial)) lines.push(`- \`${k}\` = ${formatValue(v)}`);
  outcomes.forEach((o, i) => {
    lines.push('', `## Outcome ${i + 1}: ${formatP(o.probability)}`, '');
    lines.push(`Reached by ${o.pathCount} distinct ordering(s).`, '');
    const changes = diffState(initial, o.state);
    lines.push('**What changed:** ' + (changes.map((d) => `\`${d.key}\` ${formatValue(d.before)} → ${formatValue(d.after)}`).join(', ') || 'nothing'), '');
    lines.push(`**Most likely story** (${formatP(o.best.bestPathP)} for this exact route):`, '');
    bestPath(result, o.best.id).forEach((e, j) => {
      const desc = edgeDescription(config, e);
      lines.push(`${j + 1}. ${e.label} (${stepOdds(e)})${desc ? `: ${desc}` : ''}`);
    });
  });
  return lines.join('\n') + '\n';
}
