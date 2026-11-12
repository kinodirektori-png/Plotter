import { Clapperboard, Dices, RotateCcw, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatP } from '../engine/analysis';
import { choose, endingKeys, roll, startPoint, unfold, type Stop, type Unfolded } from '../engine/story';
import type { SimulationConfig } from '../types/simulation';
import { AlongTheWay, Ending, Happenings, fmtNum, isTrivial, useLabels } from './storyParts';
import { Button, formatValue } from './ui';

// One stretch of the story: what the world did (a picked turn), then what she did.
interface Frame {
  u: Unfolded;
  pick?: number;
  action?: string;
}

function begin(u: Unfolded): Frame {
  return isTrivial(u.turns) ? { u, pick: 0 } : { u };
}

function Status({ config, stop, name }: { config: SimulationConfig; stop: Stop; name: (k: string) => string }) {
  // Where she stands now on the things the endings are described by.
  const first = stop.items[0]?.pt.state ?? {};
  const { keys, numeric } = endingKeys(config);
  const same = (k: string) => stop.items.every((i) => i.pt.state[k] === first[k]);
  const shown = keys.filter(same);
  const nums = numeric.filter((k) => typeof first[k] === 'number');
  if (!shown.length && !nums.length) return null;
  return (
    <div className="flex flex-wrap gap-1 text-[11px]">
      {shown.map((k) => (
        <span key={k} className="rounded bg-slate-800/80 px-1.5 py-0.5 text-slate-300">
          <span className="text-slate-500">{name(k)}:</span> {formatValue(first[k])}
        </span>
      ))}
      {nums.map((k) => (
        <span key={k} className="rounded bg-slate-800/80 px-1.5 py-0.5 text-slate-300 tabular-nums">
          <span className="text-slate-500">{name(k)}:</span> {fmtNum(stop.items.reduce((s, i) => s + i.w * Number(i.pt.state[k]), 0))}
        </span>
      ))}
    </div>
  );
}

/**
 * Choose-your-path mode. She is the main character: at each decision the
 * reader picks what she does; in between, the world rolls its dice by the
 * scenario's odds (or the reader picks a turn to explore it).
 */
export function PlayView({ config }: { config: SimulationConfig }) {
  const labels = useLabels(config);
  const start = useMemo(() => begin(unfold(config, startPoint(config))), [config]);
  const [game, setGame] = useState<{ config: SimulationConfig; stack: Frame[][] }>({ config, stack: [[start]] });
  const [rolling, setRolling] = useState<number | null>(null);
  const [allTurns, setAllTurns] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  if (game.config !== config) setGame({ config, stack: [[start]] });
  const frames = game.stack[game.stack.length - 1];
  const cur = frames[frames.length - 1];
  const stop = cur.pick !== undefined ? cur.u.turns[cur.pick].stop : null;
  const pathP = frames.reduce((p, f) => (f.pick !== undefined ? p * f.u.turns[f.pick].probability : p), 1);
  const chapter = frames.filter((f) => f.action).length;

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [frames.length, cur.pick]);

  const push = (next: Frame[]) => setGame((g) => ({ ...g, stack: [...g.stack, next] }));
  const pickTurn = (i: number) => {
    setAllTurns(false);
    push([...frames.slice(0, -1), { ...cur, pick: i }]);
  };
  const visible = cur.u.turns.map((t, i) => ({ t, i })).filter(({ t, i }) => allTurns || t.probability >= 0.02 || i < 3 || rolling === i);
  const hiddenP = cur.u.turns.reduce((s, t, i) => (visible.some((v) => v.i === i) ? s : s + t.probability), 0);
  const doRoll = () => {
    const target = roll(cur.u);
    let n = 0;
    const order = visible.map((v) => v.i).slice(0, 6).concat(target);
    const tick = () => {
      setRolling(order[n % order.length]);
      n++;
      if (n < 10) setTimeout(tick, 70);
      else {
        setRolling(null);
        pickTurn(target);
      }
    };
    tick();
  };
  const act = (actionId: string) => {
    if (!stop || stop.kind !== 'choice') return;
    const u = unfold(config, choose(config, stop, actionId));
    push([...frames.slice(0, -1), { ...cur, action: actionId }, begin(u)]);
  };
  const back = () => setGame((g) => (g.stack.length > 1 ? { ...g, stack: g.stack.slice(0, -1) } : g));
  const restart = () => setGame({ config, stack: [[start]] });

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-b from-slate-950 via-slate-950 to-indigo-950/40 p-4">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center gap-2">
          <Clapperboard size={16} className="text-fuchsia-400" />
          <h2 className="flex-1 text-sm font-semibold text-slate-100">
            Play it out <span className="font-normal text-slate-400">· you are the main character</span>
          </h2>
          <Button variant="ghost" onClick={back} disabled={game.stack.length < 2} title="Undo the last step">
            <Undo2 size={13} /> Back
          </Button>
          <Button variant="ghost" onClick={restart} title="Start again">
            <RotateCcw size={13} /> Restart
          </Button>
        </div>

        {/* The story so far */}
        <ol className="space-y-2">
          {frames.map((f, i) => {
            const t = f.pick !== undefined ? f.u.turns[f.pick] : null;
            if (!t) return null;
            const s = t.stop;
            return (
              <li key={i} className="space-y-1">
                {!isTrivial(f.u.turns) && (
                  <div className="rounded-md border border-amber-800/40 bg-amber-950/20 px-2 py-1.5">
                    <div className="mb-0.5 text-[10px] tracking-wider text-amber-400/80 uppercase">What happened · {formatP(t.probability)} chance</div>
                    <Happenings turn={t} labels={labels} />
                    <AlongTheWay turn={t} labels={labels} />
                  </div>
                )}
                {s.kind === 'choice' && f.action && (
                  <div className="ml-6 text-xs text-sky-200">
                    <span className="mr-1 rounded bg-sky-700 px-1 font-mono text-[10px] font-bold text-white">{String.fromCharCode(65 + frames.slice(0, i).filter((x) => x.action).length)}</span>
                    {labels.when(s.from, s.until)}: you chose <span className="font-semibold">{s.options.find((o) => o.action.id === f.action)?.action.label}</span>
                  </div>
                )}
              </li>
            );
          })}
        </ol>

        {/* What is in front of her now */}
        {cur.pick === undefined && (
          <section className="space-y-3 rounded-xl border border-amber-700/40 bg-slate-900/80 p-4 shadow-lg">
            <div className="text-xs tracking-wider text-amber-300 uppercase">What happens next?</div>
            <p className="text-sm text-slate-300">The world takes its turn. Roll the dice to let the odds decide, or pick a turn to explore it.</p>
            <ul className="space-y-1">
              {visible.map(({ t, i }) => (
                <li key={t.key}>
                  <button
                    type="button"
                    onClick={() => pickTurn(i)}
                    className={`flex w-full items-start gap-2 rounded-md px-2 py-1 text-left transition hover:bg-slate-800 ${rolling === i ? 'bg-amber-500/20 ring-1 ring-amber-400' : ''}`}
                  >
                    <span className="w-14 shrink-0 pt-0.5">
                      <span className="block text-xs font-semibold text-amber-200 tabular-nums">{formatP(t.probability)}</span>
                      <span className="mt-0.5 block h-1 rounded bg-slate-800">
                        <span className="block h-1 rounded bg-amber-400" style={{ width: `${Math.max(3, t.probability * 100)}%` }} />
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <Happenings turn={t} labels={labels} />
                      <span className="mt-0.5 block text-[11px] text-slate-500">
                        {t.stop.kind === 'choice' ? `leads to her next decision: ${t.stop.contingency.title}` : 'leads to an ending'}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
              {visible.length < cur.u.turns.length && (
                <li>
                  <button type="button" className="px-2 text-xs text-cyan-400 hover:underline" onClick={() => setAllTurns(true)}>
                    {cur.u.turns.length - visible.length} rarer turns ({formatP(hiddenP)} together)
                  </button>
                </li>
              )}
            </ul>
            <Button variant="primary" onClick={doRoll} disabled={rolling !== null}>
              <Dices size={14} /> Roll the dice
            </Button>
          </section>
        )}

        {stop?.kind === 'choice' && (
          <section className="space-y-3 rounded-xl border border-sky-600/50 bg-gradient-to-br from-sky-950/80 to-slate-900 p-5 shadow-xl">
            <div className="flex items-center gap-2 text-xs tracking-wider text-sky-300 uppercase">
              <span className="rounded bg-sky-600 px-1.5 font-mono font-bold text-white">{String.fromCharCode(65 + chapter)}</span>
              Your decision · {labels.when(stop.from, stop.until)}
            </div>
            <h3 className="text-lg font-semibold text-white">{stop.contingency.title}</h3>
            {stop.contingency.description && <p className="text-sm text-slate-300">{stop.contingency.description}</p>}
            <Status config={config} stop={stop} name={labels.name} />
            <div className="grid gap-2 sm:grid-cols-2">
              {stop.options.map((o) => (
                <button
                  key={o.action.id}
                  type="button"
                  onClick={() => act(o.action.id)}
                  className="group rounded-lg border border-sky-700/60 bg-slate-950/70 p-3 text-left transition hover:-translate-y-0.5 hover:border-sky-400 hover:bg-sky-950"
                >
                  <div className="text-sm font-semibold text-sky-100 group-hover:text-white">{o.action.label}</div>
                  {o.action.description && <div className="mt-1 text-xs text-slate-400">{o.action.description}</div>}
                  {o.share < 0.995 && <div className="mt-1 text-[10px] text-slate-500">Only possible in {formatP(o.share)} of these situations</div>}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-500">Your choices carry no odds. The odds come from what the world does next.</p>
          </section>
        )}

        {stop?.kind === 'end' && (
          <section className="space-y-3 rounded-xl border border-emerald-600/50 bg-gradient-to-br from-emerald-950/70 to-slate-900 p-5 shadow-xl">
            <div className="text-xs tracking-wider text-emerald-300 uppercase">The end · {labels.when(stop.from, stop.until)}</div>
            <Ending stop={stop} labels={labels} big />
            <p className="text-sm text-slate-300">
              Given the choices you made, the world turned out this way in <span className="font-semibold text-white">{formatP(pathP)}</span> of runs.
            </p>
            <div className="flex gap-2">
              <Button variant="primary" onClick={restart}>
                <RotateCcw size={13} /> Play again
              </Button>
              <Button onClick={back}>
                <Undo2 size={13} /> Step back
              </Button>
            </div>
          </section>
        )}
        <div ref={bottom} />
      </div>
    </div>
  );
}
