import { Cpu, Radar, ShieldAlert, ShieldCheck, Skull } from 'lucide-react';
import { useMemo, useState } from 'react';
import { computeResilience, formatP, type Resilience } from '../engine/analysis';
import type { SimResult, SimulationConfig } from '../types/simulation';
import { Story } from './Dossier';
import { Card } from './ui';

interface Props {
  config: SimulationConfig;
  result: SimResult;
  onSelect: (id: string) => void;
}

const SEVERITY_TONE = {
  critical: 'bg-rose-500/20 text-rose-300 ring-rose-500/50',
  high: 'bg-rose-500/10 text-rose-300 ring-rose-500/30',
  medium: 'bg-amber-500/10 text-amber-300 ring-amber-500/30',
  low: 'bg-slate-700/40 text-slate-400 ring-slate-600/40',
} as const;

export function SeverityTag({ severity }: { severity?: keyof typeof SEVERITY_TONE }) {
  if (!severity) return null;
  return <span className={`rounded px-1 py-px text-[9px] font-bold tracking-wider uppercase ring-1 ${SEVERITY_TONE[severity]}`}>{severity}</span>;
}

function coverageTone(c: number | null) {
  if (c === null) return { bar: 'bg-slate-600', text: 'text-slate-300' };
  if (c >= 0.8) return { bar: 'bg-emerald-400', text: 'text-emerald-300' };
  if (c >= 0.5) return { bar: 'bg-amber-400', text: 'text-amber-300' };
  return { bar: 'bg-rose-500', text: 'text-rose-300' };
}

/** Tactical Resilience Breakdown: coverage, blind spots, exposure, rule activity. */
export function ResiliencePanel({ config, result, onSelect }: Props) {
  const res: Resilience = useMemo(() => computeResilience(config, result), [config, result]);
  const [openSpot, setOpenSpot] = useState<string | null>(null);
  const tone = coverageTone(res.coverage);
  const high = res.shocks.filter((s) => s.highRisk);

  return (
    <div className="space-y-2">
      <Card className="space-y-2">
        <div className="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">Contingency coverage</div>
        <div className="flex items-baseline gap-2">
          <span className={`text-3xl font-bold tabular-nums ${tone.text}`}>{res.coverage === null ? '—' : `${Math.round(res.coverage * 100)}%`}</span>
          <span className="text-xs text-slate-400">
            {res.highRisk === 0 ? 'No high-risk shocks in this scenario.' : `${res.coveredHighRisk} of ${res.highRisk} high-risk shocks have an If-Then fallback.`}
          </span>
        </div>
        <div className="h-1.5 rounded bg-slate-800">
          <div className={`h-1.5 rounded ${tone.bar}`} style={{ width: `${(res.coverage ?? 0) * 100}%` }} />
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <Skull size={12} className={res.blindSpotMass > 0 ? 'text-rose-400' : 'text-slate-500'} />
          {res.blindSpots.length === 0 ? 'No blind spots: every high-risk dead end was met by a contingency.' : `${formatP(res.blindSpotMass)} of the probability ends in a blind spot.`}
        </div>
      </Card>

      {res.blindSpots.length > 0 && (
        <>
          <h3 className="flex items-center gap-1 pt-1 text-xs font-semibold text-rose-300">
            <ShieldAlert size={13} /> Blind spots
          </h3>
          <p className="text-[11px] text-slate-500">Dead ends where an uncontrollable shock hit before any sensor could trip.</p>
          {res.blindSpots.map((b) => {
            const isOpen = openSpot === b.shock.id;
            return (
              <Card key={b.shock.id} className="!p-0 border-rose-900/70">
                <button
                  type="button"
                  className="w-full p-2.5 text-left"
                  onClick={() => {
                    setOpenSpot(isOpen ? null : b.shock.id);
                    onSelect(b.best.id);
                  }}
                >
                  <div className="flex items-center gap-2">
                    <Radar size={13} className="shrink-0 text-rose-400" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-100">{b.shock.title}</span>
                    <span className="text-sm font-semibold text-rose-300 tabular-nums">{formatP(b.probability)}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
                    <SeverityTag severity={b.shock.severity} />
                    {b.nodes.length} dead {b.nodes.length === 1 ? 'end' : 'ends'} ·{' '}
                    {res.shocks.find((s) => s.shock.id === b.shock.id)?.covered ? 'covered on paper, but no sensor tripped in time' : 'no rule intercepts or answers it'}
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t border-slate-800 p-2.5">
                    <div className="mb-1.5 text-xs font-semibold text-slate-300">Most likely way into this blind spot</div>
                    <Story config={config} result={result} nodeId={b.best.id} />
                  </div>
                )}
              </Card>
            );
          })}
        </>
      )}

      <h3 className="flex items-center gap-1 pt-1 text-xs font-semibold text-slate-300">
        <Radar size={13} className="text-rose-400" /> High-risk shock exposure
      </h3>
      {high.length === 0 && <p className="text-xs text-slate-500">Mark shocks as high or critical severity to track them here.</p>}
      {high.map((s) => (
        <Card key={s.shock.id} className="space-y-1 !p-2.5">
          <div className="flex items-center gap-2">
            {s.covered ? <ShieldCheck size={13} className="shrink-0 text-sky-400" /> : <ShieldAlert size={13} className="shrink-0 text-rose-400" />}
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-200">{s.shock.title}</span>
            <span className="rounded bg-rose-500/10 px-1 font-mono text-[10px] text-rose-300">P = {Math.round(s.shock.probability * 100)}%</span>
            <SeverityTag severity={s.shock.severity ?? 'high'} />
          </div>
          <div className="pl-5 text-[11px] text-slate-400">
            {s.interceptedBy.length > 0 && <div>Intercepted by {s.interceptedBy.map((c) => c.title).join(', ')}</div>}
            {s.answeredBy.length > 0 && <div>Trips the sensors of {s.answeredBy.map((c) => c.title).join(', ')}</div>}
            {!s.covered && <div className="font-semibold text-rose-300">Uncovered: no If-Then rule watches for it</div>}
            <div className="text-slate-500">
              {/* A repeatable shock can hit several times per run, so its mass reads as expected hits. */}
              Hit unopposed {s.shock.repeatable ? `${s.hitMass.toFixed(2)}× per run` : formatP(s.hitMass)}
              {s.interceptedMass > 0 && ` · intercepted ${s.shock.repeatable ? `${s.interceptedMass.toFixed(2)}×` : formatP(s.interceptedMass)}`}
            </div>
          </div>
        </Card>
      ))}

      <h3 className="flex items-center gap-1 pt-1 text-xs font-semibold text-slate-300">
        <Cpu size={13} className="text-sky-400" /> Contingency activity
      </h3>
      {config.contingencies.length === 0 && <p className="text-xs text-slate-500">No If-Then rules yet. Every shock in this scenario lands unopposed.</p>}
      {config.contingencies.map((c) => {
        const mass = res.activations.get(c.id) ?? 0;
        return (
          <div key={c.id} className="flex items-center gap-2 rounded border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs">
            <span className="min-w-0 flex-1 truncate text-slate-200">{c.title}</span>
            {c.intercepts?.length ? <span className="text-[10px] text-sky-400">interceptor</span> : null}
            {mass > 0 ? <span className="text-slate-400 tabular-nums">fires {formatP(mass)}</span> : <span className="font-semibold text-amber-300">dormant</span>}
          </div>
        );
      })}
      {config.mode !== 'montecarlo' && config.choicePolicy !== 'uniform' && config.contingencies.length > 0 && (
        <p className="text-[11px] text-slate-500">Masses are conditional on the options taken, so they can add up to more than 100%.</p>
      )}
    </div>
  );
}
