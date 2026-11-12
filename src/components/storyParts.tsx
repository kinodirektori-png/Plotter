import { CornerDownRight, Flag } from 'lucide-react';
import { useMemo } from 'react';
import { formatP } from '../engine/analysis';
import { clockAt, formatTick } from '../engine/state';
import type { Happening, Stop, Turn } from '../engine/story';
import type { SimulationConfig } from '../types/simulation';
import { formatValue } from './ui';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface Labels {
  name: (k: string) => string;
  when: (from: number, until: number) => string;
}

/** Variable names and "Mar 2027" / "Jan–Jun 2027" style dates for the story views. */
export function useLabels(config: SimulationConfig): Labels {
  return useMemo(() => {
    const names = new Map((config.variables ?? []).map((v) => [v.id, v.name || v.id]));
    const month = (t: number) => {
      const d = clockAt(config.timeline, t).date;
      if (!d || config.timeline?.unit !== 'month') return null;
      return { m: MONTHS[Number(d.slice(5, 7)) - 1], y: d.slice(0, 4) };
    };
    const when = (from: number, until: number) => {
      const a = month(from);
      const b = month(until);
      if (a && b) {
        if (from === until) return `${a.m} ${a.y}`;
        return a.y === b.y ? `${a.m}–${b.m} ${b.y}` : `${a.m} ${a.y}–${b.m} ${b.y}`;
      }
      return from === until ? formatTick(config.timeline, from) : `${formatTick(config.timeline, from)} to ${formatTick(config.timeline, until)}`;
    };
    return { name: (k: string) => names.get(k) ?? k, when };
  }, [config]);
}

export const fmtNum = (n: number) => (Math.abs(n) >= 1000 ? Math.round(n).toLocaleString('en-US') : String(Math.round(n * 100) / 100));

/** The events of one turn, in order. Rules that fired on their own are shown as consequences. */
export function Happenings({ turn, labels, big = false }: { turn: Turn; labels: Labels; big?: boolean }) {
  const text = big ? 'text-sm' : 'text-xs';
  if (!turn.happenings.length) return <span className={`${text} text-slate-400 italic`}>Nothing major happens</span>;
  return (
    <span className={`flex flex-wrap items-center gap-1 ${text}`}>
      {turn.happenings.map((h, i) =>
        h.kind === 'event' ? (
          <span key={`${h.id}-${i}`} className="rounded-md border border-amber-700/50 bg-amber-950/40 px-1.5 py-0.5 text-amber-100">
            {h.title} <span className="text-[10px] text-amber-400/80">{labels.when(h.from, h.until)}</span>
          </span>
        ) : (
          <span key={`${h.id}-${i}`} className="flex items-center gap-0.5 text-slate-400" title={h.title}>
            <CornerDownRight size={11} />
            {h.detail ?? h.title}
          </span>
        ),
      )}
    </span>
  );
}

export function AlongTheWay({ turn, labels }: { turn: Turn; labels: Labels }) {
  const shown = turn.along.filter((a) => a.probability >= 0.05).slice(0, 3);
  if (!shown.length) return null;
  const rest = turn.along.length - shown.length;
  return (
    <div className="text-[11px] text-slate-500" title={turn.along.map((a) => `${a.happening.title}: ${formatP(a.probability)}, ${labels.when(a.happening.from, a.happening.until)}`).join('\n')}>
      Along the way: {shown.map((a) => `${a.happening.title} (${formatP(a.probability)})`).join(' · ')}
      {rest > 0 && ` · ${rest} more`}
    </div>
  );
}

export function happeningText(h: Happening[]): string {
  const ev = h.filter((x) => x.kind === 'event').map((x) => x.title);
  return ev.length ? ev.join(', ') : 'nothing major happens';
}

/** Where the story ends: the outcome variables, plus averages for the numbers. */
export function Ending({ stop, labels, big = false }: { stop: Extract<Stop, { kind: 'end' }>; labels: Labels; big?: boolean }) {
  return (
    <div className="space-y-1">
      <div className={`flex flex-wrap items-center gap-1 ${big ? 'text-sm' : 'text-xs'}`}>
        <Flag size={big ? 15 : 12} className="text-emerald-400" />
        {Object.entries(stop.values).map(([k, v]) => (
          <span key={k} className="rounded bg-emerald-950/50 px-1.5 py-0.5 text-emerald-100 ring-1 ring-emerald-800/60">
            <span className="text-emerald-400/80">{labels.name(k)}:</span> {formatValue(v)}
          </span>
        ))}
        {Object.entries(stop.numeric).map(([k, s]) => (
          <span key={k} className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-100 tabular-nums">
            <span className="text-slate-400">{labels.name(k)}:</span> {fmtNum(s.mean)}
            {s.min !== s.max && (
              <span className="text-slate-500">
                {' '}
                ({fmtNum(s.min)} to {fmtNum(s.max)})
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Is this turn just "carry on" (no events, certain)? Then the views skip straight to its stop. */
export function isTrivial(turns: Turn[]): boolean {
  return turns.length === 1 && turns[0].happenings.length === 0 && turns[0].along.length === 0;
}
