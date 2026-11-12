import { ChevronDown, ChevronRight, GitFork, Route } from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatP } from '../engine/analysis';
import { choose, startPoint, unfold, type StoryOptions, type Turn, type Unfolded } from '../engine/story';
import type { SimulationConfig } from '../types/simulation';
import { AlongTheWay, Ending, Happenings, happeningText, isTrivial, useLabels, type Labels } from './storyParts';

const SHOWN_P = 0.03;

interface Ctx {
  config: SimulationConfig;
  labels: Labels;
  opts: StoryOptions;
}

type TrailStep = { kind: 'choice'; letter: string; label: string } | { kind: 'turn'; text: string; p: number };

const letter = (trail: TrailStep[]) => String.fromCharCode(65 + trail.filter((t) => t.kind === 'choice').length);

function TrailLine({ trail }: { trail: TrailStep[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-1 text-[11px] text-slate-500">
      {trail.map((t, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight size={10} />}
          {t.kind === 'choice' ? (
            <span className="text-sky-300">
              {t.letter}: {t.label}
            </span>
          ) : (
            <span className="text-amber-200/80">
              {t.text} ({formatP(t.p)})
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

function Turns({ ctx, u, trail, pathP, open }: { ctx: Ctx; u: Unfolded; trail: TrailStep[]; pathP: number; open: boolean }) {
  const [more, setMore] = useState(false);
  if (isTrivial(u.turns)) return <StopNode ctx={ctx} turn={u.turns[0]} trail={trail} pathP={pathP} open={open} />;
  const shown = u.turns.filter((t, i) => more || t.probability >= SHOWN_P || i < 2);
  const hidden = u.turns.length - shown.length;
  const hiddenP = u.turns.filter((t) => !shown.includes(t)).reduce((s, t) => s + t.probability, 0);
  return (
    <ul className="space-y-1.5">
      {shown.map((t) => (
        <TurnRow key={t.key} ctx={ctx} turn={t} trail={trail} pathP={pathP} />
      ))}
      {hidden > 0 && (
        <li>
          <button type="button" className="flex items-center gap-1 text-xs text-cyan-400 hover:underline" onClick={() => setMore(true)}>
            <ChevronRight size={12} /> {hidden} rarer turns ({formatP(hiddenP)})
          </button>
        </li>
      )}
      {u.lost > 0.005 && <li className="text-[11px] text-slate-500">{formatP(u.lost)} of the runs were too unlikely to follow.</li>}
    </ul>
  );
}

function TurnRow({ ctx, turn, trail, pathP }: { ctx: Ctx; turn: Turn; trail: TrailStep[]; pathP: number }) {
  const next: TrailStep[] = [...trail, { kind: 'turn', text: happeningText(turn.happenings), p: turn.probability }];
  return (
    <li className="relative border-l-2 border-amber-700/40 pl-3">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 w-14 shrink-0">
          <span className="block text-xs font-semibold text-amber-200 tabular-nums">{formatP(turn.probability)}</span>
          <span className="mt-0.5 block h-1 rounded bg-slate-800">
            <span className="block h-1 rounded bg-amber-400" style={{ width: `${Math.max(3, turn.probability * 100)}%` }} />
          </span>
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <Happenings turn={turn} labels={ctx.labels} />
          <AlongTheWay turn={turn} labels={ctx.labels} />
          <StopNode ctx={ctx} turn={turn} trail={next} pathP={pathP * turn.probability} open={false} />
        </div>
      </div>
    </li>
  );
}

function StopNode({ ctx, turn, trail, pathP, open }: { ctx: Ctx; turn: Turn; trail: TrailStep[]; pathP: number; open: boolean }) {
  const s = turn.stop;
  if (s.kind === 'end')
    return (
      <div className="rounded-md border border-emerald-800/50 bg-emerald-950/20 p-2">
        <Ending stop={s} labels={ctx.labels} />
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
          <span>
            Chance of this whole path, given her choices: <span className="font-semibold text-slate-200">{formatP(pathP)}</span>
          </span>
          <span className="text-slate-600">·</span>
          <span>ends {ctx.labels.when(s.from, s.until)}</span>
        </div>
        {trail.length > 0 && <TrailLine trail={trail} />}
      </div>
    );
  const L = letter(trail);
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="flex h-5 w-5 items-center justify-center rounded bg-sky-600 font-mono text-[11px] font-bold text-white">{L}</span>
        <span className="font-semibold text-sky-100">{s.contingency.title}</span>
        <span className="text-[10px] text-slate-500">{ctx.labels.when(s.from, s.until)} · her choice, no odds</span>
      </div>
      <ul className="ml-2 space-y-1 border-l-2 border-sky-700/50 pl-3">
        {s.options.map((o, i) => (
          <OptionNode key={o.action.id} ctx={ctx} turn={turn} actionId={o.action.id} label={o.action.label} share={o.share} trail={[...trail, { kind: 'choice', letter: L, label: o.action.label }]} pathP={pathP} open={open && i === 0} />
        ))}
      </ul>
    </div>
  );
}

function OptionNode({ ctx, turn, actionId, label, share, trail, pathP, open: initial }: { ctx: Ctx; turn: Turn; actionId: string; label: string; share: number; trail: TrailStep[]; pathP: number; open: boolean }) {
  const [open, setOpen] = useState(initial);
  const u = useMemo(() => {
    if (!open || turn.stop.kind !== 'choice') return null;
    return unfold(ctx.config, choose(ctx.config, turn.stop, actionId), ctx.opts);
  }, [open, ctx, turn, actionId]);
  return (
    <li>
      <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-1 rounded-md px-1 py-0.5 text-left text-xs text-sky-200 hover:bg-sky-950/60">
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <span className="text-slate-400">She chooses:</span> <span className="font-medium">{label}</span>
        {share < 0.995 && <span className="text-[10px] text-slate-500">(only possible in {formatP(share)} of these situations)</span>}
      </button>
      {u && (
        <div className="mt-1 ml-1">
          <Turns ctx={ctx} u={u} trail={trail} pathP={pathP} open={false} />
        </div>
      )}
    </li>
  );
}

/**
 * The story as a branching outline: her choices (blue, lettered A, B, C…, no
 * odds) and the turns the world can take after each one (amber, with odds),
 * down to where each path ends.
 */
export function PathsView({ config }: { config: SimulationConfig }) {
  const labels = useLabels(config);
  const [allEvents, setAllEvents] = useState(false);
  const ctx = useMemo<Ctx>(() => ({ config, labels, opts: { allEvents } }), [config, labels, allEvents]);
  const root = useMemo(() => unfold(config, startPoint(config), ctx.opts), [config, ctx]);
  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="mx-auto max-w-5xl space-y-3">
        <div className="flex flex-wrap items-start gap-2 text-xs text-slate-400">
          <Route size={14} className="mt-0.5 text-cyan-400" />
          <p className="flex-1">
            Read top to bottom. <span className="text-sky-300">Blue</span> steps are her choices: no odds, she decides. Open one to see what can happen next.{' '}
            <span className="text-amber-300">Amber</span> steps are what the world does after it, with the chance of each. Each path ends in a{' '}
            <span className="text-emerald-300">green</span> ending. Background events that do not change the story, like price moves, are listed under "along the way".
          </p>
          <label className="flex items-center gap-1 text-slate-300" title="Let every event split the story, including background ones">
            <input type="checkbox" checked={allEvents} onChange={(e) => setAllEvents(e.target.checked)} />
            <GitFork size={12} /> split on every event
          </label>
        </div>
        <Turns key={String(allEvents)} ctx={ctx} u={root} trail={[]} pathP={1} open />
      </div>
    </div>
  );
}
